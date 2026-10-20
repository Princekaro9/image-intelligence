"""Lancement du serveur WSGI Waitress pour un hébergement web."""
import os

from waitress import serve

from app import app


if __name__ == "__main__":
    # Le port est fourni par la plupart des plateformes d'hébergement.
    port = int(os.getenv("PORT", "5000"))
    serve(app, host="0.0.0.0", port=port, threads=8)
