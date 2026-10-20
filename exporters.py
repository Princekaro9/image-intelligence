"""Création de rapports CSV et PDF en mémoire."""
import csv
import io
import json


def make_csv(report: dict) -> bytes:
    """Exporte les balises complètes en CSV compatible avec Excel."""
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["Balise", "Valeur"])
    for key, value in report.get("metadata", {}).items():
        writer.writerow([key, json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value])
    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def make_pdf(report: dict) -> bytes:
    """Génère un rapport lisible et ses métadonnées sans créer de fichier sur disque."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="SmallWrap", parent=styles["BodyText"], fontSize=7, leading=9, wordWrap="CJK"))
    safe = lambda value: str(value if value is not None else "Non disponible").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    story = [Paragraph("IMAGE INTELLIGENCE — Rapport d’analyse", styles["Title"]), Spacer(1, 10), Paragraph("Fichier : " + safe(report.get("filename")), styles["Heading2"]), Paragraph("Résumé", styles["Heading2"])]
    rows = [["Champ", "Valeur"]] + [[Paragraph(safe(k), styles["SmallWrap"]), Paragraph(safe(v), styles["SmallWrap"])] for k, v in report.get("summary", {}).items()]
    table = Table(rows, colWidths=[5*cm, 11*cm], repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#172554")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .3, colors.HexColor("#CBD5E1")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 5)]))
    story.extend([table, Spacer(1, 10), Paragraph("Toutes les métadonnées", styles["Heading2"])])
    meta = [["Balise", "Valeur"]] + [[Paragraph(safe(k), styles["SmallWrap"]), Paragraph(safe(json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v)[:1800], styles["SmallWrap"])] for k, v in report.get("metadata", {}).items()]
    mt = Table(meta, colWidths=[5*cm, 11*cm], repeatRows=1)
    mt.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#E2E8F0")), ("GRID", (0,0), (-1,-1), .25, colors.HexColor("#CBD5E1")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("PADDING", (0,0), (-1,-1), 4)]))
    story.extend([mt, Spacer(1, 10), Paragraph(safe(report.get("privacy_note")), styles["SmallWrap"])])
    doc.build(story)
    return buffer.getvalue()
