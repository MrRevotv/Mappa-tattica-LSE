// La lavagna sopra la mappa: matita (con le forme "intelligenti"), gomma, testo, annulla, cancella tutto.
// Funziona con mouse, dito e Apple Pencil (eventi "pointer"). I disegni viaggiano come GeoJSON, come prima.
import { app, emetti, invia, on } from './stato.js';
import { mappa } from './mappa.js';
import { $, crea, conferma, chiediTesto } from './ui.js';

export const disegni = L.featureGroup();
const COLORI = [
    ['#ff4444', 'Rosso'],
    ['#44ff44', 'Verde'],
    ['#4488ff', 'Blu'],
    ['#ffff44', 'Giallo'],
    ['#ffffff', 'Bianco'],
    ['#ff8c00', 'Arancio'],
];
const AIUTI = {
    matita: 'Disegna con il dito o il mouse. Fermati un attimo a fine tratto per avere un cerchio, un rettangolo o una freccia.',
    gomma: 'Passa sopra un disegno o un testo per cancellarlo.',
    testo: 'Tocca la mappa dove vuoi scrivere.',
    nessuno: 'Nessuno strumento acceso: puoi spostare la mappa e i testi. Scegline uno per disegnare.',
};
const SOSTA_FORMA_MS = 600;

let strumento = null;
let colore = COLORI[0][0];
let tratto = null; // { linea, punti, ultimoPixel, timer }
const contenitore = () => $('#mappa');

export const barraAperta = () => !$('#barra-disegno').hidden;

// --- Da e verso GeoJSON ---
function creaTesto(latlng, testo, coloreTesto) {
    const div = document.createElement('div');
    div.textContent = testo;
    div.style.setProperty('--c', coloreTesto);
    const m = L.marker(latlng, {
        icon: L.divIcon({ html: div, className: 'testo-libero', iconSize: [0, 0] }),
        draggable: app.comando && !strumento,
        keyboard: false,
    });
    m.feature = { type: 'Feature', properties: { isText: true, testo, color: coloreTesto } };
    m.on('dragend', salva);
    return m;
}

function daGeoJSON(g) {
    const inCorso = tratto?.linea;
    disegni.clearLayers();
    if (g) {
        L.geoJSON(g, {
            pointToLayer: (f, latlng) => creaTesto(latlng, f.properties.testo || '', f.properties.color || '#ffffff'),
            style: (f) => ({ color: f.properties.color || '#ff4444', weight: 4, fillOpacity: f.geometry.type === 'Polygon' ? 0.1 : 0 }),
            onEachFeature: (f, layer) => disegni.addLayer(layer),
        });
    }
    // Se arriva un aggiornamento mentre stai disegnando, il tuo tratto resta.
    if (inCorso) disegni.addLayer(inCorso);
}

function salva() {
    const g = disegni.getLayers().length ? disegni.toGeoJSON(1) : null;
    if (app.stato) app.stato.disegni = g;
    invia('disegni', g);
}

export function mostraDisegni(g) {
    daGeoJSON(g);
}

// --- Strumenti ---
export function apriBarra() {
    if (!app.comando) return;
    $('#barra-disegno').hidden = false;
    document.body.classList.add('disegno-aperto');
    scegliStrumento(strumento || 'matita');
}

export function chiudiBarra() {
    scegliStrumento(null);
    $('#barra-disegno').hidden = true;
    document.body.classList.remove('disegno-aperto');
    emetti('disegno:chiuso');
}

function scegliStrumento(nuovo) {
    if (tratto) fineTratto();
    strumento = nuovo;
    const c = contenitore();
    c.classList.toggle('disegnando', Boolean(nuovo));
    c.classList.toggle('gomma', nuovo === 'gomma');
    c.classList.toggle('testo', nuovo === 'testo');
    for (const b of $('#barra-disegno').querySelectorAll('[data-strumento]')) b.setAttribute('aria-checked', String(b.dataset.strumento === nuovo));
    $('#aiuto-disegno').textContent = AIUTI[nuovo || 'nessuno'];
    if (nuovo) mappa.dragging.disable();
    else mappa.dragging.enable();
    aggiornaTrascinabiliTesti();
}

function aggiornaTrascinabiliTesti() {
    disegni.eachLayer((l) => {
        if (!(l instanceof L.Marker)) return;
        if (app.comando && !strumento) l.dragging?.enable();
        else l.dragging?.disable();
    });
}

// --- Matita ---
function inizioTratto(latlng, pixel) {
    const linea = L.polyline([latlng], { color: colore, weight: 4 });
    linea.feature = { type: 'Feature', properties: { color: colore } };
    disegni.addLayer(linea);
    tratto = { linea, punti: [latlng], ultimoPixel: pixel, timer: null };
}

function continuaTratto(latlng, pixel) {
    if (!tratto || pixel.distanceTo(tratto.ultimoPixel) < 3) return;
    tratto.punti.push(latlng);
    tratto.ultimoPixel = pixel;
    tratto.linea.setLatLngs(tratto.punti);
    clearTimeout(tratto.timer);
    tratto.timer = setTimeout(formaIntelligente, SOSTA_FORMA_MS);
}

function fineTratto() {
    if (!tratto) return;
    clearTimeout(tratto.timer);
    if (tratto.punti.length < 2) disegni.removeLayer(tratto.linea);
    tratto = null;
    salva();
}

function annullaTratto() {
    if (!tratto) return;
    clearTimeout(tratto.timer);
    disegni.removeLayer(tratto.linea);
    tratto = null;
}

// Fermandosi a fine tratto la linea diventa una forma pulita (stesso calcolo della mappa di prima):
// figura chiusa → cerchio, quadrato o rettangolo; quasi dritta → freccia; curva → curva morbida con freccia.
function formaIntelligente() {
    if (!tratto || tratto.punti.length < 15) return;
    const punti = tratto.punti;
    const c = tratto.linea.feature.properties.color;
    const inizio = punti[0];
    const fine = punti[punti.length - 1];
    const distanza = (a, b) => Math.hypot(b.lat - a.lat, b.lng - a.lng);
    let lunghezza = 0;
    for (let i = 1; i < punti.length; i++) lunghezza += distanza(punti[i - 1], punti[i]);
    const rapporto = distanza(inizio, fine) / lunghezza;
    const freccia = (da, a) => {
        const angolo = Math.atan2(a.lat - da.lat, a.lng - da.lng);
        const punta = 25;
        return [
            L.latLng(a.lat - punta * Math.sin(angolo - Math.PI / 6), a.lng - punta * Math.cos(angolo - Math.PI / 6)),
            L.latLng(a.lat, a.lng),
            L.latLng(a.lat - punta * Math.sin(angolo + Math.PI / 6), a.lng - punta * Math.cos(angolo + Math.PI / 6)),
        ];
    };
    let forma;
    if (rapporto < 0.25) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const p of punti) {
            minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
            minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
        }
        const alto = maxLat - minLat, largo = maxLng - minLng;
        const cLat = minLat + alto / 2, cLng = minLng + largo / 2;
        const proporzione = alto / largo;
        const rettangolo = [[minLat, minLng], [maxLat, minLng], [maxLat, maxLng], [minLat, maxLng]];
        if (proporzione > 0.75 && proporzione < 1.25) {
            const raggio = (alto + largo) / 4;
            const agliAngoli = punti.filter((p) => Math.hypot(p.lat - cLat, p.lng - cLng) > raggio * 1.15).length;
            if (agliAngoli > punti.length * 0.12) {
                forma = L.polygon(rettangolo);
            } else {
                const cerchio = [];
                for (let i = 0; i <= 36; i++) {
                    const a = (i * 10 * Math.PI) / 180;
                    cerchio.push([cLat + raggio * Math.sin(a), cLng + raggio * Math.cos(a)]);
                }
                forma = L.polygon(cerchio);
            }
        } else {
            forma = L.polygon(rettangolo);
        }
    } else if (rapporto > 0.85) {
        forma = L.polyline([inizio, fine, ...freccia(inizio, fine)]);
    } else {
        const finestra = 5;
        const morbidi = punti.map((p, i) => {
            if (i < finestra || i >= punti.length - finestra) return p;
            let lat = 0, lng = 0;
            for (let j = -finestra; j <= finestra; j++) { lat += punti[i + j].lat; lng += punti[i + j].lng; }
            return L.latLng(lat / (finestra * 2 + 1), lng / (finestra * 2 + 1));
        });
        const da = morbidi[morbidi.length - Math.min(6, morbidi.length - 1)];
        const a = morbidi[morbidi.length - 1];
        forma = L.polyline([...morbidi, ...freccia(da, a)]);
    }
    forma.setStyle({ color: c, weight: 4, fillOpacity: forma instanceof L.Polygon ? 0.1 : 0 });
    forma.feature = { type: 'Feature', properties: { color: c, isShape: true } };
    disegni.removeLayer(tratto.linea);
    disegni.addLayer(forma);
    clearTimeout(tratto.timer);
    tratto = null;
    salva();
}

// --- Gomma: cancella il disegno più vicino al dito (entro 14 px) ---
function anelli(latlngs) {
    if (!latlngs.length) return [];
    return L.LineUtil.isFlat(latlngs) ? [latlngs] : latlngs.flatMap(anelli);
}

function disegnoSotto(pixel) {
    let trovato = null;
    disegni.eachLayer((l) => {
        if (trovato) return;
        if (l instanceof L.Marker) {
            const testo = l.getElement()?.firstElementChild;
            const r = testo?.getBoundingClientRect();
            const scatola = contenitore().getBoundingClientRect();
            if (r && pixel.x >= r.left - scatola.left - 8 && pixel.x <= r.right - scatola.left + 8 && pixel.y >= r.top - scatola.top - 8 && pixel.y <= r.bottom - scatola.top + 8) trovato = l;
            return;
        }
        const chiuso = l instanceof L.Polygon;
        for (const anello of anelli(l.getLatLngs())) {
            const p = anello.map((ll) => mappa.latLngToContainerPoint(ll));
            if (chiuso && p.length) p.push(p[0]);
            for (let i = 1; i < p.length; i++) {
                if (L.LineUtil.pointToSegmentDistance(pixel, p[i - 1], p[i]) < 14) { trovato = l; return; }
            }
        }
    });
    return trovato;
}

function cancellaSotto(pixel) {
    const l = disegnoSotto(pixel);
    if (!l) return false;
    disegni.removeLayer(l);
    return true;
}

// --- Puntatore sulla mappa mentre uno strumento è attivo ---
function ascoltaPuntatore() {
    const c = contenitore();
    const attivi = new Set();
    let cancellato = false;

    c.addEventListener('pointerdown', (e) => {
        attivi.add(e.pointerId);
        if (!strumento || !app.comando) return;
        // Due dita: è uno zoom, non un disegno.
        if (attivi.size > 1) { annullaTratto(); return; }
        if (e.button > 0) return;
        const pixel = mappa.mouseEventToContainerPoint(e);
        if (strumento === 'matita') {
            inizioTratto(mappa.containerPointToLatLng(pixel), pixel);
        } else if (strumento === 'gomma') {
            cancellato = cancellaSotto(pixel);
        }
    });

    c.addEventListener('pointermove', (e) => {
        if (!strumento || attivi.size !== 1 || !attivi.has(e.pointerId)) return;
        const eventi = e.getCoalescedEvents?.() || [e];
        for (const ev of eventi.length ? eventi : [e]) {
            const pixel = mappa.mouseEventToContainerPoint(ev);
            if (strumento === 'matita' && tratto) continuaTratto(mappa.containerPointToLatLng(pixel), pixel);
            else if (strumento === 'gomma') cancellato = cancellaSotto(pixel) || cancellato;
        }
    });

    const fine = (e) => {
        attivi.delete(e.pointerId);
        if (strumento === 'matita' && tratto) {
            if (e.type === 'pointercancel') annullaTratto();
            else fineTratto();
        }
        if (strumento === 'gomma' && cancellato && attivi.size === 0) {
            cancellato = false;
            salva();
        }
    };
    c.addEventListener('pointerup', fine);
    c.addEventListener('pointercancel', fine);
}

async function scriviTesto(latlng) {
    const testo = await chiediTesto({ titolo: 'Scrivi sulla mappa', etichetta: 'Testo', si: 'Scrivi' });
    if (!testo || !app.comando) return;
    disegni.addLayer(creaTesto(latlng, testo.slice(0, 200), colore));
    salva();
}

export function avviaDisegno() {
    disegni.addTo(mappa);
    const tavolozza = $('#colori-disegno');
    for (const [valore, nome] of COLORI) {
        tavolozza.append(crea('button', {
            type: 'button',
            role: 'radio',
            'aria-checked': String(valore === colore),
            'aria-label': nome,
            title: nome,
            style: { '--c': valore },
            onclick: (ev) => {
                colore = valore;
                for (const b of tavolozza.children) b.setAttribute('aria-checked', String(b === ev.currentTarget));
            },
        }));
    }
    $('#barra-disegno').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-strumento]');
        // Ripremendo lo strumento già acceso lo si spegne (e la mappa torna a spostarsi).
        if (b) scegliStrumento(b.dataset.strumento === strumento ? null : b.dataset.strumento);
    });
    $('#annulla-disegno').addEventListener('click', () => {
        const ultimi = disegni.getLayers();
        if (!ultimi.length) return;
        disegni.removeLayer(ultimi[ultimi.length - 1]);
        salva();
    });
    $('#pulisci-disegni').addEventListener('click', async () => {
        if (!disegni.getLayers().length) return;
        const ok = await conferma({ titolo: 'Cancellare tutti i disegni?', testo: 'Linee, forme e testi spariscono per tutti. Le icone restano.', si: 'Cancella', pericolo: true });
        if (!ok) return;
        disegni.clearLayers();
        salva();
    });
    $('#chiudi-disegno').addEventListener('click', chiudiBarra);
    ascoltaPuntatore();

    on('mappa:clic', (e) => { if (strumento === 'testo' && app.comando) scriviTesto(e.latlng); });
    on('comando', () => {
        if (!app.comando && barraAperta()) chiudiBarra();
        aggiornaTrascinabiliTesti();
    });
    on('tasto:esc', () => { if (barraAperta()) chiudiBarra(); });
}
