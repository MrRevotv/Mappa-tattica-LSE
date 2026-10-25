// Il calcolatore «Bounty e salvage»: materiali, spese, pagamenti e commissioni.
// Stesso calcolo e stesso formato dati della mappa di prima; chi lo usa riceve i dati con cambiato(dati).
import { $, $$, crea, icona, conferma } from './ui.js';

const LISTE = {
    materiali: { campi: [['name', 'text'], ['qty', 'number'], ['price', 'number']], vuoto: 'Nessun materiale.' },
    spese: { campi: [['desc', 'text'], ['amt', 'number'], ['name', 'text']], vuoto: 'Nessuna spesa.' },
    pagamenti: { campi: [['name', 'text'], ['delta', 'number']], vuoto: 'Nessun player.' },
};
const CONFIG_PREDEFINITA = { bank: '0.5', org: '0', giverPct: '0', sellerPct: '0' };
const numero = (v) => Number(String(v).replace(',', '.')) || 0;
const uec = (n) => Math.round(n).toLocaleString('it-IT');

let avvisa = () => {};
const contenitore = (lista) => $(`#bounty-${lista}`);

function testata(lista) {
    const colonne = contenitore(lista).dataset.colonne.split('|');
    return crea('div', { class: 'tabella-testa', 'aria-hidden': 'true' }, ...colonne.map((c) => crea('span', {}, c)), crea('span'));
}

function riga(lista, valori = {}) {
    const etichette = contenitore(lista).dataset.colonne.split('|');
    const el = crea('div', { class: 'riga' });
    LISTE[lista].campi.forEach(([campo, tipo], i) => {
        const input = crea('input', {
            type: tipo,
            'aria-label': etichette[i],
            dataset: { campo },
            ...(tipo === 'number' && { inputmode: 'decimal', step: 'any', min: lista === 'pagamenti' ? false : '0' }),
        });
        input.value = valori[campo] ?? (campo === 'delta' ? '0' : '');
        el.append(input);
    });
    if (lista === 'pagamenti') el.append(crea('output', { class: 'quota' }, '0 UEC'));
    el.append(crea('button', {
        type: 'button',
        class: 'pulsante-icona',
        'aria-label': 'Togli la riga',
        onclick: () => { el.remove(); quandoCambia(); },
    }, icona('x')));
    return el;
}

function righe(lista) {
    return $$('.riga', contenitore(lista));
}

function sistemaVuoto(lista) {
    const c = contenitore(lista);
    const senzaRighe = righe(lista).length === 0;
    c.querySelector('.tabella-testa').hidden = senzaRighe;
    let vuoto = c.querySelector('.vuoto');
    if (senzaRighe && !vuoto) c.append(vuoto = crea('p', { class: 'vuoto' }, LISTE[lista].vuoto));
    if (!senzaRighe) vuoto?.remove();
}

export function leggi() {
    const dati = {};
    for (const lista of Object.keys(LISTE)) {
        dati[lista] = righe(lista).map((r) => Object.fromEntries($$('input', r).map((i) => [i.dataset.campo, i.value])));
    }
    dati.config = Object.fromEntries($$('[data-config]').map((i) => [i.dataset.config, i.value]));
    return dati;
}

// Il calcolo, identico alla mappa di prima.
function calcola() {
    const d = leggi();
    const lordo = d.materiali.reduce((s, m) => s + numero(m.price), 0);
    let spese = 0;
    const anticipate = {};
    for (const s of d.spese) {
        const v = numero(s.amt);
        spese += v;
        const chi = s.name.trim();
        if (chi) anticipate[chi] = (anticipate[chi] || 0) + v;
    }
    const dopoSpese = lordo - spese;
    const c = d.config;
    const banca = Math.round((dopoSpese * numero(c.bank)) / 100);
    const base = dopoSpese - banca;
    const giver = Math.round((base * numero(c.giverPct)) / 100);
    const venditore = Math.round((base * numero(c.sellerPct)) / 100);
    const org = Math.round((base * numero(c.org)) / 100);
    const netto = base - giver - venditore - org;

    $('#r-lordo').textContent = uec(lordo);
    $('#r-spese').textContent = uec(spese);
    $('#r-banca').textContent = uec(banca);
    $('#r-org').textContent = uec(org);
    $('#r-giver').textContent = uec(giver);
    $('#r-venditore').textContent = uec(venditore);
    $('#r-netto').textContent = uec(netto);

    const giocatori = righe('pagamenti');
    const pesi = giocatori.map((r) => (r.querySelector('[data-campo="name"]').value.trim() ? 1 + numero(r.querySelector('[data-campo="delta"]').value) / 100 : 0));
    const sommaPesi = pesi.reduce((a, b) => a + b, 0) || 1;
    giocatori.forEach((r, i) => {
        const nome = r.querySelector('[data-campo="name"]').value.trim();
        let quota = 0;
        if (nome) {
            quota = (netto / sommaPesi) * pesi[i];
            if (nome === (c.giverName || '').trim()) quota += giver;
            if (nome === (c.sellerName || '').trim()) quota += venditore;
            if (nome === (c.treasName || '').trim()) quota += org;
            quota += anticipate[nome] || 0;
        }
        r.querySelector('.quota').textContent = `${uec(quota)} UEC`;
    });
}

function quandoCambia() {
    for (const lista of Object.keys(LISTE)) sistemaVuoto(lista);
    calcola();
    avvisa(leggi());
}

// Dati arrivati (all'ingresso o da un altro): si aggiornano le caselle senza togliere il cursore a chi scrive.
export function applica(dati) {
    for (const lista of Object.keys(LISTE)) {
        const c = contenitore(lista);
        const valori = Array.isArray(dati?.[lista]) ? dati[lista] : [];
        let attuali = righe(lista);
        while (attuali.length > valori.length) attuali.pop().remove();
        while (attuali.length < valori.length) {
            c.append(riga(lista));
            attuali = righe(lista);
        }
        valori.forEach((v, i) => {
            for (const input of $$('input', attuali[i])) {
                if (document.activeElement !== input) input.value = v[input.dataset.campo] ?? '';
            }
        });
        sistemaVuoto(lista);
    }
    const config = { ...CONFIG_PREDEFINITA, ...(dati?.config || {}) };
    for (const input of $$('[data-config]')) {
        if (document.activeElement !== input) input.value = config[input.dataset.config] ?? '';
    }
    calcola();
}

// cambiato(dati) a ogni modifica fatta qui (non per i dati arrivati con applica).
export function avviaCalcolatore({ cambiato }) {
    avvisa = cambiato;
    for (const lista of Object.keys(LISTE)) contenitore(lista).append(testata(lista));
    $('.bounty').addEventListener('input', (e) => { if (e.target.matches('input')) quandoCambia(); });
    for (const b of $$('[data-aggiungi]')) {
        b.addEventListener('click', () => {
            const nuova = riga(b.dataset.aggiungi);
            contenitore(b.dataset.aggiungi).append(nuova);
            nuova.querySelector('input').focus();
            quandoCambia();
        });
    }
    $('#bounty-pulisci').addEventListener('click', async () => {
        const ok = await conferma({ titolo: 'Pulire il calcolatore?', testo: 'Materiali, spese e pagamenti tornano vuoti per tutti quelli della sessione. Le commissioni restano.', si: 'Pulisci', pericolo: true });
        if (!ok) return;
        applica({ materiali: [{}], spese: [{}], pagamenti: [{}], config: leggi().config });
        quandoCambia();
    });
    applica(null);
}
