// Pannello "Schiera": la tavolozza delle icone. Un tocco mette l'icona al centro della mappa.
import { app, emetti, on } from './stato.js';
import { $, crea, avviso, eTelefono } from './ui.js';
import { CATEGORIE, percorsoFazione, srcIcona } from './icone.js';
import { schiera } from './elementi.js';

let fazione = 'amica';

function disegnaTavolozza() {
    const tavolozza = $('#tavolozza');
    tavolozza.replaceChildren(...CATEGORIE.map((c, i) => crea('section', { class: 'categoria', 'aria-labelledby': `cat-${i}` },
        crea('h3', { class: 'etichetta', id: `cat-${i}` }, c.nome),
        crea('div', { class: 'tessere' }, ...c.icone.map((icona) => crea('button', {
            type: 'button',
            class: 'tessera',
            dataset: { comando: '' },
            disabled: !app.comando,
            onclick: () => metti(icona, c.tipo),
        }, crea('img', { src: srcIcona(percorsoFazione(icona.percorso, fazione)), alt: '', loading: 'lazy' }), icona.nome))),
    )));
}

function metti(icona, tipo) {
    const e = schiera(icona.percorso, tipo, fazione);
    if (!e) return;
    if (tipo === 'squadra' && !eTelefono()) {
        // Su computer la scheda si apre accanto: si può scrivere subito il nome della squadra.
        emetti('scheda:apri', e.id);
        requestAnimationFrame(() => $('#scheda-nome').focus());
    } else {
        avviso(`${icona.nome}: aggiunta al centro della mappa. Toccala per darle un nome.`, { tipo: 'ok', durata: 3000 });
    }
}

export function avviaPannelloSchiera() {
    disegnaTavolozza();
    $('#schiera-fazione').addEventListener('click', (e) => {
        const b = e.target.closest('[data-fazione]');
        if (!b) return;
        fazione = b.dataset.fazione;
        for (const x of $('#schiera-fazione').children) x.setAttribute('aria-checked', String(x === b));
        disegnaTavolozza();
    });
    on('comando', () => { for (const t of $('#tavolozza').querySelectorAll('.tessera')) t.disabled = !app.comando; });
}
