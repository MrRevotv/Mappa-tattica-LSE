// Controlli su tutto quello che arriva dai browser (e dai file missione caricati): solo i campi conosciuti, dei tipi
// giusti e con una lunghezza massima. Il formato è lo stesso delle missioni salvate dalla mappa di prima.

const SFONDO_INIZIALE = 'mappe/avvio.webp';
const LIMITI_INIZIALI = [[0, 0], [1279, 1920]]; // avvio.webp: 2528×1684 portata a 1920 di larghezza
const RAGGIO_CERCHIO = 60;

const testo = (v, massimo) => (typeof v === 'string' ? v.slice(0, massimo) : '');
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) : null);
const COLORE = /^#[0-9a-fA-F]{6}$/;
const ICONA = /^Icone\/[\w \-/]{1,200}$/;
const ID = /^[\w-]{1,64}$/;

function sfondoValido(url) {
    return typeof url === 'string' && url.length <= 300 && /^mappe\/[^?#\\]+\.(png|jpe?g|webp)$/i.test(url) && !url.split('/').includes('..');
}

function limitiValidi(b) {
    return Array.isArray(b) && b.length === 2 && b.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => numero(n) !== null))
        && b[1][0] > b[0][0] && b[1][1] > b[0][1];
}

function rosterDa(r) {
    return { capo: testo(r?.capo, 80), vice: testo(r?.vice, 80), membri: testo(r?.membri, 600) };
}

function normalizzaElemento(d) {
    if (!d || typeof d !== 'object') return null;
    const icona = [d.icona, d.percorsoIcona].find((p) => typeof p === 'string' && ICONA.test(p));
    const lat = numero(d.lat);
    const lng = numero(d.lng);
    if (typeof d.id !== 'string' || !ID.test(d.id) || !icona || lat === null || lng === null) return null;
    const tipo = d.tipo === 'squadra' ? 'squadra' : 'poi';
    const e = {
        id: d.id,
        tipo,
        lat,
        lng,
        icona,
        percorsoIcona: icona,
        nome: testo(d.nome, 60),
        fazione: d.fazione === 'amica' || d.fazione === 'nemica' ? d.fazione : (icona.includes('nemiche') ? 'nemica' : 'amica'),
        cerchioAttivo: d.cerchioAttivo === true,
        raggioCerchio: Math.max(10, Math.min(2000, numero(d.raggioCerchio) ?? RAGGIO_CERCHIO)),
        inOrbita: d.inOrbita === true,
        note: testo(d.note, 1000),
    };
    if (COLORE.test(d.colore)) e.colore = d.colore;
    if (tipo === 'squadra') e.roster = rosterDa(d.roster);
    return e;
}

// Applica a un elemento solo i campi modificabili e validi; restituisce quelli cambiati davvero (o null).
function modificaElemento(e, campi) {
    if (!e || !campi || typeof campi !== 'object') return null;
    const cambiati = {};
    const metti = (chiave, valore) => {
        if (JSON.stringify(e[chiave]) === JSON.stringify(valore)) return;
        e[chiave] = valore;
        cambiati[chiave] = valore;
    };
    if ('nome' in campi) metti('nome', testo(campi.nome, 60));
    if ('colore' in campi && COLORE.test(campi.colore)) metti('colore', campi.colore);
    if (campi.fazione === 'amica' || campi.fazione === 'nemica') metti('fazione', campi.fazione);
    if (typeof campi.icona === 'string' && ICONA.test(campi.icona)) {
        metti('icona', campi.icona);
        metti('percorsoIcona', campi.icona);
    }
    if (typeof campi.cerchioAttivo === 'boolean') metti('cerchioAttivo', campi.cerchioAttivo);
    if (numero(campi.raggioCerchio) !== null) metti('raggioCerchio', Math.max(10, Math.min(2000, campi.raggioCerchio)));
    if (typeof campi.inOrbita === 'boolean') metti('inOrbita', campi.inOrbita);
    if ('note' in campi) metti('note', testo(campi.note, 1000));
    if (e.tipo === 'squadra' && campi.roster && typeof campi.roster === 'object') metti('roster', rosterDa({ ...e.roster, ...campi.roster }));
    if (numero(campi.lat) !== null && numero(campi.lng) !== null) {
        metti('lat', numero(campi.lat));
        metti('lng', numero(campi.lng));
    }
    return Object.keys(cambiati).length ? cambiati : null;
}

// I disegni sono un GeoJSON (FeatureCollection) di linee, aree e testi.
const GEOMETRIE = new Set(['Point', 'LineString', 'Polygon', 'MultiLineString', 'MultiPolygon']);
function coordinateValide(c, profondita = 0) {
    if (profondita > 4 || !Array.isArray(c)) return false;
    if (c.length === 2 && typeof c[0] === 'number') return numero(c[0]) !== null && numero(c[1]) !== null;
    return c.length <= 20000 && c.every((x) => coordinateValide(x, profondita + 1));
}

function normalizzaDisegni(g) {
    if (!g || g.type !== 'FeatureCollection' || !Array.isArray(g.features)) return null;
    const features = [];
    for (const f of g.features.slice(0, 3000)) {
        const geometria = f?.geometry;
        if (!geometria || !GEOMETRIE.has(geometria.type) || !coordinateValide(geometria.coordinates)) continue;
        const p = f.properties || {};
        const properties = { color: COLORE.test(p.color) ? p.color : '#ff4444' };
        if (p.isText === true) {
            if (geometria.type !== 'Point' || !testo(p.testo, 200).trim()) continue;
            properties.isText = true;
            properties.testo = testo(p.testo, 200);
        } else if (geometria.type === 'Point') {
            continue;
        }
        if (p.isShape === true) properties.isShape = true;
        features.push({ type: 'Feature', properties, geometry: { type: geometria.type, coordinates: geometria.coordinates } });
    }
    return features.length ? { type: 'FeatureCollection', features } : null;
}

function bountyVuoto() {
    return { materiali: [], pagamenti: [], spese: [], config: {} };
}

// Il calcolatore bounty salva i valori così come sono scritti nelle caselle (testo).
function normalizzaBounty(d) {
    if (!d || typeof d !== 'object') return bountyVuoto();
    const righe = (lista, campi) => (Array.isArray(lista) ? lista.slice(0, 100) : []).map((r) => Object.fromEntries(campi.map((c) => [c, testo(r?.[c] == null ? '' : String(r[c]), 60)])));
    const config = {};
    for (const c of ['bank', 'org', 'giverPct', 'giverName', 'sellerPct', 'sellerName', 'treasName']) {
        if (d.config?.[c] != null) config[c] = testo(String(d.config[c]), 60);
    }
    return {
        materiali: righe(d.materiali, ['name', 'qty', 'price']),
        pagamenti: righe(d.pagamenti, ['name', 'delta']),
        spese: righe(d.spese, ['desc', 'amt', 'name']),
        config,
    };
}

function normalizzaZona(z) {
    const zona = {};
    for (const c of ['gioco', 'sistema', 'pianeta', 'mappa', 'submappa']) zona[c] = testo(z?.[c], 300);
    return zona;
}

function statoPulito() {
    return {
        sfondo: SFONDO_INIZIALE,
        bounds: LIMITI_INIZIALI,
        squadre: {},
        poi: {},
        disegni: null,
        grigliaAttiva: false,
        zonaOperativa: normalizzaZona(null),
        bounty: bountyVuoto(),
    };
}

// Uno stato intero: da un file missione (anche della mappa di prima) o dal pulsante "Carica missione".
function normalizzaStato(s) {
    if (!s || typeof s !== 'object') return null;
    const stato = statoPulito();
    if (sfondoValido(s.sfondo)) {
        stato.sfondo = s.sfondo;
        // Le missioni della mappa di prima non hanno misure proprie: allora l'immagine stava in 1920×1080.
        stato.bounds = limitiValidi(s.bounds) ? s.bounds : [[0, 0], [1080, 1920]];
    }
    for (const lista of [s.squadre, s.poi]) {
        for (const d of Object.values(lista && typeof lista === 'object' ? lista : {}).slice(0, 500)) {
            const e = normalizzaElemento(d);
            if (e) (e.tipo === 'squadra' ? stato.squadre : stato.poi)[e.id] = e;
        }
    }
    stato.disegni = normalizzaDisegni(s.disegni);
    stato.grigliaAttiva = s.grigliaAttiva === true;
    stato.zonaOperativa = normalizzaZona(s.zonaOperativa);
    stato.bounty = normalizzaBounty(s.bounty);
    return stato;
}

module.exports = {
    normalizzaElemento,
    modificaElemento,
    normalizzaDisegni,
    normalizzaBounty,
    normalizzaZona,
    normalizzaStato,
    statoPulito,
    sfondoValido,
    limitiValidi,
    numero,
    SFONDO_INIZIALE,
    LIMITI_INIZIALI,
};
