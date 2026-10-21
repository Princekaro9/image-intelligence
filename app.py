"""Serveur Flask local d'Image Intelligence."""
from __future__ import annotations

import io
import json
import os
import tempfile
import threading
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from analyzer import analyze_image
from exiftool_manager import exiftool_status
from exporters import make_csv, make_pdf

BASE_DIR = Path(__file__).resolve().parent
MAX_FILE_BYTES = 15 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic", ".heif"}
app = Flask(__name__)
app.config.update(MAX_CONTENT_LENGTH=MAX_FILE_BYTES + 1024 * 1024, JSON_AS_ASCII=False, TEMPLATES_AUTO_RELOAD=True)
PUBLIC_MODE = os.getenv("PUBLIC_MODE", "0").lower() in {"1", "true", "yes"}
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


@app.after_request
def security_headers(response):
    """Réduit les risques courants pour une application locale."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://www.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    return response


@app.get("/")
def home():
    return render_template("index.html", exiftool=exiftool_status(), public_mode=PUBLIC_MODE,
                           google_maps_api_key=GOOGLE_MAPS_API_KEY)


@app.post("/api/analyze")
def analyze():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify(error="Choisis une image avant de lancer l’analyse."), 400
    filename = secure_filename(upload.filename) or "image"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify(error="Format non pris en charge. Choisis une image JPG, PNG, TIFF, WEBP ou HEIC."), 415
    content = upload.stream.read(MAX_FILE_BYTES + 1)
    if not content:
        return jsonify(error="Le fichier sélectionné est vide."), 400
    if len(content) > MAX_FILE_BYTES:
        return jsonify(error="Le fichier dépasse la limite de 15 Mo."), 413
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="image_intelligence_", suffix=suffix, delete=False) as temp:
            temp.write(content)
            temp_path = Path(temp.name)
        result = analyze_image(temp_path, filename, len(content))
        return jsonify(result)
    except ValueError as exc:
        return jsonify(error=str(exc)), 422
    except Exception:
        # Aucun nom de fichier ni métadonnée personnelle n'est ajouté aux journaux.
        return jsonify(error="L’analyse a échoué. Le fichier est peut-être endommagé ou illisible."), 500
    finally:
        if temp_path:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass
        del content


@app.post("/api/export/csv")
def export_csv():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload.get("metadata"), dict):
        return jsonify(error="Rapport incomplet pour créer le CSV."), 400
    try:
        stream = io.BytesIO(make_csv(payload))
        return send_file(stream, mimetype="text/csv", as_attachment=True, download_name="image-intelligence.csv")
    except Exception:
        return jsonify(error="La création du fichier CSV a échoué."), 500


@app.post("/api/export/pdf")
def export_pdf_route():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload.get("metadata"), dict):
        return jsonify(error="Rapport incomplet pour créer le PDF."), 400
    try:
        stream = io.BytesIO(make_pdf(payload))
        return send_file(stream, mimetype="application/pdf", as_attachment=True, download_name="rapport-image-intelligence.pdf")
    except Exception:
        return jsonify(error="La création du rapport PDF a échoué."), 500


@app.errorhandler(RequestEntityTooLarge)
def too_large(_error):
    return jsonify(error="Le fichier dépasse la limite autorisée de 15 Mo."), 413


@app.get("/health")
def health():
    return jsonify(status="ok", exiftool=exiftool_status(), max_upload_mb=15)


if __name__ == "__main__":
    # Serveur uniquement local; le mode debug est désactivé par défaut.
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    if host == "127.0.0.1":
        url = f"http://127.0.0.1:{port}/"
        print(f"L’interface s’ouvrira dans ton navigateur : {url}")
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host=host, port=port, debug=False)
