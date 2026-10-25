// Gli strumenti a sinistra (in basso sul telefono): un pannello aperto alla volta, Esc lo chiude.
// "Disegna" non apre un pannello ma la barra del disegno sopra la mappa.
import { app, emetti, on } from './stato.js';
import { $, $$ } from './ui.js';
import { apriBarra, chiudiBarra, barraAperta } from './disegno.js';

const pannello = $('#pannello');
let aperto = null;

const voce = (nome) => $(`.binario-voce[data-pannello="${nome}"]`);

function segnaVoci() {
    for (const b of $$('.binario-voce')) {
        const nome = b.dataset.pannello;
        b.setAttribute('aria-expanded', String(nome === 'disegna' ? barraAperta() : nome === aperto));
    }
}

export function apriPannello(nome) {
    if (nome === 'disegna') {
        if (barraAperta()) {
            chiudiBarra();
        } else {
            if (!app.comando) {
                emetti('serve-comando', 'Serve il comando per disegnare sulla mappa.');
                return;
            }
            chiudiPannello();
            apriBarra();
        }
        segnaVoci();
        return;
    }
    if (aperto === nome) {
        chiudiPannello();
        return;
    }
    if (barraAperta()) chiudiBarra();
    aperto = nome;
    for (const vista of $$('.vista', pannello)) vista.hidden = vista.dataset.vista !== nome;
    const vista = $(`.vista[data-vista="${nome}"]`, pannello);
    $('#pannello-titolo').textContent = vista.dataset.titolo;
    pannello.classList.toggle('largo', vista.classList.contains('vista-larga'));
    pannello.hidden = false;
    $('.pannello-corpo', pannello).scrollTop = 0;
    segnaVoci();
    emetti('pannello:aperto', nome);
}

export function chiudiPannello({ rimettiFuoco = false } = {}) {
    if (!aperto) return;
    const era = aperto;
    aperto = null;
    pannello.hidden = true;
    segnaVoci();
    if (rimettiFuoco) voce(era)?.focus();
    emetti('pannello:chiuso', era);
}

export const pannelloAperto = () => aperto;

export function avviaPannelli() {
    for (const b of $$('.binario-voce')) b.addEventListener('click', () => apriPannello(b.dataset.pannello));
    $('[data-chiudi-pannello]').addEventListener('click', () => chiudiPannello({ rimettiFuoco: true }));

    // Esc chiude una cosa alla volta: prima quella che si sta usando (scheda, disegno, selezione), poi il pannello.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || $('#dialogo').open) return;
        const sopraLaMappa = !$('#scheda').hidden || barraAperta() || !$('#barra-selezione').hidden;
        if (aperto && (document.activeElement?.closest('#pannello') || !sopraLaMappa)) chiudiPannello({ rimettiFuoco: true });
        else emetti('tasto:esc');
    });

    on('pannello:chiudi', () => chiudiPannello());
    on('disegno:chiuso', segnaVoci);
}
