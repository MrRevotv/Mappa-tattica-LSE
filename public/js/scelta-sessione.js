// In quale sessione della mappa si sta: la scelta all'arrivo (se ce n'è più di una), il cambio, la creazione e la
// chiusura. La sessione scelta resta nell'indirizzo della pagina, così ricaricando si torna lì.
import { app, on, eUfficiale } from './stato.js';
import { $, avviso } from './ui.js';
import { rigaSessione, puoChiudere, nuovaSessione, chiudiSessione as chiudi } from './sessioni.js';

const PRINCIPALE = 'principale';
const dialogo = $('#dialogo-sessioni');
let allArrivo = false;
let scelta = false;

const entra = (id) => app.socket.emit('sessione:entra', id);

function disegna() {
    $('#elenco-sessioni').replaceChildren(...app.sessioni.map((s) => rigaSessione(s, {
        attuale: s.id === app.sessione?.id,
        mia: s.creatoreId === app.utente.id,
        chiudibile: puoChiudere(s, app.utente, eUfficiale()),
        entra: (s) => {
            scelta = true;
            entra(s.id);
            dialogo.close();
        },
        chiudi: chiudiSessione,
    })));
}

export function apriScelta({ arrivo = false } = {}) {
    allArrivo = arrivo;
    scelta = false;
    $('#sessioni-chiudi').hidden = arrivo;
    disegna();
    if (!dialogo.open) dialogo.showModal();
}

export function chiudiSessione(s) {
    chiudi(app.socket, s, 'Sparisce per tutti, con la sua mappa, le icone e i disegni. Chi è dentro torna nella Principale. Se ti serve, salva prima la missione.');
}

// Appena collegati: si rientra dove si era (collegamento perso, pagina ricaricata) oppure si sceglie.
// Restituisce false se ha aperto la scelta.
export function entraAllInizio() {
    const voluta = app.sessione?.id || new URLSearchParams(location.search).get('sessione');
    if (voluta && app.sessioni.some((s) => s.id === voluta)) {
        entra(voluta);
        return true;
    }
    if (voluta) avviso('La sessione in cui eri è stata chiusa.');
    if (app.sessioni.length === 1) {
        entra(app.sessioni[0].id);
        return true;
    }
    apriScelta({ arrivo: true });
    return false;
}

export function ricordaSessione(s) {
    history.replaceState(null, '', s.principale ? location.pathname : `${location.pathname}?sessione=${encodeURIComponent(s.id)}`);
}

export function avviaSceltaSessione() {
    // All'arrivo, chiudere senza scegliere (Esc) vuol dire entrare nella Principale.
    dialogo.addEventListener('close', () => {
        if (allArrivo && !scelta) entra(PRINCIPALE);
    });
    $('#sessioni-chiudi').addEventListener('click', () => dialogo.close());
    $('#sessioni-nuova').addEventListener('click', () => nuovaSessione(app.socket, {
        titolo: 'Nuova sessione della mappa',
        fatto: () => {
            scelta = true;
            dialogo.close();
        },
    }));
    on('sessioni', () => { if (dialogo.open) disegna(); });
    on('sessione:sparita', () => {
        avviso('Quella sessione non c\'è più: scegline un\'altra.', { tipo: 'errore' });
        apriScelta({ arrivo: !app.stato });
    });
}
