/* Gestion de l'importation, de l'aperçu et des résultats en français. */
const fileInput = document.getElementById('fileInput');
const uploadPanel = document.getElementById('uploadPanel');
const selectedFile = document.getElementById('selectedFile');
const analyzeButton = document.getElementById('analyzeButton');
const progressWrap = document.getElementById('progressWrap');
const errorMessage = document.getElementById('errorMessage');
const results = document.getElementById('results');
let report = null;
let expanded = false;
let captureMetadataAvailable = true;
let previewUrl = null;
let progressTimer = null;
const analyzeButtonLabel = analyzeButton.innerHTML;

// Attend le chargement du visuel avant de le garder 1,5 seconde à l’écran.
const splashOverlay = document.getElementById('splash');
const splashPhoto = splashOverlay?.querySelector('.splash-full');
let splashDismissScheduled = false;
function dismissSplash() {
  if (!splashOverlay || splashDismissScheduled) return;
  splashDismissScheduled = true;
  window.setTimeout(() => splashOverlay.classList.add('is-closing'), 1000);
  window.setTimeout(() => splashOverlay.remove(), 1500);
}
if (splashPhoto && splashOverlay) {
  const onSplashReady = () => { splashOverlay.classList.add('has-photo'); dismissSplash(); };
  let splashFallbackTried = false;
  let splashLoadFallback;
  const showIllustratedFallback = () => {
    clearTimeout(splashLoadFallback);
    splashPhoto.remove();
    dismissSplash();
  };
  const trySplashFallback = () => {
    if (splashFallbackTried) {
      showIllustratedFallback();
      return;
    }
    splashFallbackTried = true;
    splashPhoto.src = splashPhoto.dataset.fallbackSrc;
    // Laisse aussi au PNG le temps de charger avant d'afficher le visuel de secours.
    splashLoadFallback = window.setTimeout(() => {
      if (!splashPhoto.complete || !splashPhoto.naturalWidth) showIllustratedFallback();
    }, 10000);
  };
  splashLoadFallback = window.setTimeout(() => {
    if (!splashPhoto.complete || !splashPhoto.naturalWidth) trySplashFallback();
  }, 10000);
  splashPhoto.addEventListener('load', () => { clearTimeout(splashLoadFallback); onSplashReady(); }, { once: true });
  splashPhoto.addEventListener('error', trySplashFallback);
  if (splashPhoto.complete) {
    clearTimeout(splashLoadFallback);
    if (splashPhoto.naturalWidth) onSplashReady(); else trySplashFallback();
  }
} else dismissSplash();
fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));
function selectFile(file) {
  if (!file) return;
  report = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  const previewWrap = document.getElementById('previewWrap');
  previewWrap.hidden = false;
  selectedFile.hidden = false;
  selectedFile.textContent = `Fichier : ${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} Mo`;
  const image = document.getElementById('previewImage');
  image.hidden = false;
  const previewInfo = document.getElementById('previewInfo');
  image.onerror = () => {
    image.hidden = true;
    previewInfo.replaceChildren();
    const message = document.createElement('span');
    message.textContent = 'Aperçu non disponible dans ce navigateur.';
    const note = document.createElement('small');
    note.className = 'preview-note';
    note.textContent = /\.(heic|heif)$/i.test(file.name)
      ? 'L’analyse des métadonnées continue quand même.'
      : 'L’analyse vérifiera si le fichier est lisible.';
    previewInfo.append(message, note);
  };
  image.onload = () => {
    previewWrap.hidden = false;
    previewInfo.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · aperçu prêt`;
  };
  image.src = previewUrl;
  analyzeButton.disabled = file.size === 0 || file.size > 15 * 1024 * 1024;
  errorMessage.hidden = file.size <= 15 * 1024 * 1024;
  if (!errorMessage.hidden) errorMessage.textContent = 'Le fichier dépasse la limite de 15 Mo.';
  results.hidden = true;
}
for (const type of ['dragenter', 'dragover']) uploadPanel.addEventListener(type, event => { event.preventDefault(); uploadPanel.classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) uploadPanel.addEventListener(type, event => { event.preventDefault(); uploadPanel.classList.remove('dragging'); });
uploadPanel.addEventListener('drop', event => { const file = event.dataTransfer.files[0]; if (file) { fileInput.files = event.dataTransfer.files; selectFile(file); } });

analyzeButton.addEventListener('click', async () => {
  const file = fileInput.files[0]; if (!file) return;
  errorMessage.hidden = true; results.hidden = true; progressWrap.hidden = false; analyzeButton.disabled = true;
  analyzeButton.innerHTML = 'Analyse en cours… <span>···</span>';
  document.getElementById('progressTitle').textContent = 'Analyse en cours…';
  document.getElementById('progressDetail').textContent = 'Vérification du fichier et lecture de ses métadonnées.';
  clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    document.getElementById('progressDetail').textContent = 'Ça prend un peu de temps. Laisse cette fenêtre ouverte pendant la lecture.';
  }, 8000);
  const data = new FormData(); data.append('file', file);
  const controller = new AbortController();
  const requestTimeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', body: data, signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Une erreur est survenue pendant l’analyse.');
    report = body; renderReport(body); results.hidden = false; results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { showError(error.name === 'AbortError' ? 'L’analyse dépasse 45 secondes. Réessaie avec une image plus petite ou vérifie que le serveur répond.' : (error.message || 'Impossible de joindre le serveur.')); }
  finally { clearTimeout(requestTimeout); clearTimeout(progressTimer); progressWrap.hidden = true; analyzeButton.innerHTML = analyzeButtonLabel; analyzeButton.disabled = !fileInput.files[0] || fileInput.files[0].size > 15 * 1024 * 1024; }
});
function showError(message) { errorMessage.textContent = message; errorMessage.hidden = false; }
function text(value) { if (value === null || value === undefined || value === '') return 'Non disponible'; return typeof value === 'object' ? JSON.stringify(value) : String(value); }
function el(tag, cls, value) { const node = document.createElement(tag); if (cls) node.className = cls; if (value !== undefined) node.textContent = value; return node; }
function renderReport(data) {
  document.getElementById('resultTitle').textContent = data.filename || 'Rapport d’analyse';
  document.getElementById('resultSubtitle').textContent = `${data.metadata_count} balises disponibles · ${data.format || 'image'} · ${(data.file_size_bytes / 1048576).toFixed(2)} Mo`;
  const summaryData = data.summary || {};
  const captureKeys = ['Fabricant', 'Modèle', 'Date de prise de vue', 'Objectif', 'Distance focale', 'Ouverture', 'Vitesse', 'ISO', 'Flash'];
  captureMetadataAvailable = captureKeys.some(key => summaryData[key] !== null && summaryData[key] !== undefined && summaryData[key] !== '') || hasUsableGps(data.gps);
  document.getElementById('metadataMissingNotice').hidden = captureMetadataAvailable;
  document.getElementById('simpleSummary').hidden = !captureMetadataAvailable;
  const warning = document.getElementById('analysisWarning'); warning.hidden = !data.warning; if (data.warning) warning.textContent = data.warning;
  const stats = document.getElementById('statsGrid'); stats.replaceChildren();
  const summary = summaryData;
  const gpsAvailable = hasUsableGps(data.gps);
  const cameraName = [summary['Fabricant'], summary['Modèle']].filter(value => value !== null && value !== undefined && value !== '').join(' ');
  for (const [label, value, sub] of [
    ['APPAREIL', cameraName ? `Photo prise avec ${cameraName}` : 'Appareil non identifié', cameraName ? 'Modèle indiqué dans le fichier photo' : 'La marque et le modèle ne sont pas enregistrés'],
    ['DATE', summary['Date de prise de vue'] || 'Date inconnue', summary['Date de prise de vue'] ? 'Date de prise de vue trouvée dans le fichier' : 'Aucune date de prise de vue exploitable'],
    ['LIEU', gpsAvailable ? 'Localisation disponible' : 'Localisation absente', gpsAvailable ? `${data.gps.latitude.toFixed(5)}, ${data.gps.longitude.toFixed(5)}` : 'Aucune coordonnée GPS complète dans le fichier']
  ]) { const card = el('div', 'stat'); card.append(el('div', 'stat-label', label), el('div', 'stat-value', text(value)), el('div', 'stat-sub', sub)); stats.append(card); }
  renderGps(data.gps || {});
  renderSummary('summaryList', summary, ['Nom du fichier', 'Format', 'Dimensions', 'Taille', 'Orientation', 'Résolution horizontale', 'Résolution verticale']);
  renderSummary('cameraList', summary, ['Fabricant', 'Modèle', 'Objectif', 'Logiciel', 'Auteur', 'Droits d’auteur', 'Commentaires'], 'cameraPanel');
  renderSummary('photoList', summary, ['Date de prise de vue', 'Distance focale', 'Ouverture', 'Vitesse', 'ISO', 'Flash'], 'photoSettingsPanel');
  document.getElementById('captureDetailsGrid').hidden = document.getElementById('cameraPanel').hidden && document.getElementById('photoSettingsPanel').hidden;
  renderMetadata(data.metadata || {}, '', captureMetadataAvailable);
}
function hasUsableGps(gps) {
  if (!gps || gps.available !== true || gps.latitude === null || gps.latitude === undefined || gps.longitude === null || gps.longitude === undefined) return false;
  const latitude = Number(gps.latitude), longitude = Number(gps.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
function renderGps(gps) {
  const panel = document.getElementById('gpsPanel'), grid = document.getElementById('gpsGrid');
  const details = document.getElementById('gpsDetails'), map = document.getElementById('map');
  const available = hasUsableGps(gps);
  panel.hidden = !available;
  grid.classList.toggle('gps-unavailable', !available);
  details.replaceChildren(); map.replaceChildren();
  if (!available) return;
  const coords = `${gps.latitude}, ${gps.longitude}`;
  for (const [key, value] of [['Latitude', gps.latitude], ['Longitude', gps.longitude], ['Altitude', gps.altitude], ['Direction', gps.direction]]) {
    if (value == null || value === '') continue;
    const line = el('div', 'gps-line'); line.append(el('span', '', key), el('span', '', text(value))); details.append(line);
  }
  const actions = el('div', 'gps-line'); const copy = el('button', 'secondary-button', 'Copier les coordonnées'); copy.type = 'button'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(coords); copy.textContent = 'Coordonnées copiées'; } catch { copy.textContent = coords; } });
  const link = el('a', 'map-link', 'Ouvrir dans Google Maps ↗'); link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`; link.target = '_blank'; link.rel = 'noreferrer'; actions.append(copy, link); details.append(actions);
  const apiKey = map.dataset.googleMapsApiKey;
  const privacyNote = document.getElementById('gpsPrivacyNote');
  if (apiKey) {
    // La clé est publique côté navigateur : la restreindre au domaine dans Google Cloud.
    const iframe = document.createElement('iframe'); iframe.title = 'Carte Google Maps de la position GPS'; iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.allowFullscreen = true;
    const query = new URLSearchParams({ key: apiKey, q: coords, zoom: '15' });
    iframe.src = `https://www.google.com/maps/embed/v1/place?${query.toString()}`;
    map.append(iframe);
    privacyNote.textContent = 'La carte intégrée est fournie par Google Maps et lui transmet les coordonnées GPS de cette photo. Le lien externe ci-dessous ouvre aussi cette position dans Google Maps.';
  } else {
    map.append(el('div', 'map-placeholder', 'La carte intégrée Google Maps n’est pas configurée. Le lien ci-dessous ouvrira la position dans Google Maps.'));
    privacyNote.textContent = 'Aucune carte Google n’est chargée pour le moment. Les coordonnées seront transmises à Google uniquement si tu ouvres le lien ci-dessous.';
  }
}
function renderSummary(target, summary, keys, panelId = null) {
  const list = document.getElementById(target); list.replaceChildren();
  const availableKeys = keys.filter(key => summary[key] !== null && summary[key] !== undefined && !(typeof summary[key] === 'string' && summary[key].trim() === ''));
  if (panelId) document.getElementById(panelId).hidden = availableKeys.length === 0;
  for (const key of availableKeys) { const row = el('div', 'summary-row'); row.append(el('div', 'summary-key', key), el('div', 'summary-value', text(summary[key]))); list.append(row); }
}
function renderMetadata(metadata, query = '', showFriendly = captureMetadataAvailable) {
  const list = document.getElementById('metadataList'); list.replaceChildren();
  const friendly = document.getElementById('metadataFriendly'); friendly.replaceChildren();
  const friendlyBlock = document.getElementById('metadataFriendlyBlock');
  const descriptions = {
    Make: ['Marque de l’appareil', 'Fabricant de l’appareil qui a créé la photo.'],
    Model: ['Modèle de l’appareil', 'Nom du téléphone ou de l’appareil photo.'],
    DateTimeOriginal: ['Date de prise de vue', 'Date enregistrée au moment de la photo.'],
    CreateDate: ['Date de création', 'Date indiquée dans les métadonnées du fichier.'],
    LensModel: ['Objectif', 'Modèle de l’objectif, lorsqu’il est indiqué.'],
    FocalLength: ['Distance focale', 'Champ de vision de l’objectif.'],
    FNumber: ['Ouverture', 'Ouverture du diaphragme pendant la prise de vue.'],
    ExposureTime: ['Temps de pose', 'Durée pendant laquelle le capteur a reçu la lumière.'],
    ISO: ['Sensibilité ISO', 'Sensibilité du capteur à la lumière.'],
    Flash: ['Flash', 'Indique si le flash a été utilisé.'],
    Orientation: ['Orientation', 'Sens dans lequel l’image doit être affichée.'],
    Software: ['Logiciel', 'Logiciel éventuellement utilisé pour créer ou modifier la photo.'],
    Artist: ['Auteur', 'Nom d’auteur renseigné dans le fichier, s’il existe.'],
    Copyright: ['Droits d’auteur', 'Mention de droits enregistrée dans la photo.'],
    ImageWidth: ['Largeur', 'Largeur de l’image en pixels.'],
    ImageHeight: ['Hauteur', 'Hauteur de l’image en pixels.'],
    GPSLatitude: ['Latitude GPS', 'Position nord-sud enregistrée par l’appareil.'],
    GPSLongitude: ['Longitude GPS', 'Position est-ouest enregistrée par l’appareil.']
  };
  const simpleRows = Object.entries(metadata).filter(([key, value]) => descriptions[key.split(':').pop()] && value !== null && value !== '');
  if (simpleRows.length && showFriendly) {
    friendlyBlock.hidden = false;
    for (const [key, value] of simpleRows) {
      const [label, explanation] = descriptions[key.split(':').pop()];
      const card = el('article', 'friendly-meta-card');
      card.append(el('b', '', label), el('span', '', formatMetadataValue(value)), el('small', '', explanation));
      friendly.append(card);
    }
  } else {
    friendlyBlock.hidden = true;
  }
  const rows = Object.entries(metadata).filter(([key, value]) => `${key} ${text(value)}`.toLowerCase().includes(query.toLowerCase()));
  document.getElementById('metadataCount').textContent = `${rows.length} balises`;
  if (!rows.length) { list.append(el('div', 'empty-state', 'Aucune balise ne correspond à la recherche.')); return; }
  for (const [key, value] of rows) {
    const bare = key.split(':').pop();
    const label = /^\d+$/.test(bare) ? `Champ technique ${bare}` : (descriptions[bare]?.[0] || bare.replace(/([a-z])([A-Z])/g, '$1 $2'));
    const item = el('div', `meta-item${expanded ? ' open' : ''}`), button = el('button', 'meta-toggle'); button.type = 'button';
    button.append(el('span', 'meta-key', label), el('span', 'meta-value-preview', formatMetadataValue(value)));
    const fullValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : formatMetadataValue(value);
    const full = el('div', 'meta-value', fullValue); button.addEventListener('click', () => item.classList.toggle('open')); item.append(button, full); list.append(item);
  }
}
function formatMetadataValue(value) {
  if (Array.isArray(value) && value.length > 12 && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) return `Données binaires (${value.length} octets)`;
  const cleaned = text(value).replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Valeur vide ou illisible';
}
document.getElementById('metadataSearch').addEventListener('input', event => renderMetadata(report?.metadata || {}, event.target.value, captureMetadataAvailable));
document.getElementById('expandAll').addEventListener('click', event => { expanded = !expanded; event.target.textContent = expanded ? 'Replier tout' : 'Déplier tout'; renderMetadata(report?.metadata || {}, document.getElementById('metadataSearch').value, captureMetadataAvailable); });
document.getElementById('jsonButton').addEventListener('click', () => { if (report) download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }), 'image-intelligence.json'); });
document.getElementById('csvButton').addEventListener('click', () => exportRequest('/api/export/csv', 'image-intelligence.csv'));
document.getElementById('pdfButton').addEventListener('click', () => exportRequest('/api/export/pdf', 'rapport-image-intelligence.pdf'));
async function exportRequest(url, filename) {
  if (!report) return;
  try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Échec de l’export.'); } download(await response.blob(), filename); }
  catch (error) { showError(error.message); }
}
function download(blob, filename) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
