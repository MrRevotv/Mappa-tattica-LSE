// La mappa Leaflet: immagine di sfondo, zoom, griglia tattica, ping con il doppio tocco.
// Le coordinate sono "pixel" di una mappa larga 1920: l'altezza segue le proporzioni dell'immagine.
import { app, emetti, invia } from './stato.js';
import { $, avviso, eTelefono } from './ui.js';
import { suonoPing } from './suoni.js';

const LARGHEZZA = 1920;
export let mappa;
let sfondo = null;
let limiti = [[0, 0], [1279, 1920]];
let zoomAdatto = 0;
let caricamento = 0;
const griglia = L.layerGroup();
const pingAttivi = new Map();

export const limitiAttuali = () => limiti;

export function creaMappa() {
    mappa = L.map('mappa', {
        crs: L.CRS.Simple,
        minZoom: -4,
        maxZoom: 3,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 100,
        zoomControl: false,
        attributionControl: false,
        doubleClickZoom: false, // il doppio tocco è il ping
        boxZoom: false,
        maxBoundsViscosity: 0.7,
    });
    mappa.fitBounds(limiti);

    mappa.on('zoomend', () => { if (app.stato?.grigliaAttiva) disegnaGriglia(); });
    mappa.on('resize', aggiornaZoomMinimo);
    mappa.on('click', (e) => emetti('mappa:clic', e));

    $('#zoom-piu').addEventListener('click', () => mappa.zoomIn());
    $('#zoom-meno').addEventListener('click', () => mappa.zoomOut());
    $('#centra').addEventListener('click', centra);
    ascoltaDoppioTocco();
    return mappa;
}

function aggiornaZoomMinimo() {
    zoomAdatto = mappa.getBoundsZoom(limiti, false, L.point(24, 24));
    mappa.setMinZoom(zoomAdatto - 1);
    mappa.setMaxBounds(L.latLngBounds(limiti).pad(0.5));
}

// La mappa intera nella parte che si vede davvero (accanto al pannello aperto, non sotto).
export function centra() {
    const { x0, x1, y0, y1 } = areaVisibile({ conScheda: false });
    const dim = mappa.getSize();
    mappa.fitBounds(limiti, { paddingTopLeft: [x0 + 12, y0 + 12], paddingBottomRight: [dim.x - x1 + 12, dim.y - y1 + 12], animate: true });
}

export function centroVisibile() {
    const { x0, x1, y0, y1 } = areaVisibile();
    return mappa.containerPointToLatLng([(x0 + x1) / 2, (y0 + y1) / 2]);
}

// Il rettangolo di mappa non coperto da pannello e scheda (in pixel della mappa).
export function areaVisibile({ conScheda = true } = {}) {
    const dim = mappa.getSize();
    const scatola = $('#mappa').getBoundingClientRect();
    let x0 = 0, x1 = dim.x, y0 = 0, y1 = dim.y;
    for (const coperta of [$('#pannello'), conScheda && $('#scheda')]) {
        if (!coperta || coperta.hidden) continue;
        const r = coperta.getBoundingClientRect();
        if (eTelefono()) y1 = Math.min(y1, r.top - scatola.top);
        else if (coperta.id === 'pannello') x0 = Math.max(x0, r.right - scatola.left);
        else x1 = Math.min(x1, r.left - scatola.left);
    }
    if (x1 - x0 < 120) { x0 = 0; x1 = dim.x; }
    if (y1 - y0 < 120) { y0 = 0; y1 = dim.y; }
    return { x0, x1, y0, y1 };
}

export function limitiDaImmagine(img) {
    return [[0, 0], [Math.round((LARGHEZZA * img.naturalHeight) / img.naturalWidth), LARGHEZZA]];
}

function caricaImmagine(url) {
    return new Promise((risolvi, rifiuta) => {
        const img = new Image();
        img.onload = () => risolvi(img);
        img.onerror = rifiuta;
        img.src = encodeURI(url);
    });
}

function mostraCaricamento(acceso) {
    caricamento += acceso ? 1 : -1;
    $('#caricamento-mappa').hidden = caricamento <= 0;
}

// Per chi cambia la mappa: scarica l'immagine e ne calcola le misure (che poi valgono per tutti).
export async function misuraMappa(url) {
    mostraCaricamento(true);
    try {
        return limitiDaImmagine(await caricaImmagine(url));
    } finally {
        mostraCaricamento(false);
    }
}

let ultimaRichiesta = 0;
let urlAttuale = '';
export async function impostaSfondo(url, nuoviLimiti) {
    // Stessa mappa di prima (es. dopo una riconnessione): niente da ricaricare, la vista resta dov'è.
    if (url === urlAttuale && JSON.stringify(nuoviLimiti) === JSON.stringify(limiti)) return;
    urlAttuale = url;
    const richiesta = ++ultimaRichiesta;
    mostraCaricamento(true);
    try {
        const img = await caricaImmagine(url);
        if (richiesta !== ultimaRichiesta) return;
        const b = nuoviLimiti || limitiDaImmagine(img);
        const nuovo = L.imageOverlay(img.src, b, { className: 'sfondo-mappa' }).addTo(mappa);
        nuovo.bringToBack();
        sfondo?.remove();
        sfondo = nuovo;
        limiti = b;
        aggiornaZoomMinimo();
        centra();
        if (app.stato?.grigliaAttiva) disegnaGriglia();
    } catch {
        if (richiesta === ultimaRichiesta) {
            urlAttuale = '';
            avviso('Questa mappa non si apre: forse il file è stato eliminato.', { tipo: 'errore' });
        }
    } finally {
        mostraCaricamento(false);
    }
}

// --- Griglia tattica: 10 colonne, righe quadrate quanto basta; A in alto, 1 a sinistra ---
export function disegnaGriglia() {
    griglia.clearLayers();
    if (!app.stato?.grigliaAttiva) {
        griglia.remove();
        return;
    }
    const [[, ], [H, W]] = limiti;
    const colonne = 10;
    const largo = W / colonne;
    const righe = Math.max(1, Math.round(H / largo));
    const alto = H / righe;
    const dettagli = mappa.getZoom() >= zoomAdatto + 1.25;
    // Con caselle troppo piccole sullo schermo (telefono, mappa lontana) i nomi si leggerebbero male: restano le linee.
    const latoSchermo = mappa.latLngToContainerPoint([0, largo]).x - mappa.latLngToContainerPoint([0, 0]).x;
    const conNomi = latoSchermo >= 44;
    const linea = { color: 'rgba(241,238,230,0.45)', weight: 1.5, interactive: false };
    const lineaFine = { color: 'rgba(241,238,230,0.2)', weight: 1, dashArray: '5 5', interactive: false };

    for (let c = 0; c <= colonne; c++) L.polyline([[0, c * largo], [H, c * largo]], linea).addTo(griglia);
    for (let r = 0; r <= righe; r++) L.polyline([[r * alto, 0], [r * alto, W]], linea).addTo(griglia);
    if (dettagli) {
        for (let c = 0; c < colonne; c++) L.polyline([[0, (c + 0.5) * largo], [H, (c + 0.5) * largo]], lineaFine).addTo(griglia);
        for (let r = 0; r < righe; r++) L.polyline([[(r + 0.5) * alto, 0], [(r + 0.5) * alto, W]], lineaFine).addTo(griglia);
    }

    for (let r = 0; r < righe; r++) {
        const lettera = String.fromCharCode(65 + r);
        const alto0 = H - r * alto; // il bordo alto della riga
        for (let c = 0; c < colonne; c++) {
            const x0 = c * largo;
            if (!conNomi) continue;
            L.marker([alto0 - alto / 2, x0 + largo / 2], {
                icon: L.divIcon({ html: `${lettera}${c + 1}`, className: 'etichetta-griglia', iconSize: [44, 20] }),
                interactive: false,
                keyboard: false,
            }).addTo(griglia);
            if (dettagli) {
                const sotto = [[1, 0.25, 0.25], [2, 0.75, 0.25], [3, 0.25, 0.75], [4, 0.75, 0.75]];
                for (const [n, fx, fy] of sotto) {
                    L.marker([alto0 - alto * fy, x0 + largo * fx], {
                        icon: L.divIcon({ html: String(n), className: 'etichetta-griglia-sub', iconSize: [20, 20] }),
                        interactive: false,
                        keyboard: false,
                    }).addTo(griglia);
                }
            }
        }
    }
    griglia.addTo(mappa);
}

export function visioneNotturna(accesa) {
    $('#mappa').classList.toggle('notte', accesa);
}

// --- Ping ---
const COLORI_PING = { admin: '#ff4444', responsabile: '#4f7bff' };

export function mostraPing(lat, lng, { ruolo, nome, chiave }) {
    const colore = COLORI_PING[ruolo] || '#44ff44';
    const vecchio = pingAttivi.get(chiave);
    if (vecchio) {
        vecchio.marker.remove();
        clearTimeout(vecchio.timer);
    }
    const el = document.createElement('div');
    el.className = 'ping';
    el.style.setProperty('--c', colore);
    el.append(Object.assign(document.createElement('span'), { className: 'ping-onda' }));
    el.append(Object.assign(document.createElement('span'), { className: 'ping-onda' }));
    el.append(Object.assign(document.createElement('span'), { className: 'ping-nome', textContent: nome }));
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({ html: el, className: 'ping-wrapper', iconSize: [80, 80], iconAnchor: [40, 40] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 3000,
    }).addTo(mappa);
    const timer = setTimeout(() => {
        marker.remove();
        pingAttivi.delete(chiave);
    }, 10000);
    pingAttivi.set(chiave, { marker, timer });
    suonoPing();
}

// Doppio tocco o doppio clic su un punto vuoto della mappa = ping (non sulle icone, non mentre si disegna).
function ascoltaDoppioTocco() {
    const contenitore = $('#mappa');
    const attivi = new Set();
    let pizzico = false;
    let inizio = null;
    let ultimo = { t: 0, x: 0, y: 0 };

    contenitore.addEventListener('pointerdown', (e) => {
        attivi.add(e.pointerId);
        if (attivi.size > 1) pizzico = true;
        inizio = { x: e.clientX, y: e.clientY };
    }, true);

    const fine = (e) => {
        attivi.delete(e.pointerId);
        if (e.type === 'pointercancel' || pizzico) {
            if (attivi.size === 0) pizzico = false;
            ultimo.t = 0;
            return;
        }
        if (!inizio || Math.hypot(e.clientX - inizio.x, e.clientY - inizio.y) > 12) { ultimo.t = 0; return; }
        if (e.target.closest('.leaflet-marker-icon') || contenitore.classList.contains('disegnando') || e.button > 0) { ultimo.t = 0; return; }
        const adesso = performance.now();
        if (adesso - ultimo.t < 380 && Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y) < 32) {
            ultimo.t = 0;
            const punto = mappa.mouseEventToLatLng(e);
            mostraPing(punto.lat, punto.lng, { ruolo: app.utente.ruolo, nome: app.utente.nome, chiave: app.utente.id });
            invia('ping', { lat: punto.lat, lng: punto.lng });
        } else {
            ultimo = { t: adesso, x: e.clientX, y: e.clientY };
        }
    };
    contenitore.addEventListener('pointerup', fine, true);
    contenitore.addEventListener('pointercancel', fine, true);
}
