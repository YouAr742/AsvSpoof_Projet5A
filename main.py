from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware  # Importer le middleware CORS
import os
import shutil
import mimetypes

app = FastAPI()

# Configurer le middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tous les origines peuvent accéder a API
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_audio"
os.makedirs(TEMP_DIR, exist_ok=True)

@app.post("/upload_audio/")
async def upload_audio(file: UploadFile = File(...)):
    try:
        # Chemin du fichier temporaire
        temp_file_path = os.path.join(TEMP_DIR, file.filename)

        # Sauvegarder le fichier audio tel quel sans le traiter
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Obtenir le type MIME correct en fonction de l'extension du fichier
        mime_type, _ = mimetypes.guess_type(temp_file_path)

        #ecrire dans un log les infos du file

        # Retourner le fichier avec le bon Content-Type
        return FileResponse(temp_file_path, media_type=mime_type, filename=file.filename)
    
    except Exception as e:
        return {"error": str(e)}