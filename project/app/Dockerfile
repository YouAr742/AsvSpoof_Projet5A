# Utiliser une image de base avec Python 3.8
FROM python:3.8-slim

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers nécessaires dans le conteneur
COPY . .

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Installer les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Exposer le port sur lequel l'application FastAPI écoute
EXPOSE 8000

# Commande pour démarrer l'application FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]