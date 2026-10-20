"""Détection et appel prudent d'ExifTool."""
import json
import os
import shutil
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def find_exiftool() -> str | None:
    """Cherche une installation système ou l'exécutable livré avec le projet."""
    configured = os.getenv("EXIFTOOL_PATH")
    local_dir = BASE_DIR / "ExifTool"
    # Accepte aussi l'archive Windows officielle extraite dans un sous-dossier.
    nested = sorted(
        (path for path in local_dir.rglob("exiftool*.exe") if path.parent != local_dir),
        reverse=True,
    ) if local_dir.exists() else []
    candidates = [configured, shutil.which("exiftool"), *(str(path) for path in nested),
                  str(local_dir / "exiftool.exe"), str(local_dir / "exiftool(-k).exe"), str(local_dir / "exiftool")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    return None


def exiftool_status() -> dict:
    """Retourne l'état disponible sans faire échouer le démarrage."""
    tool = find_exiftool()
    if not tool:
        return {"available": False, "version": None, "message": "ExifTool est absent ; l’analyse Pillow reste disponible pour les fichiers compatibles."}
    try:
        result = subprocess.run([tool, "-ver"], capture_output=True, text=True, timeout=5, check=False, shell=False)
        if result.returncode == 0:
            return {"available": True, "version": result.stdout.strip(), "message": "ExifTool prêt"}
    except (OSError, subprocess.TimeoutExpired):
        pass
    return {"available": False, "version": None, "message": "ExifTool est présent mais ne démarre pas correctement."}


def read_metadata(path: Path) -> dict:
    """Lit les groupes EXIF/IPTC/XMP et balises moins courantes en JSON."""
    tool = find_exiftool()
    if not tool:
        return {}
    try:
        result = subprocess.run([tool, "-json", "-G", "-n", "-a", "-u", "--", str(path)], capture_output=True, text=True, timeout=25, check=False, shell=False)
    except subprocess.TimeoutExpired as exc:
        raise ValueError("L’analyse ExifTool a dépassé le délai autorisé.") from exc
    except OSError as exc:
        raise ValueError("Impossible de démarrer ExifTool.") from exc
    if result.returncode != 0:
        raise ValueError("ExifTool n’a pas pu lire les métadonnées de ce fichier.")
    try:
        records = json.loads(result.stdout or "[]")
        return records[0] if records and isinstance(records[0], dict) else {}
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError("ExifTool a retourné des données illisibles.") from exc
