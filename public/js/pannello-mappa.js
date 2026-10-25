// Pannello "Mappa": cerca una mappa, scegli la zona operativa (gioco → sistema → pianeta → mappa → sottomappa),
// carica o elimina mappe (admin e responsabili), griglia, visione notturna e goniometro.
import { app, invia, on, eUfficiale } from './stato.js';
import { $, crea, avviso, conferma } from './ui.js';
import { misuraMappa, visioneNotturna } from './mappa.js';
import { attivaGoniometro } from './goniometro.js';

const sel = {
    gioco: $('#zona-gioco'),
    sistema: $('#zona-sistema'),
    pianeta: $('#zona-pianeta'),
    luogo: $('#zona-luogo'),
    sotto: $('#zona-sotto'),
};
const nomeLeggibile = (s) => s.replace(/[_-]+/g, ' ').trim();

// --- Catalogo ---
const giocoDi = (id) => app.catalogo.giochi.find((g) => g.id === id);
const luoghiIn = (zona) => app.catalogo.luoghi.filter((l) => l.zona.join('/') === zona.join('/'));
const zonaScelta = () => {
    const g = giocoDi(sel.gioco.value);
    if (!g) return null;
    if (!g.sistemi) return [g.id];
    return sel.sistema.value && sel.pianeta.value ? [g.id, sel.sistema.value, sel.pianeta.value] : null;
};
const luogoScelto = () => {
    const zona = zonaScelta();
    return zona ? luoghiIn(zona).find((l) => l.id === sel.luogo.value) : undefined;
};

function opzioni(select, voci, segnaposto, valore) {
    select.replaceChildren(crea('option', { value: '' }, segnaposto), ...voci.map(([v, testo]) => crea('option', { value: v }, testo)));
    select.value = voci.some(([v]) => v === valore) ? valore : '';
}

const mostra = (select, visibile) => { select.closest('.campo').hidden = !visibile; };

// Ricostruisce le tendine partendo dalla scelta attuale (o da quella passata).
function aggiornaTendine(scelta = {}) {
    const valore = (chiave) => (chiave in scelta ? scelta[chiave] : sel[chiave].value);
    opzioni(sel.gioco, app.catalogo.giochi.map((g) => [g.id, g.nome]), 'Scegli il gioco', valore('gioco'));
    const g = giocoDi(sel.gioco.value);

    mostra(sel.sistema, Boolean(g?.sistemi));
    mostra(sel.pianeta, false);
    if (g?.sistemi) {
        opzioni(sel.sistema, g.sistemi.map((s) => [s.id, nomeLeggibile(s.id)]), 'Scegli il sistema', valore('sistema'));
        const s = g.sistemi.find((x) => x.id === sel.sistema.value);
        mostra(sel.pianeta, Boolean(s));
        if (s) opzioni(sel.pianeta, s.pianeti.map((p) => [p, nomeLeggibile(p)]), 'Scegli il pianeta', valore('pianeta'));
    }

    const zona = zonaScelta();
    mostra(sel.luogo, Boolean(zona));
    mostra(sel.sotto, false);
    if (zona) {
        const luoghi = luoghiIn(zona);
        opzioni(sel.luogo, luoghi.map((l) => [l.id, l.nome]), luoghi.length ? 'Scegli la mappa' : 'Nessuna mappa caricata qui', valore('luogo'));
        const l = luoghi.find((x) => x.id === sel.luogo.value);
        if (l?.sottomappe.length) {
            mostra(sel.sotto, true);
            opzioni(sel.sotto, l.sottomappe.map((s) => [s.url, s.nome]), 'Mappa principale', valore('sotto'));
        }
    }
    aggiornaGestione();
}

// Le tendine seguono la mappa che si sta guardando (anche quando la cambia qualcun altro).
function seguiMappaAttuale() {
    const z = app.stato.zonaOperativa || {};
    const l = app.catalogo.luoghi.find((x) => x.zona[0] === z.gioco && x.id === z.mappa && (x.zona.length === 1 || (x.zona[1] === z.sistema && x.zona[2] === z.pianeta)));
    if (l) {
        aggiornaTendine({ gioco: l.zona[0], sistema: l.zona[1] || '', pianeta: l.zona[2] || '', luogo: l.id, sotto: z.submappa || '' });
        const sotto = l.sottomappe.find((s) => s.url === z.submappa);
        $('#mappa-attuale').textContent = sotto ? `${l.nome} · ${sotto.nome}` : l.nome;
    } else {
        aggiornaTendine();
        $('#mappa-attuale').textContent = app.stato.sfondo.includes('avvio') ? 'Schermata iniziale' : nomeLeggibile(app.stato.sfondo.split('/').pop().replace(/\.\w+$/, ''));
    }
}

async function mostraMappa(l, urlSotto = '') {
    if (!app.comando || !l) return;
    const url = urlSotto || l.master;
    try {
        const bounds = await misuraMappa(url);
        invia('mappa', {
            url,
            bounds,
            zona: { gioco: l.zona[0], sistema: l.zona[1] || '', pianeta: l.zona[2] || '', mappa: l.id, submappa: urlSotto },
        });
    } catch {
        avviso('Questa mappa non si apre: forse il file è stato eliminato.', { tipo: 'errore' });
    }
}

// --- Ricerca (perdona fino a due lettere sbagliate) ---
function errori(a, b) {
    const m = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : 1 + Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]);
        }
    }
    return m[b.length][a.length];
}

function percorsoDi(l) {
    return [giocoDi(l.zona[0])?.nome || l.zona[0], ...l.zona.slice(1).map(nomeLeggibile)].join(' › ');
}

function cerca(testo) {
    const elenco = $('#risultati-mappa');
    const casella = $('#cerca-mappa');
    const q = testo.trim().toLowerCase();
    if (q.length < 2) {
        elenco.hidden = true;
        casella.setAttribute('aria-expanded', 'false');
        return;
    }
    const voci = [];
    for (const l of app.catalogo.luoghi) {
        voci.push({ nome: l.nome, luogo: l, url: '', dove: percorsoDi(l) });
        for (const s of l.sottomappe) voci.push({ nome: s.nome, luogo: l, url: s.url, dove: `${percorsoDi(l)} › ${l.nome}` });
    }
    const trovate = voci
        .map((v) => {
            const nome = v.nome.toLowerCase();
            return { ...v, punti: nome.includes(q) ? 0 : errori(q, nome.slice(0, q.length)) };
        })
        .filter((v) => v.punti <= 2)
        .sort((a, b) => a.punti - b.punti || a.nome.localeCompare(b.nome))
        .slice(0, 12);

    elenco.replaceChildren(...(trovate.length
        ? trovate.map((v, i) => crea('li', { role: 'presentation' }, crea('button', {
            type: 'button',
            role: 'option',
            id: `risultato-${i}`,
            'aria-selected': 'false',
            onclick: () => {
                casella.value = '';
                cerca('');
                mostraMappa(v.luogo, v.url);
            },
        }, crea('span', {}, v.nome), crea('small', {}, v.dove))))
        : [crea('li', { class: 'nessuno' }, 'Nessuna mappa con questo nome.')]));
    elenco.hidden = false;
    casella.setAttribute('aria-expanded', 'true');
}

// --- Caricare ed eliminare mappe (admin e responsabili) ---
function aggiornaGestione() {
    const zona = zonaScelta();
    const l = luogoScelto();
    $('#carica-master').disabled = !zona;
    $('#aiuto-master').textContent = zona
        ? `Andrà in: ${[giocoDi(zona[0])?.nome, ...zona.slice(1).map(nomeLeggibile)].join(' › ')}. Il nome del file diventa il nome della mappa.`
        : 'Scegli prima il gioco (e per Star Citizen sistema e pianeta).';
    $('#carica-sotto').disabled = !l;
    $('#aiuto-sotto').textContent = l ? `Si aggiunge a: ${l.nome}.` : 'Scegli prima la mappa principale.';
    const attuale = !app.stato?.sfondo.includes('avvio');
    $('#elimina-mappa').disabled = !attuale;
}

function caricaFile(file, tipo) {
    const zona = zonaScelta();
    const l = luogoScelto();
    if (!file || !zona || (tipo === 'sottomappa' && !l)) return;
    const dati = new FormData();
    dati.append('tipo', tipo);
    dati.append('zona', JSON.stringify(zona));
    if (l) dati.append('luogo', l.id);
    dati.append('mappa', file);

    const pulsante = $(tipo === 'master' ? '#carica-master' : '#carica-sotto');
    const testoPrima = pulsante.lastChild.textContent;
    pulsante.disabled = true;
    const richiesta = new XMLHttpRequest();
    richiesta.open('POST', '/api/mappe');
    richiesta.responseType = 'json';
    richiesta.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) pulsante.lastChild.textContent = `Carico… ${Math.round((e.loaded / e.total) * 100)}%`;
    });
    richiesta.addEventListener('loadend', async () => {
        pulsante.lastChild.textContent = testoPrima;
        aggiornaGestione();
        if (richiesta.status !== 200) {
            avviso(richiesta.response?.errore || 'Caricamento non riuscito: riprova.', { tipo: 'errore', durata: 7000 });
            return;
        }
        avviso('Mappa caricata.', { tipo: 'ok' });
        app.catalogo = await (await fetch('/api/mappe')).json();
        const url = richiesta.response.url;
        const nuovo = app.catalogo.luoghi.find((x) => x.master === url || x.sottomappe.some((s) => s.url === url));
        if (nuovo) mostraMappa(nuovo, nuovo.master === url ? '' : url);
    });
    richiesta.send(dati);
}

async function eliminaMappaAttuale() {
    const url = app.stato.sfondo;
    if (url.includes('avvio')) return;
    const principale = /\/mappa_master\//.test(url);
    const ok = await conferma({
        titolo: principale ? 'Eliminare questa mappa?' : 'Eliminare questa sottomappa?',
        testo: principale
            ? `${$('#mappa-attuale').textContent}: il file sparisce dal server insieme alle sue sottomappe. Non si può annullare.`
            : `${$('#mappa-attuale').textContent}: il file sparisce dal server. Non si può annullare.`,
        si: 'Elimina',
        pericolo: true,
    });
    if (!ok) return;
    const risposta = await fetch('/api/mappe/elimina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
    if (risposta.ok) avviso('Mappa eliminata.', { tipo: 'ok' });
    else avviso((await risposta.json().catch(() => ({}))).errore || 'Eliminazione non riuscita.', { tipo: 'errore' });
}

export function avviaPannelloMappa() {
    sel.gioco.addEventListener('change', () => aggiornaTendine({ sistema: '', pianeta: '', luogo: '', sotto: '' }));
    sel.sistema.addEventListener('change', () => aggiornaTendine({ pianeta: '', luogo: '', sotto: '' }));
    sel.pianeta.addEventListener('change', () => aggiornaTendine({ luogo: '', sotto: '' }));
    sel.luogo.addEventListener('change', () => {
        aggiornaTendine({ sotto: '' });
        const l = luogoScelto();
        if (l) mostraMappa(l);
    });
    sel.sotto.addEventListener('change', () => mostraMappa(luogoScelto(), sel.sotto.value));

    const casella = $('#cerca-mappa');
    casella.addEventListener('input', () => cerca(casella.value));
    casella.addEventListener('keydown', (e) => {
        const voci = [...$('#risultati-mappa').querySelectorAll('[role="option"]')];
        if (!voci.length) return;
        const attuale = voci.findIndex((v) => v.getAttribute('aria-selected') === 'true');
        let prossima = attuale;
        if (e.key === 'ArrowDown') prossima = Math.min(voci.length - 1, attuale + 1);
        else if (e.key === 'ArrowUp') prossima = Math.max(0, attuale - 1);
        else if (e.key === 'Enter') { e.preventDefault(); (voci[attuale] || voci[0]).click(); return; }
        else if (e.key === 'Escape') { casella.value = ''; cerca(''); e.stopPropagation(); return; }
        else return;
        e.preventDefault();
        voci.forEach((v, i) => v.setAttribute('aria-selected', String(i === prossima)));
        casella.setAttribute('aria-activedescendant', voci[prossima].id);
        voci[prossima].scrollIntoView({ block: 'nearest' });
    });

    $('#carica-master').addEventListener('click', () => $('#file-master').click());
    $('#carica-sotto').addEventListener('click', () => $('#file-sotto').click());
    for (const [id, tipo] of [['#file-master', 'master'], ['#file-sotto', 'sottomappa']]) {
        $(id).addEventListener('change', (e) => {
            caricaFile(e.target.files[0], tipo);
            e.target.value = '';
        });
    }
    $('#elimina-mappa').addEventListener('click', eliminaMappaAttuale);

    $('#vista-griglia').addEventListener('change', (e) => invia('griglia', e.target.checked));
    $('#vista-notte').addEventListener('change', (e) => visioneNotturna(e.target.checked));
    $('#vista-goniometro').addEventListener('change', (e) => attivaGoniometro(e.target.checked));

    on('stato:nuovo', () => {
        $('#vista-griglia').checked = app.stato.grigliaAttiva;
        seguiMappaAttuale();
    });
    on('mappa:cambiata', seguiMappaAttuale);
    on('griglia', (attiva) => { $('#vista-griglia').checked = attiva; });
    on('catalogo', seguiMappaAttuale);
    on('utente', () => { for (const el of document.querySelectorAll('[data-ufficiali]')) el.hidden = !eUfficiale(); });
    on('goniometro', (acceso) => { $('#vista-goniometro').checked = acceso; });
}
