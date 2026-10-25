// La stanza in tempo reale: lo stato della mappa condiviso da tutti i collegati e chi ha il comando.
//
// Regole del comando (come nella mappa di prima):
// - admin e responsabili (gli "ufficiali") hanno sempre il comando;
// - se non c'è nessun ufficiale collegato, il comando ce l'hanno tutti;
// - con un ufficiale collegato, gli altri lo chiedono e un ufficiale lo dà o lo toglie.
const {
    normalizzaElemento, modificaElemento, normalizzaDisegni, normalizzaBounty, normalizzaZona, normalizzaStato,
    statoPulito, sfondoValido, limitiValidi, numero, SFONDO_INIZIALE, LIMITI_INIZIALI,
} = require('./normalizza');
const { UFFICIALI } = require('./accesso');
const { leggiCatalogo } = require('./mappe');

// Quando se ne vanno tutti la mappa torna pulita, ma non subito: chi chiude il tablet un attimo non perde il lavoro.
const ATTESA_AZZERAMENTO_MS = 10 * 60 * 1000;
const RIGHE_REGISTRO = 200;

function avviaStanza(io) {
    let stato = statoPulito();
    const persone = new Map(); // socket.id → { socket, utente, comando, automatico }
    const richieste = new Map(); // socket.id → quando
    const registro = [];
    let timerAzzeramento = null;

    const eUfficiale = (p) => UFFICIALI.includes(p.utente.ruolo);
    const ufficialiCollegati = () => [...persone.values()].some(eUfficiale);
    const trova = (id) => (typeof id === 'string' ? stato.squadre[id] || stato.poi[id] : undefined);

    function annota(testo) {
        const riga = { ora: Date.now(), testo };
        registro.push(riga);
        if (registro.length > RIGHE_REGISTRO) registro.shift();
        io.to('ufficiali').emit('registro', riga);
    }

    function inviaPresenze() {
        io.emit('presenze', {
            persone: [...persone.values()].map((p) => ({ sid: p.socket.id, id: p.utente.id, nome: p.utente.nome, ruolo: p.utente.ruolo, comando: p.comando })),
            richieste: [...richieste.keys()],
        });
    }

    function daiComando(p, automatico, motivo) {
        p.comando = true;
        p.automatico = automatico;
        richieste.delete(p.socket.id);
        p.socket.emit('comando', { comando: true, motivo });
    }

    function togliComando(p, motivo) {
        if (eUfficiale(p)) return;
        p.comando = false;
        p.automatico = false;
        p.socket.emit('comando', { comando: false, motivo });
    }

    function mappaCambiata({ utente, testo, tolta }) {
        annota(`${utente.nome} ${testo}.`);
        io.emit('catalogo', leggiCatalogo());
        // Se è sparita proprio la mappa che si sta guardando, si torna all'immagine di avvio.
        const sparita = tolta && (tolta.file === stato.sfondo || (tolta.cartella && stato.sfondo.startsWith(tolta.cartella + '/')));
        if (sparita) {
            stato.sfondo = SFONDO_INIZIALE;
            stato.bounds = LIMITI_INIZIALI;
            stato.zonaOperativa = normalizzaZona(null);
            io.emit('mappa', { url: stato.sfondo, bounds: stato.bounds, zona: stato.zonaOperativa });
        }
    }

    io.on('connection', (socket) => {
        const utente = socket.request.session?.utente;
        if (!utente) {
            socket.emit('serve-accesso');
            socket.disconnect(true);
            return;
        }
        clearTimeout(timerAzzeramento);

        const cerano = ufficialiCollegati();
        const persona = { socket, utente, comando: false, automatico: false };
        persone.set(socket.id, persona);

        if (eUfficiale(persona)) {
            socket.join('ufficiali');
            persona.comando = true;
            // Arriva il primo ufficiale: chi aveva il comando solo perché non c'era nessuno lo restituisce.
            if (!cerano) {
                for (const p of persone.values()) {
                    if (p.automatico) togliComando(p, `È arrivato ${utente.nome}: il comando passa agli ufficiali. Puoi chiederlo di nuovo.`);
                }
            }
        } else if (!cerano) {
            persona.comando = true;
            persona.automatico = true;
        }

        socket.emit('benvenuto', {
            utente: { ...utente, sid: socket.id },
            comando: persona.comando,
            stato,
            catalogo: leggiCatalogo(),
            registro: eUfficiale(persona) ? registro : [],
        });
        annota(`${utente.nome} è entrato.`);
        inviaPresenze();

        const puo = () => persona.comando;
        const quando = (evento, fn) => socket.on(evento, (...argomenti) => {
            try { fn(...argomenti); } catch (e) { console.error(`[STANZA] Errore su «${evento}»:`, e); }
        });

        // --- Icone sulla mappa (squadre e marker) ---
        quando('elemento:nuovo', (dati) => {
            if (!puo()) return;
            const e = normalizzaElemento(dati);
            if (!e || trova(e.id)) return;
            (e.tipo === 'squadra' ? stato.squadre : stato.poi)[e.id] = e;
            socket.broadcast.emit('elemento:nuovo', e);
            annota(`${utente.nome} ha schierato ${e.nome || (e.tipo === 'squadra' ? 'una squadra' : 'un marker')}.`);
        });

        quando('elemento:modifica', ({ id, campi } = {}) => {
            if (!puo()) return;
            const e = trova(id);
            const cambiati = modificaElemento(e, campi);
            if (!cambiati) return;
            socket.broadcast.emit('elemento:modifica', { id, campi: cambiati });
            if ('inOrbita' in cambiati) annota(`${utente.nome} ha ${cambiati.inOrbita ? 'mandato in orbita' : 'fatto rientrare'} ${e.nome || 'una squadra'}.`);
        });

        quando('elemento:sposta', ({ lista, fine } = {}) => {
            if (!puo() || !Array.isArray(lista)) return;
            const spostati = [];
            for (const s of lista.slice(0, 500)) {
                const e = trova(s?.id);
                if (!e || numero(s.lat) === null || numero(s.lng) === null) continue;
                e.lat = numero(s.lat);
                e.lng = numero(s.lng);
                spostati.push({ id: e.id, lat: e.lat, lng: e.lng });
            }
            if (!spostati.length) return;
            // Durante il trascinamento le posizioni intermedie si possono perdere; quella finale arriva sempre.
            (fine ? socket.broadcast : socket.broadcast.volatile).emit('elemento:sposta', { lista: spostati, fine: Boolean(fine) });
        });

        quando('elemento:elimina', (ids) => {
            if (!puo() || !Array.isArray(ids)) return;
            const tolti = ids.filter((id) => trova(id));
            for (const id of tolti) {
                delete stato.squadre[id];
                delete stato.poi[id];
            }
            if (!tolti.length) return;
            socket.broadcast.emit('elemento:elimina', tolti);
            annota(`${utente.nome} ha eliminato ${tolti.length === 1 ? 'un elemento' : `${tolti.length} elementi`}.`);
        });

        // --- Disegni, griglia, sfondo, bounty ---
        quando('disegni', (g) => {
            if (!puo()) return;
            stato.disegni = normalizzaDisegni(g);
            socket.broadcast.emit('disegni', stato.disegni);
        });

        quando('griglia', (attiva) => {
            if (!puo()) return;
            stato.grigliaAttiva = attiva === true;
            io.emit('griglia', stato.grigliaAttiva);
        });

        quando('mappa', ({ url, bounds, zona } = {}) => {
            if (!puo() || !sfondoValido(url) || !limitiValidi(bounds)) return;
            stato.sfondo = url;
            stato.bounds = bounds;
            stato.zonaOperativa = normalizzaZona(zona);
            io.emit('mappa', { url, bounds, zona: stato.zonaOperativa });
            annota(`${utente.nome} ha cambiato la mappa.`);
        });

        quando('bounty', (dati) => {
            if (!puo()) return;
            stato.bounty = normalizzaBounty(dati);
            socket.broadcast.emit('bounty', stato.bounty);
        });

        // --- Ping: lo può mandare chiunque, al massimo uno al secondo ---
        let ultimoPing = 0;
        quando('ping', ({ lat, lng } = {}) => {
            if (numero(lat) === null || numero(lng) === null || Date.now() - ultimoPing < 800) return;
            ultimoPing = Date.now();
            socket.broadcast.emit('ping', { lat, lng, id: utente.id, nome: utente.nome, ruolo: utente.ruolo });
        });

        // --- Missione intera ---
        quando('missione:carica', (dati) => {
            if (!puo()) return socket.emit('avviso', { testo: 'Serve il comando per caricare una missione.', tipo: 'errore' });
            const nuovo = normalizzaStato(dati);
            if (!nuovo) return socket.emit('avviso', { testo: 'Questo file non è una missione della mappa tattica.', tipo: 'errore' });
            stato = nuovo;
            io.emit('stato', stato);
            annota(`${utente.nome} ha caricato una missione da file.`);
        });

        quando('missione:azzera', () => {
            const puoAzzerare = eUfficiale(persona) || (persona.comando && !ufficialiCollegati());
            if (!puoAzzerare) return;
            stato.squadre = {};
            stato.poi = {};
            stato.disegni = null;
            io.emit('stato', stato);
            annota(`${utente.nome} ha azzerato la mappa.`);
        });

        // --- Comando ---
        quando('comando:chiedi', () => {
            if (persona.comando) return;
            if (!ufficialiCollegati()) {
                daiComando(persona, true, 'Nessun ufficiale collegato: hai il comando.');
                annota(`${utente.nome} ha preso il comando (nessun ufficiale collegato).`);
            } else {
                richieste.set(socket.id, Date.now());
                io.to('ufficiali').emit('richiesta', { sid: socket.id, nome: utente.nome });
                annota(`${utente.nome} chiede il comando.`);
            }
            inviaPresenze();
        });

        quando('comando:approva', (sid) => {
            const altro = persone.get(sid);
            if (!eUfficiale(persona) || !altro || !richieste.has(sid)) return;
            daiComando(altro, false, `${utente.nome} ti ha dato il comando.`);
            annota(`${utente.nome} ha dato il comando a ${altro.utente.nome}.`);
            inviaPresenze();
        });

        quando('comando:rifiuta', (sid) => {
            const altro = persone.get(sid);
            if (!eUfficiale(persona) || !altro || !richieste.delete(sid)) return;
            altro.socket.emit('avviso', { testo: `${utente.nome} non ti ha dato il comando, per ora.` });
            annota(`${utente.nome} non ha dato il comando a ${altro.utente.nome}.`);
            inviaPresenze();
        });

        quando('comando:revoca', (sid) => {
            const altro = persone.get(sid);
            if (!eUfficiale(persona) || !altro || !altro.comando || eUfficiale(altro)) return;
            togliComando(altro, `${utente.nome} ti ha tolto il comando.`);
            annota(`${utente.nome} ha tolto il comando a ${altro.utente.nome}.`);
            inviaPresenze();
        });

        quando('comando:lascia', () => {
            if (eUfficiale(persona) || !persona.comando) return;
            togliComando(persona, 'Hai lasciato il comando.');
            annota(`${utente.nome} ha lasciato il comando.`);
            inviaPresenze();
        });

        quando('disconnect', () => {
            persone.delete(socket.id);
            richieste.delete(socket.id);
            annota(`${utente.nome} è uscito.`);
            // Se è uscito l'ultimo ufficiale, il comando torna a tutti.
            if (eUfficiale(persona) && !ufficialiCollegati()) {
                for (const p of persone.values()) {
                    if (!p.comando) daiComando(p, true, 'Non c\'è più nessun ufficiale collegato: hai il comando.');
                }
            }
            inviaPresenze();
            if (persone.size === 0) {
                timerAzzeramento = setTimeout(() => {
                    stato = statoPulito();
                    registro.length = 0;
                    console.log('[STANZA] Nessuno collegato da 10 minuti: mappa, icone e bounty riportati all\'inizio.');
                }, ATTESA_AZZERAMENTO_MS);
            }
        });
    });

    return { mappaCambiata };
}

module.exports = { avviaStanza };
