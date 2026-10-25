// Lo stato condiviso del browser: chi sono, in che sessione sono, se ho il comando, lo stato della mappa ricevuto dal server.
// I moduli si parlano con piccoli eventi (on / emetti) invece di chiamarsi a vicenda.

export const app = {
    utente: null,
    sessione: null, // la sessione in cui sono (come nell'elenco)
    sessioni: [],
    capo: false, // ufficiale o creatore della sessione: comando sempre, decide chi altro lo ha
    comando: false,
    richiestaInviata: false,
    stato: null,
    catalogo: { giochi: [], luoghi: [] },
    presenze: { persone: [], richieste: [] },
    socket: null,
    dentroIlSito: window.parent !== window,
};

const ascoltatori = new Map();

export function on(evento, fn) {
    if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set());
    ascoltatori.get(evento).add(fn);
}

export function emetti(evento, dati) {
    for (const fn of ascoltatori.get(evento) || []) {
        try { fn(dati); } catch (e) { console.error(`[mappa] errore su «${evento}»`, e); }
    }
}

export function invia(evento, dati) {
    app.socket?.emit(evento, dati);
}

export const UFFICIALI = ['admin', 'responsabile'];
export const eUfficiale = (ruolo = app.utente?.ruolo) => UFFICIALI.includes(ruolo);

export const NOMI_RUOLI = { admin: 'Admin', responsabile: 'Responsabile', 'p-lse': 'P-LSE', operatore: 'Operatore' };

export function trovaElemento(id) {
    return app.stato?.squadre[id] || app.stato?.poi[id];
}

export function tuttiGliElementi() {
    return app.stato ? [...Object.values(app.stato.squadre), ...Object.values(app.stato.poi)] : [];
}

export function collezioneDi(tipo) {
    return tipo === 'squadra' ? app.stato.squadre : app.stato.poi;
}
