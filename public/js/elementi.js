// Le icone schierate sulla mappa (squadre e marker): disegno, trascinamento anche di gruppo, selezione,
// cerchio tattico, orbita. Ogni modifica vale subito qui e parte verso il server per gli altri.
import { app, emetti, invia, on, trovaElemento, tuttiGliElementi, collezioneDi } from './stato.js';
import { mappa, centroVisibile, areaVisibile } from './mappa.js';
import { $, avviso, conferma, alPiuOgni, eTelefono } from './ui.js';
import { srcIcona, coloreNome, coloreFazione, percorsoFazione, nomeIcona } from './icone.js';

const segni = new Map(); // id → { marker, cerchio }
const selezione = new Set();
let modoSelezione = false;

const lato = () => (eTelefono() ? 50 : 60);

function creaDom(e) {
    const el = document.createElement('div');
    el.className = 'segno';
    const img = document.createElement('img');
    img.className = 'segno-img';
    img.alt = '';
    img.draggable = false;
    img.src = srcIcona(e.icona);
    const nome = document.createElement('span');
    nome.className = 'segno-nome';
    nome.textContent = e.nome || '';
    nome.style.setProperty('--c', coloreNome(e));
    el.append(img, nome);
    if (selezione.has(e.id)) el.classList.add('selezionato');
    return el;
}

const domDi = (id) => segni.get(id)?.marker.getElement()?.querySelector('.segno');

function titoloDi(e) {
    return e.nome || nomeIcona(e.icona) || (e.tipo === 'squadra' ? 'Squadra' : 'Marker');
}

export function rendi(e) {
    togliDallaMappa(e.id);
    if (e.inOrbita) return;
    const s = lato();
    const marker = L.marker([e.lat, e.lng], {
        icon: L.divIcon({ html: creaDom(e), className: 'segno-wrapper', iconSize: [s, s], iconAnchor: [s / 2, s / 2] }),
        draggable: app.comando,
        title: titoloDi(e),
        alt: titoloDi(e),
        riseOnHover: true,
        autoPan: true,
    }).addTo(mappa);
    const voce = { marker, cerchio: null };
    segni.set(e.id, voce);
    aggiornaCerchio(e);
    collegaEventi(e.id, marker);
}

function togliDallaMappa(id) {
    const voce = segni.get(id);
    if (!voce) return;
    voce.marker.remove();
    voce.cerchio?.remove();
    segni.delete(id);
}

function aggiornaCerchio(e) {
    const voce = segni.get(e.id);
    if (!voce) return;
    if (!e.cerchioAttivo) {
        voce.cerchio?.remove();
        voce.cerchio = null;
        return;
    }
    const stile = { color: coloreFazione(e.fazione), weight: 2, dashArray: '8 6', fillOpacity: 0.12, interactive: false };
    if (!voce.cerchio) voce.cerchio = L.circle([e.lat, e.lng], { radius: e.raggioCerchio || 60, ...stile }).addTo(mappa);
    voce.cerchio.setStyle(stile);
    voce.cerchio.setRadius(e.raggioCerchio || 60);
    voce.cerchio.setLatLng([e.lat, e.lng]);
}

// Mostra a schermo i campi cambiati di un elemento (già aggiornati nello stato).
export function aggiornaVista(id, campi) {
    const e = trovaElemento(id);
    if (!e) return;
    if ('inOrbita' in campi || 'icona' in campi) {
        rendi(e);
    } else {
        const voce = segni.get(id);
        if (voce) {
            if ('lat' in campi || 'lng' in campi) voce.marker.setLatLng([e.lat, e.lng]);
            if ('nome' in campi || 'colore' in campi) {
                const nome = domDi(id)?.querySelector('.segno-nome');
                if (nome) {
                    nome.textContent = e.nome || '';
                    nome.style.setProperty('--c', coloreNome(e));
                }
                voce.marker.options.title = titoloDi(e);
                voce.marker.getElement()?.setAttribute('title', titoloDi(e));
            }
            aggiornaCerchio(e);
        }
    }
    emetti('elemento:cambiato', { id, campi });
}

// Una modifica fatta qui: vale subito e parte per gli altri.
export function modifica(id, campi) {
    const e = trovaElemento(id);
    if (!e || !app.comando) return;
    if (campi.roster) campi = { ...campi, roster: { ...e.roster, ...campi.roster } };
    if (campi.fazione && campi.fazione !== e.fazione) campi = { ...campi, icona: percorsoFazione(e.icona, campi.fazione) };
    if (campi.icona) campi.percorsoIcona = campi.icona;
    Object.assign(e, campi);
    aggiornaVista(id, campi);
    invia('elemento:modifica', { id, campi });
}

// --- Eventi del marker ---
function collegaEventi(id, marker) {
    let compagni = null; // durante il trascinamento di gruppo: id → scarto dal marker trascinato

    const spedisci = alPiuOgni((lista, fine) => invia('elemento:sposta', { lista, fine }), 90);
    const inviaPosizioni = (fine) => {
        const lista = [id, ...(compagni ? compagni.keys() : [])].map((x) => {
            const e = trovaElemento(x);
            return e && { id: x, lat: e.lat, lng: e.lng };
        }).filter(Boolean);
        spedisci(lista, fine);
    };

    marker.on('click', (ev) => {
        const o = ev.originalEvent;
        if (modoSelezione || o?.shiftKey || o?.ctrlKey || o?.metaKey) cambiaSelezione(id);
        else emetti('scheda:apri', id);
    });

    marker.on('mousedown', (ev) => {
        if (ev.originalEvent?.button === 1) {
            ev.originalEvent.preventDefault();
            cambiaSelezione(id);
        }
    });

    marker.on('contextmenu', (ev) => {
        ev.originalEvent?.preventDefault();
        const e = trovaElemento(id);
        if (e && app.comando) modifica(id, { cerchioAttivo: !e.cerchioAttivo });
    });

    marker.on('dragstart', () => {
        compagni = null;
        if (selezione.has(id) && selezione.size > 1) {
            const qui = marker.getLatLng();
            compagni = new Map();
            for (const altro of selezione) {
                const e = trovaElemento(altro);
                if (altro !== id && e && !e.inOrbita) compagni.set(altro, { dLat: e.lat - qui.lat, dLng: e.lng - qui.lng });
            }
        }
    });

    marker.on('drag', () => {
        const qui = marker.getLatLng();
        const e = trovaElemento(id);
        if (!e) return;
        e.lat = qui.lat;
        e.lng = qui.lng;
        segni.get(id)?.cerchio?.setLatLng(qui);
        for (const [altro, scarto] of compagni || []) {
            const ea = trovaElemento(altro);
            if (!ea) continue;
            ea.lat = qui.lat + scarto.dLat;
            ea.lng = qui.lng + scarto.dLng;
            segni.get(altro)?.marker.setLatLng([ea.lat, ea.lng]);
            segni.get(altro)?.cerchio?.setLatLng([ea.lat, ea.lng]);
        }
        inviaPosizioni(false);
    });

    marker.on('dragend', () => {
        inviaPosizioni(true);
        compagni = null;
    });
}

// Posizioni arrivate dagli altri.
export function sposta(lista) {
    for (const { id, lat, lng } of lista) {
        const e = trovaElemento(id);
        if (!e) continue;
        e.lat = lat;
        e.lng = lng;
        const voce = segni.get(id);
        voce?.marker.setLatLng([lat, lng]);
        voce?.cerchio?.setLatLng([lat, lng]);
    }
}

export function rendiTutti() {
    for (const id of [...segni.keys()]) togliDallaMappa(id);
    for (const id of [...selezione]) if (!trovaElemento(id)) selezione.delete(id);
    for (const e of tuttiGliElementi()) rendi(e);
    aggiornaBarraSelezione();
}

// --- Schierare e togliere ---
export function schiera(percorso, tipo, fazione) {
    if (!app.comando) return null;
    let centro = centroVisibile();
    // Se al centro c'è già un'icona, la nuova si sposta un po' per non coprirla.
    let pixel = mappa.latLngToContainerPoint(centro);
    const passo = lato() + 12;
    for (let giro = 0; giro < 12; giro++) {
        const occupato = tuttiGliElementi().some((e) => !e.inOrbita && mappa.latLngToContainerPoint([e.lat, e.lng]).distanceTo(pixel) < passo * 0.8);
        if (!occupato) break;
        // A spirale attorno al centro: destra, sotto, sinistra, sopra, poi un giro più largo.
        const angolo = (giro % 6) * (Math.PI / 3);
        const raggio = passo * (1 + Math.floor(giro / 6));
        pixel = mappa.latLngToContainerPoint(centroVisibile()).add([Math.cos(angolo) * raggio, Math.sin(angolo) * raggio]);
        centro = mappa.containerPointToLatLng(pixel);
    }
    const icona = percorsoFazione(percorso, fazione);
    const e = {
        id: `ent_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        tipo,
        lat: centro.lat,
        lng: centro.lng,
        icona,
        percorsoIcona: icona,
        nome: '',
        fazione,
        cerchioAttivo: false,
        raggioCerchio: 60,
        inOrbita: false,
        note: '',
        ...(tipo === 'squadra' && { roster: { capo: '', vice: '', membri: '' } }),
    };
    collezioneDi(tipo)[e.id] = e;
    rendi(e);
    invia('elemento:nuovo', e);
    emetti('elementi:cambiati');
    pulsa(e.id);
    return e;
}

export function aggiungiDaFuori(e) {
    collezioneDi(e.tipo)[e.id] = e;
    rendi(e);
    emetti('elementi:cambiati');
}

export function togli(ids, { daFuori = false } = {}) {
    for (const id of ids) {
        const e = trovaElemento(id);
        if (!e) continue;
        togliDallaMappa(id);
        delete collezioneDi(e.tipo)[id];
        selezione.delete(id);
        emetti('elemento:tolto', id);
    }
    if (!daFuori) invia('elemento:elimina', ids);
    aggiornaBarraSelezione();
    emetti('elementi:cambiati');
}

export async function eliminaConConferma(ids) {
    if (!app.comando || !ids.length) return false;
    const e = ids.length === 1 ? trovaElemento(ids[0]) : null;
    const ok = await conferma({
        titolo: ids.length === 1 ? `Eliminare ${e ? titoloDi(e) : 'l\'icona'}?` : `Eliminare ${ids.length} icone?`,
        testo: 'Spariscono dalla mappa per tutti.',
        si: 'Elimina',
        pericolo: true,
    });
    if (ok) togli(ids);
    return ok;
}

// --- Orbita (squadre parcheggiate fuori dalla mappa, con le note) ---
export function mandaInOrbita(id) {
    modifica(id, { inOrbita: true });
    emetti('elementi:cambiati');
}

export function rientra(id) {
    const c = centroVisibile();
    modifica(id, { inOrbita: false, lat: c.lat, lng: c.lng });
    emetti('elementi:cambiati');
    pulsa(id);
}

export function trova(id) {
    const e = trovaElemento(id);
    if (!e || e.inOrbita) return;
    mappa.flyTo([e.lat, e.lng], Math.max(mappa.getZoom(), mappa.getMinZoom() + 2), { duration: 0.6 });
    pulsa(id);
}

// Se l'icona è finita sotto la scheda o il pannello, la mappa scorre quanto basta per mostrarla.
export function mostraInVista(id) {
    const voce = segni.get(id);
    if (!voce) return;
    const p = mappa.latLngToContainerPoint(voce.marker.getLatLng());
    const { x0, x1, y0, y1 } = areaVisibile();
    const bordo = 40;
    if (p.x >= x0 + bordo && p.x <= x1 - bordo && p.y >= y0 + bordo && p.y <= y1 - bordo) return;
    mappa.panBy([p.x - (x0 + x1) / 2, p.y - (y0 + y1) / 2]);
}

export function pulsa(id) {
    requestAnimationFrame(() => {
        const el = domDi(id);
        if (!el) return;
        el.classList.remove('pulsa');
        void el.offsetWidth;
        el.classList.add('pulsa');
        setTimeout(() => el.classList.remove('pulsa'), 2600);
    });
}

// --- Selezione di più icone ---
export function cambiaSelezione(id) {
    if (selezione.has(id)) selezione.delete(id);
    else selezione.add(id);
    domDi(id)?.classList.toggle('selezionato', selezione.has(id));
    aggiornaBarraSelezione();
}

export function avviaSelezione(id) {
    modoSelezione = true;
    if (id && !selezione.has(id)) cambiaSelezione(id);
    aggiornaBarraSelezione();
    avviso('Tocca le altre icone da aggiungere. Trascinandone una si spostano tutte insieme.');
}

export function svuotaSelezione() {
    for (const id of selezione) domDi(id)?.classList.remove('selezionato');
    selezione.clear();
    modoSelezione = false;
    aggiornaBarraSelezione();
}

function aggiornaBarraSelezione() {
    const barra = $('#barra-selezione');
    const mostra = modoSelezione || selezione.size > 0;
    barra.hidden = !mostra;
    if (!mostra) return;
    $('#conta-selezione').textContent = selezione.size === 1 ? '1 icona selezionata' : `${selezione.size} icone selezionate`;
    $('#elimina-selezione').disabled = !app.comando || selezione.size === 0;
}

// Con il comando le icone si trascinano; senza, no.
export function aggiornaTrascinabili() {
    for (const { marker } of segni.values()) {
        if (app.comando) marker.dragging?.enable();
        else marker.dragging?.disable();
    }
    aggiornaBarraSelezione();
}

export function avviaElementi() {
    $('#elimina-selezione').addEventListener('click', async () => {
        if (await eliminaConConferma([...selezione])) svuotaSelezione();
    });
    $('#fine-selezione').addEventListener('click', svuotaSelezione);
    on('mappa:clic', () => { if (!modoSelezione && selezione.size) svuotaSelezione(); });
    on('tasto:esc', () => { if (selezione.size || modoSelezione) svuotaSelezione(); });
}
