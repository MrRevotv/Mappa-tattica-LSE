// Chi ha il comando: i campi che si bloccano in sola visione, le richieste che arrivano agli ufficiali.
// Lo stato del comando si vede e si chiede nel pannello «Commando».
import { app, emetti, invia, on, eUfficiale } from './stato.js';
import { $, $$, avviso } from './ui.js';
import { suonoRichiesta } from './suoni.js';
import { apriPannello } from './pannelli.js';

export function chiediComando() {
    if (app.comando || app.richiestaInviata) return;
    app.richiestaInviata = true;
    invia('comando:chiedi');
    aggiornaComando();
}

export function aggiornaComando() {
    if (app.comando) app.richiestaInviata = false;
    document.body.classList.toggle('sola-visione', !app.comando);
    for (const el of $$('[data-comando]')) el.disabled = !app.comando;
    const segnale = $('#segnale-richieste');
    const n = eUfficiale() ? app.presenze.richieste.length : 0;
    segnale.hidden = n === 0;
    segnale.textContent = String(n);
    emetti('comando', app.comando);
}

export function avviaComando() {
    on('presenze', () => {
        // La richiesta non c'è più (rifiutata o persa): si può chiedere di nuovo.
        if (app.richiestaInviata && !app.presenze.richieste.includes(app.utente.sid)) app.richiestaInviata = false;
        aggiornaComando();
    });
    on('serve-comando', (testo) => avviso(testo, { azione: app.comando ? null : { testo: 'Chiedi il comando', fai: chiediComando } }));
    on('richiesta', ({ nome }) => {
        suonoRichiesta();
        avviso(`${nome} chiede il comando.`, { durata: 8000, azione: { testo: 'Vedi', fai: () => apriPannello('missione') } });
    });
}
