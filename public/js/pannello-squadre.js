// Pannello "Squadre": le squadre amiche sul campo e quelle in orbita (fuori dalla mappa, con le note).
// Nome, caposquadra, vice e membri si scrivono qui o nella scheda dell'icona: è lo stesso dato.
import { app, on, tuttiGliElementi, trovaElemento } from './stato.js';
import { $, crea, icona, metti, rimanda } from './ui.js';
import { srcIcona, nomeIcona } from './icone.js';
import { modifica, mandaInOrbita, rientra, trova } from './elementi.js';
import { pannelloAperto } from './pannelli.js';

const invii = new Map(); // id → { nome, roster, note } con l'invio rimandato

function invioDi(id) {
    if (!invii.has(id)) {
        invii.set(id, {
            nome: rimanda((v) => modifica(id, { nome: v }), 250),
            roster: rimanda((r) => modifica(id, { roster: r }), 250),
            note: rimanda((v) => modifica(id, { note: v }), 400),
        });
    }
    return invii.get(id);
}

const squadreAmiche = () => tuttiGliElementi().filter((e) => e.tipo === 'squadra' && e.fazione !== 'nemica');

function campo(id, chiave, etichetta, valore, { area = false, largo = false, segnaposto = '' } = {}) {
    const idCampo = `sq-${chiave}-${id}`;
    const attributi = { id: idCampo, dataset: { campo: chiave, comando: '' }, disabled: !app.comando, autocomplete: 'off', placeholder: segnaposto };
    const input = area
        ? crea('textarea', { ...attributi, rows: 2, maxlength: chiave === 'note' ? 1000 : 600 })
        : crea('input', { ...attributi, type: 'text', maxlength: 80 });
    input.value = valore || '';
    return crea('div', { class: `campo${largo ? ' largo' : ''}` }, crea('label', { for: idCampo }, etichetta), input);
}

function scheda(e) {
    const r = e.roster || {};
    const nome = crea('input', {
        type: 'text',
        maxlength: 60,
        autocomplete: 'off',
        'aria-label': 'Nome della squadra',
        placeholder: nomeIcona(e.icona) || 'Nome della squadra',
        dataset: { campo: 'nome', comando: '' },
        disabled: !app.comando,
    });
    nome.value = e.nome || '';
    const el = crea('article', { class: 'squadra', dataset: { id: e.id } },
        crea('div', { class: 'squadra-testa' }, crea('img', { src: srcIcona(e.icona), alt: '' }), nome),
        crea('div', { class: 'campi' },
            campo(e.id, 'capo', 'Caposquadra', r.capo),
            campo(e.id, 'vice', 'Vice', r.vice),
            campo(e.id, 'membri', 'Membri', r.membri, { area: true, largo: true, segnaposto: 'Separati da virgola' }),
            e.inOrbita ? campo(e.id, 'note', 'Note e compiti', e.note, { area: true, largo: true, segnaposto: 'Cosa sta facendo, quando rientra…' }) : null,
        ),
        crea('div', { class: 'squadra-azioni' },
            e.inOrbita
                ? crea('button', { type: 'button', class: 'pulsante piccolo', dataset: { comando: '' }, disabled: !app.comando, onclick: () => rientra(e.id) },
                    icona('arrow-u-down-left'), 'Rientra sulla mappa')
                : [
                    crea('button', { type: 'button', class: 'pulsante piccolo', onclick: () => trova(e.id) }, icona('crosshair'), 'Trova'),
                    crea('button', { type: 'button', class: 'pulsante piccolo', dataset: { comando: '' }, disabled: !app.comando, onclick: () => mandaInOrbita(e.id) },
                        icona('planet'), 'In orbita'),
                ],
        ),
    );
    el.addEventListener('input', (ev) => {
        const chiave = ev.target.dataset.campo;
        if (!chiave) return;
        const invio = invioDi(e.id);
        if (chiave === 'nome') invio.nome(ev.target.value);
        else if (chiave === 'note') invio.note(ev.target.value);
        else invio.roster(Object.fromEntries(['capo', 'vice', 'membri'].map((c) => [c, el.querySelector(`[data-campo="${c}"]`).value])));
    });
    el.addEventListener('focusout', () => {
        const invio = invii.get(e.id);
        if (invio) for (const f of Object.values(invio)) f.subito();
    });
    return el;
}

function disegna() {
    if (pannelloAperto() !== 'squadre') return;
    const squadre = squadreAmiche().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const campo = squadre.filter((e) => !e.inOrbita);
    const orbita = squadre.filter((e) => e.inOrbita);
    // Se stai scrivendo in una scheda, il fuoco resta lì anche dopo il ridisegno.
    const fuoco = document.activeElement?.closest('.squadra') ? [document.activeElement.closest('.squadra').dataset.id, document.activeElement.dataset.campo] : null;

    $('#squadre-campo').replaceChildren(...(campo.length ? campo.map(scheda) : [crea('p', { class: 'vuoto' }, 'Nessuna squadra amica sulla mappa. Aggiungile da «Schiera».')]));
    $('#squadre-orbita').replaceChildren(...(orbita.length ? orbita.map(scheda) : [crea('p', { class: 'vuoto' }, 'Nessuna squadra in orbita. Dalla scheda di una squadra: «Manda in orbita».')]));
    $('#conta-campo').textContent = campo.length ? `(${campo.length})` : '';
    $('#conta-orbita').textContent = orbita.length ? `(${orbita.length})` : '';

    if (fuoco) {
        const el = document.querySelector(`.squadra[data-id="${CSS.escape(fuoco[0])}"] [data-campo="${fuoco[1]}"]`);
        el?.focus();
    }
}

// Cambi piccoli (testo arrivato da un altro): si aggiorna solo il campo, senza ridisegnare.
function aggiornaCampi(id, campi) {
    const el = document.querySelector(`.squadra[data-id="${CSS.escape(id)}"]`);
    const e = trovaElemento(id);
    if (!el || !e) return disegna();
    if ('nome' in campi) metti(el.querySelector('[data-campo="nome"]'), e.nome || '');
    if ('note' in campi) metti(el.querySelector('[data-campo="note"]'), e.note || '');
    if ('roster' in campi) for (const c of ['capo', 'vice', 'membri']) metti(el.querySelector(`[data-campo="${c}"]`), e.roster?.[c] || '');
}

export function avviaPannelloSquadre() {
    on('pannello:aperto', (nome) => { if (nome === 'squadre') disegna(); });
    on('stato:nuovo', disegna);
    on('elementi:cambiati', disegna);
    on('elemento:tolto', disegna);
    on('elemento:cambiato', ({ id, campi }) => {
        if (pannelloAperto() !== 'squadre') return;
        if ('inOrbita' in campi || 'fazione' in campi || 'icona' in campi) disegna();
        else if ('nome' in campi || 'roster' in campi || 'note' in campi) aggiornaCampi(id, campi);
    });
    on('comando', disegna);
}
