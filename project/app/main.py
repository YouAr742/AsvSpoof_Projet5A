import json
import torch
import torchaudio
import numpy as np
from torch import nn
import torch.nn.functional as F
from fastapi import FastAPI, UploadFile, HTTPException, File
import nest_asyncio
import uvicorn
from model_utils import Model  # Assurez-vous que la classe Model est correctement importée
import os
import soundfile as sf
import io
import tempfile
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Union
from calculate_modules import compute_eer  # Importer la fonction compute_eer

# App FastAPI
app = FastAPI()

# Configurer CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Autorise toutes les origines (peut être restreint)
    allow_credentials=True,
    allow_methods=["*"],  # Autorise toutes les méthodes HTTP
    allow_headers=["*"],  # Autorise tous les en-têtes
)

# Charger la configuration du modèle
def load_config(config_path):
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Erreur lors du chargement de la configuration : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du chargement de la configuration: {e}")

# Charger le modèle
def load_model(checkpoint_path, d_args):
    model = Model(d_args)
    try:
        # Load checkpoint
        checkpoint = torch.load(checkpoint_path, map_location=torch.device('cpu'))
        model.load_state_dict(checkpoint)
        print("Model loaded successfully.")
    except Exception as e:
        print(f"Error loading model: {e}")
        raise
    model.eval()
    return model

# Prétraiter l'audio
def preprocess_audio(audio_path, sample_rate=16000):
    try:
        print(f"Chargement de l'audio: {audio_path}")
        waveform, sr = torchaudio.load(audio_path)
        print(f"Audio chargé: {audio_path}, Taux d'échantillonnage: {sr}")
        if sr != sample_rate:
            resample_transform = torchaudio.transforms.Resample(orig_freq=sr, new_freq=sample_rate)
            waveform = resample_transform(waveform)
        if waveform.size(0) > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)  # Convertir en mono si stéréo
        return waveform
    except Exception as e:
        print(f"Erreur dans le prétraitement audio : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur dans le prétraitement de l'audio: {e}")

def infer(model, waveform, freq_aug=False):
    try:
        with torch.no_grad():
            last_hidden, output = model(waveform, Freq_aug=freq_aug)
            print("Sortie du modèle:", output)
            if output is None:
                raise ValueError("La sortie du modèle est nulle.")
            probabilities = F.softmax(output, dim=1)
            predicted_label = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0].tolist()  # Liste des probabilités pour toutes les classes
            max_confidence = 1 - max(confidence)  # La probabilité la plus élevée
            return predicted_label, max_confidence  # Retourner également la probabilité la plus élevée
    except Exception as e:
        print(f"Erreur pendant l'inférence : {e}")
        raise

# Charger le modèle d'exemple
config_path = "./AASIST_ASVspoof5_Exp4_CL.conf"  # Remplacez par le chemin réel de votre fichier de config
config = load_config(config_path)
d_args = config["model_config"]
checkpoint_path = "./Ex4_CLspeaker_sampler_eer0.164.pth"  # Remplacez par votre checkpoint
model = load_model(checkpoint_path, d_args)

@app.post("/predict/")
async def predict(files: Union[List[UploadFile], UploadFile] = File(...)):
    # Si un seul fichier est uploadé, le convertir en liste pour un traitement uniforme
    if not isinstance(files, list):
        files = [files]

    responses = []
    bonafide_scores = []
    spoof_scores = []

    for file in files:
        try:
            print(f"Processing file: {file.filename}")

            # Sauvegarder temporairement le fichier audio
            temp_audio_path = f"{file.filename}"
            print(temp_audio_path)
            with open(temp_audio_path, "wb") as f:
                f.write(await file.read())

            # Prétraiter le fichier audio
            waveform = preprocess_audio(temp_audio_path)

            # Effectuer l'inférence
            label, confidence = infer(model, waveform)

            # Stocker les scores pour le calcul de l'EER
            if label == 0:  # Bonafide
                bonafide_scores.append(confidence)
            else:  # Spoof
                spoof_scores.append(confidence)

            # Interpréter le label
            response = {
                "filename": file.filename,
                "label": "Genuine" if label == 0 else "Spoof",
                "confidence": confidence
            }
            responses.append(response)
        except Exception as e:
            responses.append({
                "filename": file.filename,
                "error": str(e)
            })

    # Afficher les scores collectés pour déboguer
    print("Scores bonafide :", bonafide_scores)
    print("Scores spoof :", spoof_scores)

    # Calculer l'EER si nous avons des scores pour bonafide et spoof
    if bonafide_scores and spoof_scores:
        eer, _, _, _ = compute_eer(np.array(bonafide_scores), np.array(spoof_scores))
        eer_percentage = eer * 100
        responses.append({
            "EER": f"{eer_percentage:.2f}%"
        })
        print(f"EER calculé : {eer_percentage:.2f}%")  # Afficher l'EER dans la console
    else:
        print("Pas assez de données pour calculer l'EER.")

    return responses

# Exécuter le serveur FastAPI dans Colab
nest_asyncio.apply()
import uvicorn
uvicorn.run(app, host="0.0.0.0", port=8000)