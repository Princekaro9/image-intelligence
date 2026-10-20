# Image Intelligence

**IMAGE INTELLIGENCE — PHOTO METADATA ANALYZER** est une application web en français. Elle lit les métadonnées photo avec Pillow et ExifTool. En local, la photo reste sur l'ordinateur. En mode hébergé, le navigateur envoie la photo au serveur de l'application pour l'analyse ; le fichier temporaire est ensuite supprimé. Aucun service d'analyse d'image tiers n'est appelé.

## Architecture retenue

- `app.py` : serveur Flask, validation des imports et routes d'export.
- `analyzer.py` : lecture Pillow/ExifTool, métadonnées, GPS et résumé.
- `exiftool_manager.py` : détection et lancement sécurisé d'ExifTool.
- `exporters.py` : génération en mémoire des exports CSV et PDF.
- `templates/index.html` : interface, aperçu et écran d'ouverture ZONE 4.
- `static/style.css` : style responsive anthracite, laiton et sauge, accordé au fond photo.
- `static/app.js` : import, aperçu, interactions, recherche et téléchargements.

## Installer et démarrer sous Windows (PowerShell)

Dans le dossier du projet :

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Le navigateur s'ouvre automatiquement sur <http://127.0.0.1:5000>. Si nécessaire, ouvre cette adresse manuellement. Si l'activation est bloquée dans PowerShell :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## ExifTool

L'application cherche ExifTool dans `ExifTool\exiftool.exe`, puis dans le PATH. Pour spécifier un autre emplacement :

```powershell
$env:EXIFTOOL_PATH = 'C:\Tools\ExifTool\exiftool.exe'
python app.py
```

Télécharge le paquet Windows complet depuis [exiftool.org](https://exiftool.org/). Si le fichier se nomme `exiftool(-k).exe`, renomme-le en `exiftool.exe` et garde ses fichiers auxiliaires éventuels. Un exécutable isolé peut être insuffisant. Pillow continue l'analyse des formats compatibles si ExifTool manque.

## HEIC / HEIF

La lecture varie selon les codecs. ExifTool peut fournir certaines métadonnées même si Pillow ne décode pas l'aperçu. Pour ajouter un décodeur à Pillow, essaie :

```powershell
pip install pillow-heif
```

La disponibilité du module dépend de la version Python et des codecs installés.

## Utiliser et vérifier

1. Choisis une image ou dépose-la dans la zone d'import.
2. Vérifie son aperçu, ses dimensions et sa taille avant l'analyse.
3. Consulte les informations de l'appareil, les paramètres photo, le GPS et les balises techniques.
4. Recherche une balise puis exporte JSON, CSV ou le rapport PDF.

L'état d'ExifTool est disponible sur <http://127.0.0.1:5000/health>. Essaie une photo originale, une image sans EXIF, un fichier avec GPS, un fichier de plus de 15 Mo et un fichier texte renommé en `.jpg`. Les données GPS peuvent être absentes ou inexactes.

L'aperçu cartographique OpenStreetMap et son lien apparaissent uniquement lorsque les coordonnées sont dans le fichier. Dans ce cas, le navigateur contacte OpenStreetMap. Aucune adresse n'est recherchée.

## Confidentialité et sécurité

- Taille maximale de photo : 15 Mo.
- Les noms sont nettoyés; les chemins temporaires sont générés par le système.
- Le fichier temporaire est supprimé après chaque analyse.
- Pas de base de données ni d'envoi automatique à une API d'analyse tierce. En mode hébergé, la photo est envoyée au serveur de l'application et son fichier temporaire est supprimé après l'analyse.
- ExifTool utilise des arguments séparés, sans shell, avec un délai maximal.
- Flask écoute sur `127.0.0.1`, uniquement sur cet ordinateur.

## Héberger l'application pour les utilisateurs

Les utilisateurs n'ont rien à installer : ils ouvrent simplement l'adresse web de l'application et choisissent une photo. L'hébergement exécute Python, Pillow et ExifTool côté serveur. Pour un déploiement Docker, le conteneur installe ExifTool et Waitress ; il sert l'application avec `PUBLIC_MODE=1` afin que l'interface annonce clairement que la photo est envoyée au serveur. Le `Dockerfile` est prêt à être déployé sur une plateforme compatible Docker. Il faut encore créer/configurer un service chez un hébergeur et y publier le projet pour obtenir une adresse publique ; aucune adresse publique n'est configurée dans ce projet.

Un hébergement public implique que l'image traverse Internet et est traitée sur le serveur choisi. Pour protéger les utilisateurs, configure HTTPS, limite l'accès aux journaux, garde la limite de 15 Mo et choisis un hébergeur dont les règles de conservation te conviennent. L'application lit les métadonnées présentes dans l'image ; elle ne fait pas de recherche inversée d'image sur Internet.

## Visuels ZONE 4

L'écran d'ouverture « ZONE 4 » apparaît 1,5 seconde. Le visuel fourni est dans `static/images/splash-zone4.png`; la photo de l'appareil est utilisée en arrière-plan depuis `static/images/app-background.jpg`. Remplace ces deux fichiers par tes versions finales si tu souhaites les modifier.
