// La scheda dell'icona toccata: nome, fazione, colore del nome, cerchio tattico, squadra, orbita, elimina.
// Su computer sta a destra sopra la mappa, sul telefono sale dal basso.
import { app, emetti, on, trovaElemento } from './stato.js';
import { $, crea, metti, rimanda, eTelefono } from './ui.js';
import { modifica, mandaInOrbita, eliminaConConferma, avviaSelezione, mostraInVista } from './elementi.js';
import { srcIcona, nomeIcona, COLORI_NOME, coloreNome } from './icone.js';

let aperta = null; // id dell'elemento
const scheda = $('#scheda');
const campi = {
    nome: $('#scheda-nome'),
    capo: $('#scheda-capo'),
    vice: $('#scheda-vice'),
    membri: $('#scheda-membri'),
    cerchio: $('#scheda-cerchio'),
    raggio: $('#scheda-raggio'),
};

// Il testo si scrive libero; agli altri arriva dopo una breve pausa.
const inviaTesto = new Map();
function quandoScrivi(chiave, campiDaInviare) {
    inviaTesto.set(chiave, rimanda(() => aperta && modifica(aperta, campiDaInviare()), 250));
}
quandoScrivi('nome', () => ({ nome: campi.nome.value }));
quandoScrivi('roster', () => ({ roster: { capo: campi.capo.value, vice: campi.vice.value, membri: campi.membri.value } }));

export function apriScheda(id) {
    const e = trovaElemento(id);
    if (!e) return;
    const primaVolta = aperta !== id;
    aperta = id;
    // Sul telefono c'è posto per una cosa sola: la scheda prende il posto del pannello.
    if (eTelefono()) emetti('pannello:chiudi');
    scheda.hidden = false;
    riempi(e, true);
    if (primaVolta && !eTelefono()) scheda.focus({ preventScroll: true });
    requestAnimationFrame(() => mostraInVista(id));
}

export function chiudiScheda() {
    if (!aperta) return;
    for (const invia of inviaTesto.values()) invia.subito();
    aperta = null;
    scheda.hidden = true;
}

export const schedaAperta = () => aperta;

function riempi(e, tutto = false) {
    const titolo = e.nome || nomeIcona(e.icona) || (e.tipo === 'squadra' ? 'Squadra' : 'Marker');
    $('#scheda-icona').src = srcIcona(e.icona);
    $('#scheda-tipo').textContent = `${e.tipo === 'squadra' ? 'Squadra' : 'Marker'} · ${nomeIcona(e.icona) || 'icona'}`;
    $('#scheda-titolo').textContent = titolo;
    if (tutto) campi.nome.value = e.nome || '';
    else metti(campi.nome, e.nome || '');

    for (const b of $('#scheda-fazione').children) b.setAttribute('aria-checked', String(b.dataset.fazione === e.fazione));

    const colore = coloreNome(e);
    for (const b of $('#scheda-colori').children) b.setAttribute('aria-checked', String(b.dataset.colore === colore));

    campi.cerchio.checked = e.cerchioAttivo;
    $('#scheda-raggio-campo').hidden = !e.cerchioAttivo;
    if (document.activeElement !== campi.raggio) campi.raggio.value = String(e.raggioCerchio || 60);

    const squadra = e.tipo === 'squadra';
    $('#scheda-squadra').hidden = !squadra;
    $('#scheda-orbita').hidden = !squadra;
    if (squadra) {
        const r = e.roster || {};
        const scrivi = tutto ? (c, v) => { c.value = v; } : metti;
        scrivi(campi.capo, r.capo || '');
        scrivi(campi.vice, r.vice || '');
        scrivi(campi.membri, r.membri || '');
    }
    aggiornaPermessi();
}

function aggiornaPermessi() {
    for (const el of scheda.querySelectorAll('[data-comando]')) el.disabled = !app.comando;
}

export function avviaScheda() {
    for (const colore of COLORI_NOME) {
        $('#scheda-colori').append(crea('button', {
            type: 'button',
            role: 'radio',
            'aria-checked': 'false',
            'aria-label': `Colore ${colore}`,
            dataset: { colore, comando: '' },
            style: { '--c': colore },
            onclick: () => aperta && modifica(aperta, { colore }),
        }));
    }

    campi.nome.addEventListener('input', () => {
        $('#scheda-titolo').textContent = campi.nome.value || nomeIcona(trovaElemento(aperta)?.icona || '') || 'Senza nome';
        inviaTesto.get('nome')();
    });
    campi.nome.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') campi.nome.blur(); });
    campi.nome.addEventListener('blur', () => inviaTesto.get('nome').subito());
    for (const c of [campi.capo, campi.vice, campi.membri]) {
        c.addEventListener('input', () => inviaTesto.get('roster')());
        c.addEventListener('blur', () => inviaTesto.get('roster').subito());
    }

    $('#scheda-fazione').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-fazione]');
        if (b && aperta) modifica(aperta, { fazione: b.dataset.fazione });
    });
    campi.cerchio.addEventListener('change', () => aperta && modifica(aperta, { cerchioAttivo: campi.cerchio.checked }));
    const inviaRaggio = rimanda(() => aperta && modifica(aperta, { raggioCerchio: Number(campi.raggio.value) }), 120);
    campi.raggio.addEventListener('input', inviaRaggio);

    $('#scheda-orbita').addEventListener('click', () => {
        const id = aperta;
        chiudiScheda();
        mandaInOrbita(id);
    });
    $('#scheda-seleziona').addEventListener('click', () => {
        const id = aperta;
        chiudiScheda();
        avviaSelezione(id);
    });
    $('#scheda-elimina').addEventListener('click', async () => {
        if (await eliminaConConferma([aperta])) chiudiScheda();
    });
    $('#scheda-chiudi').addEventListener('click', chiudiScheda);

    on('scheda:apri', apriScheda);
    on('elemento:cambiato', ({ id }) => {
        if (id !== aperta) return;
        const e = trovaElemento(id);
        if (!e || e.inOrbita) chiudiScheda();
        else riempi(e);
    });
    on('elemento:tolto', (id) => { if (id === aperta) chiudiScheda(); });
    on('stato:nuovo', () => {
        const e = aperta && trovaElemento(aperta);
        if (e && !e.inOrbita) riempi(e, true);
        else chiudiScheda();
    });
    on('comando', aggiornaPermessi);
    on('mappa:clic', chiudiScheda);
    on('tasto:esc', chiudiScheda);
    // Se il pannello appena aperto finirebbe sopra la scheda (telefono, pannello largo, tablet stretto), la scheda si chiude.
    on('pannello:aperto', () => {
        if (!aperta) return;
        const p = $('#pannello').getBoundingClientRect();
        if (eTelefono() || p.right > scheda.getBoundingClientRect().left) chiudiScheda();
    });
}
