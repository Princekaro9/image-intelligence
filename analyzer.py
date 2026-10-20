"""Analyse d'images avec Pillow et ExifTool, sans inventer de valeurs."""
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ExifTags, UnidentifiedImageError

try:
    # Active le décodeur facultatif lorsqu'il est installé par l'utilisateur.
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

from exiftool_manager import exiftool_status, read_metadata

PIL_TAGS = {value: key for key, value in ExifTags.TAGS.items()}
GPS_TAGS = ExifTags.GPSTAGS
SUPPORTED = {"JPEG", "PNG", "TIFF", "WEBP", "HEIF", "HEIC"}


def _json_value(value: Any) -> Any:
    """Convertit les types Pillow (rationnels, bytes) en types JSON simples."""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").rstrip("\x00")
    if hasattr(value, "numerator") and hasattr(value, "denominator"):
        return float(value) if value.denominator else None
    if isinstance(value, dict):
        return {str(k): _json_value(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [_json_value(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def pillow_read(path: Path) -> tuple[dict, dict]:
    """Valide l'image et récupère les tags EXIF standards avec Pillow."""
    try:
        with Image.open(path) as image:
            if image.format not in SUPPORTED:
                raise ValueError("Ce format n’est pas décodable par Pillow dans cette installation.")
            width, height = image.size
            exif = image.getexif()
            tags = {str(ExifTags.TAGS.get(tag, tag)): _json_value(value) for tag, value in exif.items()}
            gps_info = exif.get_ifd(ExifTags.IFD.GPSInfo) if ExifTags.IFD.GPSInfo in exif else {}
            if gps_info:
                tags["GPSInfo"] = {str(GPS_TAGS.get(k, k)): _json_value(v) for k, v in gps_info.items()}
            details = {"format": image.format, "width": width, "height": height, "mode": image.mode}
            return details, tags
    except UnidentifiedImageError as exc:
        raise ValueError("Le fichier n’est pas une image lisible ou il est endommagé.") from exc
    except OSError as exc:
        raise ValueError("Impossible d’ouvrir cette image ; elle est peut-être endommagée.") from exc


def _find(metadata: dict, *names: str):
    for key, value in metadata.items():
        if key.split(":")[-1] in names and value not in (None, ""):
            return value
    return None


def _decimal(value, ref=None):
    try:
        if isinstance(value, (int, float)):
            number = float(value)
        elif isinstance(value, (tuple, list)) and len(value) == 3:
            number = float(value[0]) + float(value[1]) / 60 + float(value[2]) / 3600
        else:
            return None
        return -abs(number) if str(ref).upper() in {"S", "W"} else number
    except (ValueError, TypeError, ZeroDivisionError):
        return None


def analyze_image(path: Path, filename: str, size: int) -> dict:
    """Combine l'analyse réelle Pillow et ExifTool, ExifTool prenant priorité."""
    exif_status = exiftool_status()
    warning = None
    metadata = {}
    if exif_status["available"]:
        try:
            metadata.update(read_metadata(path))
        except ValueError as exc:
            warning = f"ExifTool n’a pas pu terminer l’analyse ({exc}). Résultats Pillow uniquement."
    try:
        details, pillow_tags = pillow_read(path)
    except ValueError:
        # ExifTool sait lire certains HEIC/HEIF que Pillow ne décode pas.
        if not metadata:
            raise
        details = {"format": Path(filename).suffix.lstrip(".").upper(),
                   "width": _find(metadata, "ImageWidth", "ExifImageWidth"),
                   "height": _find(metadata, "ImageHeight", "ExifImageHeight"), "mode": None}
        if not details["width"] or not details["height"]:
            raise ValueError("Pillow ne peut pas décoder ce fichier et ExifTool n’a pas fourni ses dimensions.")
        pillow_tags = {}
    metadata.update(pillow_tags)
    if not exif_status["available"]:
        warning = exif_status["message"]
    width = _find(metadata, "ImageWidth", "ExifImageWidth") or details["width"]
    height = _find(metadata, "ImageHeight", "ExifImageHeight") or details["height"]
    orientation = _find(metadata, "Orientation")
    summary = {
        "Nom du fichier": filename, "Format": details["format"], "Dimensions": f"{width} × {height}",
        "Taille": f"{size / (1024 * 1024):.2f} Mo", "Orientation": orientation,
        "Résolution horizontale": _find(metadata, "XResolution"), "Résolution verticale": _find(metadata, "YResolution"),
        "Fabricant": _find(metadata, "Make"), "Modèle": _find(metadata, "Model"),
        "Date de prise de vue": _find(metadata, "DateTimeOriginal", "CreateDate", "DateCreated"),
        "Objectif": _find(metadata, "LensModel", "LensID"), "Distance focale": _find(metadata, "FocalLength"),
        "Ouverture": _find(metadata, "FNumber", "ApertureValue"), "Vitesse": _find(metadata, "ExposureTime", "ShutterSpeedValue"),
        "ISO": _find(metadata, "ISO", "PhotographicSensitivity"), "Flash": _find(metadata, "Flash"),
        "Logiciel": _find(metadata, "Software", "CreatorTool"), "Auteur": _find(metadata, "Artist", "Creator"),
        "Droits d’auteur": _find(metadata, "Copyright"), "Commentaires": _find(metadata, "Comment", "UserComment", "ImageDescription"),
    }
    lat, lon = _find(metadata, "GPSLatitude"), _find(metadata, "GPSLongitude")
    gps_nested = metadata.get("GPSInfo", {})
    if isinstance(gps_nested, dict):
        lat = lat if lat is not None else gps_nested.get("GPSLatitude")
        lon = lon if lon is not None else gps_nested.get("GPSLongitude")
        latref = _find(metadata, "GPSLatitudeRef") or gps_nested.get("GPSLatitudeRef")
        lonref = _find(metadata, "GPSLongitudeRef") or gps_nested.get("GPSLongitudeRef")
    else:
        latref, lonref = _find(metadata, "GPSLatitudeRef"), _find(metadata, "GPSLongitudeRef")
    latitude, longitude = _decimal(lat, latref), _decimal(lon, lonref)
    gps = {"available": latitude is not None and longitude is not None, "latitude": latitude, "longitude": longitude,
           "altitude": _find(metadata, "GPSAltitude") or gps_nested.get("GPSAltitude"),
           "direction": _find(metadata, "GPSImgDirection") or gps_nested.get("GPSImgDirection"),
           "latitude_raw": lat, "longitude_raw": lon}
    gps["map_url"] = f"https://www.openstreetmap.org/?mlat={latitude}&mlon={longitude}#map=15/{latitude}/{longitude}" if gps["available"] else None
    return {"filename": filename, "format": details["format"], "width": details["width"], "height": details["height"],
            "file_size_bytes": size, "analyzed_at_utc": datetime.now(timezone.utc).isoformat(), "summary": summary,
            "gps": gps, "metadata_count": len(metadata), "metadata": metadata, "warning": warning,
            "privacy_note": "Les images sont analysées localement sur cet ordinateur puis le fichier temporaire est supprimé."}
