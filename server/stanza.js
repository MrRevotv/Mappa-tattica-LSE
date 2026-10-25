// Le sessioni della mappa in tempo reale. Ogni sessione ha la sua mappa (sfondo, icone, disegni, griglia), i suoi
// collegati, il suo comando e il suo registro; ognuno sta in una sessione alla volta e può cambiarla quando vuole.
//
// - La sessione «Principale» c'è sempre: quando se ne vanno tutti torna pulita dopo 10 minuti, come prima.
// - Chiunque può aprirne un'altra: è salvata sul disco e si cancella da sola dopo 5 giorni che nessuno la usa;
//   prima la può chiudere chi l'ha creata (o un ufficiale). Chi è dentro torna nella Principale.
//
// Regole del comando, in ogni sessione (come nella mappa di prima, con in più chi ha creato la sessione):
// - admin e responsabili (gli "ufficiali") e chi ha creato la sessione (insieme, i "capi") hanno sempre il comando;
// - se nella sessione non c'è nessun capo, il comando ce l'hanno tutti;
// - con un capo nella sessione, gli altri lo chiedono e un capo lo dà o lo toglie.
const {
    normalizzaElemento, modificaElemento, normalizzaDisegni, normalizzaZona, normalizzaStato, normalizzaNome,
    normalizzaCreatore, statoPulito, sfondoValido, limitiValidi, numero, SFONDO_INIZIALE, LIMITI_INIZIALI,
} = require('./normalizza');
const { UFFICIALI } = require('./accesso');
const { leggiCatalogo } = require('./mappe');
const { creaArchivio, nuovoId, idValido, istante, scaduta, DURATA_MS, CONTROLLO_SCADENZE_MS } = require('./archivio');

const PRINCIPALE = 'principale';
// Quando se ne vanno tutti la Principale torna pulita, ma non subito: chi chiude il tablet un attimo non perde il lavoro.
const ATTESA_AZZERAMENTO_MS = 10 * 60 * 1000;
const RIGHE_REGISTRO = 200;
const SESSIONI_A_TESTA = 3;
const SESSIONI_IN_TUTTO = 30;

function avviaStanze(io) {
    const archivio = creaArchivio('mappa');
    const stanze = new Map(); // id → sessione

    function nuovaStanza({ id, nome, creatore = null, stato = statoPulito(), creata = Date.now(), ultimoUso = Date.now() }) {
        const s = {
            id, nome, creatore, stato, creata, ultimoUso,
            persone: new Map(), // socket.id → { socket, utente, comando, automatico, stanza }
            richieste: new Map(), // socket.id → quando
            registro: [],
            timerAzzeramento: null,
        };
        stanze.set(id, s);
        return s;
    }

    const principale = nuovaStanza({ id: PRINCIPALE, nome: 'Principale' });
    for (const d of archivio.leggiTutte()) {
        const stato = normalizzaStato(d.stato);
        if (!stato || d.id === PRINCIPALE) continue;
        nuovaStanza({
            id: d.id,
            nome: normalizzaNome(d.nome) || 'Sessione',
            creatore: normalizzaCreatore(d.creatore),
            stato,
            creata: istante(d.creata),
            ultimoUso: istante(d.ultimoUso),
        });
    }

    const stanza = (s) => `m:${s.id}`;
    const capiDi = (s) => `m:${s.id}:capi`;
    const eUfficiale = (p) => UFFICIALI.includes(p.utente.ruolo);
    const eCapo = (p, s) => eUfficiale(p) || (s.creatore !== null && s.creatore.id === p.utente.id);
    const capiDentro = (s) => [...s.persone.values()].some((p) => eCapo(p, s));
    const trova = (s, id) => (typeof id === 'string' ? s.stato.squadre[id] || s.stato.poi[id] : undefined);

    function annota(s, testo) {
        const riga = { ora: Date.now(), testo };
        s.registro.push(riga);
        if (s.registro.length > RIGHE_REGISTRO) s.registro.shift();
        io.to(capiDi(s)).emit('registro', riga);
    }

    // Usata adesso: si sposta in avanti la scadenza e si salva (la Principale non si salva).
    function toccata(s) {
        s.ultimoUso = Date.now();
        if (s.id === PRINCIPALE) return;
        archivio.salva(s.id, () => ({ id: s.id, nome: s.nome, creatore: s.creatore, creata: s.creata, ultimoUso: s.ultimoUso, stato: s.stato }));
    }

    function infoSessione(s) {
        const nomi = [...new Map([...s.persone.values()].map((p) => [p.utente.id, p.utente.nome])).values()];
        return {
            id: s.id,
            nome: s.nome,
            principale: s.id === PRINCIPALE,
            creatore: s.creatore?.nome ?? null,
            creatoreId: s.creatore?.id ?? null,
            dentro: nomi.length,
            nomi: nomi.slice(0, 8),
            scade: s.id === PRINCIPALE ? null : s.ultimoUso + DURATA_MS,
        };
    }

    // Prima la Principale, poi le altre dalla più usata di recente.
    function elenco() {
        return [...stanze.values()]
            .sort((a, b) => Number(b.id === PRINCIPALE) - Number(a.id === PRINCIPALE) || b.ultimoUso - a.ultimoUso)
            .map(infoSessione);
    }

    const inviaElenco = () => io.emit('sessioni', elenco());

    function inviaPresenze(s) {
        io.to(stanza(s)).emit('presenze', {
            persone: [...s.persone.values()].map((p) => ({
                sid: p.socket.id, id: p.utente.id, nome: p.utente.nome, ruolo: p.utente.ruolo, comando: p.comando, capo: eCapo(p, s),
            })),
            richieste: [...s.richieste.keys()],
        });
    }

    function daiComando(p, s, automatico, motivo) {
        p.comando = true;
        p.automatico = automatico;
        s.richieste.delete(p.socket.id);
        p.socket.emit('comando', { comando: true, motivo });
    }

    function togliComando(p, s, motivo) {
        if (eCapo(p, s)) return;
        p.comando = false;
        p.automatico = false;
        p.socket.emit('comando', { comando: false, motivo });
    }

    function entra(persona, s) {
        clearTimeout(s.timerAzzeramento);
        const cerano = capiDentro(s);
        const { socket, utente } = persona;
        persona.stanza = s;
        persona.comando = false;
        persona.automatico = false;
        s.persone.set(socket.id, persona);
        socket.join(stanza(s));

        if (eCapo(persona, s)) {
            socket.join(capiDi(s));
            persona.comando = true;
            // Arriva il primo capo: chi aveva il comando solo perché non c'era nessuno lo restituisce.
            if (!cerano) {
                for (const p of s.persone.values()) {
                    if (p.automatico) togliComando(p, s, `Ora c'è ${utente.nome}: il comando lo dà chi guida la sessione. Puoi chiederlo di nuovo.`);
                }
            }
        } else if (!cerano) {
            persona.comando = true;
            persona.automatico = true;
        }

        socket.emit('benvenuto', {
            sessione: infoSessione(s),
            comando: persona.comando,
            capo: eCapo(persona, s),
            stato: s.stato,
            catalogo: leggiCatalogo(),
            registro: eCapo(persona, s) ? s.registro : [],
        });
        annota(s, `${utente.nome} è entrato.`);
        toccata(s);
        inviaPresenze(s);
        inviaElenco();
    }

    function esci(persona, { elenco: aggiornaElenco = true } = {}) {
        const s = persona.stanza;
        if (!s) return;
        const { socket, utente } = persona;
        persona.stanza = null;
        s.persone.delete(socket.id);
        s.richieste.delete(socket.id);
        socket.leave(stanza(s));
        socket.leave(capiDi(s));
        annota(s, `${utente.nome} è uscito.`);
        // Se è uscito l'ultimo capo, il comando torna a tutti.
        if (eCapo(persona, s) && !capiDentro(s)) {
            const motivo = s.id === PRINCIPALE
                ? 'Non c\'è più nessun ufficiale collegato: hai il comando.'
                : 'Non c\'è più nessuno che guida la sessione: hai il comando.';
            for (const p of s.persone.values()) {
                if (!p.comando) daiComando(p, s, true, motivo);
            }
        }
        inviaPresenze(s);
        toccata(s);
        if (s.persone.size === 0 && s.id === PRINCIPALE) {
            s.timerAzzeramento = setTimeout(() => {
                s.stato = statoPulito();
                s.registro.length = 0;
                console.log('[STANZA] Nessuno nella Principale da 10 minuti: mappa e icone riportate all\'inizio.');
            }, ATTESA_AZZERAMENTO_MS);
        }
        if (aggiornaElenco) inviaElenco();
    }

    // Chi è dentro torna nella Principale; la sessione sparisce anche dal disco.
    function chiudi(s, motivo) {
        for (const p of [...s.persone.values()]) {
            esci(p, { elenco: false });
            p.socket.emit('avviso', { testo: motivo });
            entra(p, principale);
        }
        stanze.delete(s.id);
        archivio.cancella(s.id);
        inviaElenco();
    }

    function togliScadute() {
        let tolte = 0;
        for (const s of stanze.values()) {
            if (s.id === PRINCIPALE || !scaduta(s)) continue;
            stanze.delete(s.id);
            archivio.cancella(s.id);
            tolte++;
            console.log(`[STANZA] Sessione «${s.nome}» cancellata: nessuno la usava da 5 giorni.`);
        }
        if (tolte) inviaElenco();
    }
    togliScadute();
    setInterval(togliScadute, CONTROLLO_SCADENZE_MS).unref();

    function mappaCambiata({ utente, testo, tolta }) {
        io.emit('catalogo', leggiCatalogo());
        for (const s of stanze.values()) {
            annota(s, `${utente.nome} ${testo}.`);
            // Se è sparita proprio la mappa che si sta guardando, si torna all'immagine di avvio.
            const sfondo = s.stato.sfondo;
            const sparita = tolta && (tolta.file === sfondo || (tolta.cartella && sfondo.startsWith(tolta.cartella + '/')));
            if (!sparita) continue;
            s.stato.sfondo = SFONDO_INIZIALE;
            s.stato.bounds = LIMITI_INIZIALI;
            s.stato.zonaOperativa = normalizzaZona(null);
            io.to(stanza(s)).emit('mappa', { url: s.stato.sfondo, bounds: s.stato.bounds, zona: s.stato.zonaOperativa });
            toccata(s);
        }
    }

    io.on('connection', (socket) => {
        const utente = socket.request.session?.utente;
        if (!utente) {
            socket.emit('serve-accesso');
            socket.disconnect(true);
            return;
        }
        const persona = { socket, utente, comando: false, automatico: false, stanza: null };
        // Prima si sceglie la sessione (o la pagina ci rientra da sola, se si era solo staccata).
        socket.emit('ciao', { utente: { ...utente, sid: socket.id }, sessioni: elenco() });

        const quando = (evento, fn) => socket.on(evento, (...argomenti) => {
            try { fn(...argomenti); } catch (e) { console.error(`[STANZA] Errore su «${evento}»:`, e); }
        });
        // La sessione in cui si sta, solo se si ha il comando.
        const conComando = () => (persona.comando ? persona.stanza : null);
        const agliAltri = (s) => socket.to(stanza(s));

        // --- Sessioni ---
        quando('sessione:entra', (id) => {
            const s = typeof id === 'string' ? stanze.get(id) : undefined;
            if (!s) return socket.emit('sessione:sparita');
            if (persona.stanza === s) return;
            esci(persona, { elenco: false });
            entra(persona, s);
        });

        quando('sessione:crea', (dati, rispondi) => {
            const risposta = typeof rispondi === 'function' ? rispondi : () => {};
            const nome = normalizzaNome(dati?.nome);
            if (!nome) return risposta({ errore: 'Dai un nome alla sessione.' });
            const mie = [...stanze.values()].filter((s) => s.creatore?.id === utente.id).length;
            if (mie >= SESSIONI_A_TESTA) return risposta({ errore: `Hai già ${mie} sessioni aperte: chiudine una prima di aprirne un'altra.` });
            if (stanze.size > SESSIONI_IN_TUTTO) return risposta({ errore: 'Ci sono già troppe sessioni aperte: chiedi di chiuderne qualcuna.' });
            let id;
            do id = nuovoId(); while (stanze.has(id) || !idValido(id));
            const s = nuovaStanza({ id, nome, creatore: { id: utente.id, nome: utente.nome } });
            annota(s, `${utente.nome} ha aperto la sessione.`);
            esci(persona, { elenco: false });
            entra(persona, s);
            risposta({ ok: true, id });
        });

        quando('sessione:chiudi', (id) => {
            const s = typeof id === 'string' ? stanze.get(id) : undefined;
            if (!s || s.id === PRINCIPALE) return;
            if (s.creatore?.id !== utente.id && !eUfficiale(persona)) return;
            chiudi(s, `${utente.nome} ha chiuso la sessione «${s.nome}»: sei nella Principale.`);
        });

        // --- Icone sulla mappa (squadre e marker) ---
        quando('elemento:nuovo', (dati) => {
            const s = conComando();
            const e = s && normalizzaElemento(dati);
            if (!e || trova(s, e.id)) return;
            (e.tipo === 'squadra' ? s.stato.squadre : s.stato.poi)[e.id] = e;
            agliAltri(s).emit('elemento:nuovo', e);
            annota(s, `${utente.nome} ha schierato ${e.nome || (e.tipo === 'squadra' ? 'una squadra' : 'un marker')}.`);
            toccata(s);
        });

        quando('elemento:modifica', ({ id, campi } = {}) => {
            const s = conComando();
            if (!s) return;
            const e = trova(s, id);
            const cambiati = modificaElemento(e, campi);
            if (!cambiati) return;
            agliAltri(s).emit('elemento:modifica', { id, campi: cambiati });
            if ('inOrbita' in cambiati) annota(s, `${utente.nome} ha ${cambiati.inOrbita ? 'mandato in orbita' : 'fatto rientrare'} ${e.nome || 'una squadra'}.`);
            toccata(s);
        });

        quando('elemento:sposta', ({ lista, fine } = {}) => {
            const s = conComando();
            if (!s || !Array.isArray(lista)) return;
            const spostati = [];
            for (const p of lista.slice(0, 500)) {
                const e = trova(s, p?.id);
                if (!e || numero(p.lat) === null || numero(p.lng) === null) continue;
                e.lat = numero(p.lat);
                e.lng = numero(p.lng);
                spostati.push({ id: e.id, lat: e.lat, lng: e.lng });
            }
            if (!spostati.length) return;
            // Durante il trascinamento le posizioni intermedie si possono perdere; quella finale arriva sempre.
            (fine ? agliAltri(s) : agliAltri(s).volatile).emit('elemento:sposta', { lista: spostati, fine: Boolean(fine) });
            if (fine) toccata(s);
        });

        quando('elemento:elimina', (ids) => {
            const s = conComando();
            if (!s || !Array.isArray(ids)) return;
            const tolti = ids.filter((id) => trova(s, id));
            for (const id of tolti) {
                delete s.stato.squadre[id];
                delete s.stato.poi[id];
            }
            if (!tolti.length) return;
            agliAltri(s).emit('elemento:elimina', tolti);
            annota(s, `${utente.nome} ha eliminato ${tolti.length === 1 ? 'un elemento' : `${tolti.length} elementi`}.`);
            toccata(s);
        });

        // --- Disegni, griglia, sfondo ---
        quando('disegni', (g) => {
            const s = conComando();
            if (!s) return;
            s.stato.disegni = normalizzaDisegni(g);
            agliAltri(s).emit('disegni', s.stato.disegni);
            toccata(s);
        });

        quando('griglia', (attiva) => {
            const s = conComando();
            if (!s) return;
            s.stato.grigliaAttiva = attiva === true;
            io.to(stanza(s)).emit('griglia', s.stato.grigliaAttiva);
            toccata(s);
        });

        quando('mappa', ({ url, bounds, zona } = {}) => {
            const s = conComando();
            if (!s || !sfondoValido(url) || !limitiValidi(bounds)) return;
            s.stato.sfondo = url;
            s.stato.bounds = bounds;
            s.stato.zonaOperativa = normalizzaZona(zona);
            io.to(stanza(s)).emit('mappa', { url, bounds, zona: s.stato.zonaOperativa });
            annota(s, `${utente.nome} ha cambiato la mappa.`);
            toccata(s);
        });

        // --- Ping: lo può mandare chiunque, al massimo uno al secondo ---
        let ultimoPing = 0;
        quando('ping', ({ lat, lng } = {}) => {
            const s = persona.stanza;
            if (!s || numero(lat) === null || numero(lng) === null || Date.now() - ultimoPing < 800) return;
            ultimoPing = Date.now();
            agliAltri(s).emit('ping', { lat, lng, id: utente.id, nome: utente.nome, ruolo: utente.ruolo });
        });

        // --- Missione intera ---
        quando('missione:carica', (dati) => {
            const s = conComando();
            if (!s) return socket.emit('avviso', { testo: 'Serve il comando per caricare una missione.', tipo: 'errore' });
            const nuovo = normalizzaStato(dati);
            if (!nuovo) return socket.emit('avviso', { testo: 'Questo file non è una missione della mappa tattica.', tipo: 'errore' });
            s.stato = nuovo;
            io.to(stanza(s)).emit('stato', s.stato);
            annota(s, `${utente.nome} ha caricato una missione da file.`);
            toccata(s);
        });

        quando('missione:azzera', () => {
            const s = persona.stanza;
            if (!s || !(eCapo(persona, s) || (persona.comando && !capiDentro(s)))) return;
            s.stato.squadre = {};
            s.stato.poi = {};
            s.stato.disegni = null;
            io.to(stanza(s)).emit('stato', s.stato);
            annota(s, `${utente.nome} ha azzerato la mappa.`);
            toccata(s);
        });

        // --- Comando ---
        quando('comando:chiedi', () => {
            const s = persona.stanza;
            if (!s || persona.comando) return;
            if (!capiDentro(s)) {
                daiComando(persona, s, true, 'Nessuno guida la sessione: hai il comando.');
                annota(s, `${utente.nome} ha preso il comando (nessun capo nella sessione).`);
            } else {
                s.richieste.set(socket.id, Date.now());
                io.to(capiDi(s)).emit('richiesta', { sid: socket.id, nome: utente.nome });
                annota(s, `${utente.nome} chiede il comando.`);
            }
            inviaPresenze(s);
        });

        // Le risposte dei capi: valgono solo per chi è nella stessa sessione.
        const altroNellaSessione = (sid) => {
            const s = persona.stanza;
            return s && eCapo(persona, s) ? { s, altro: s.persone.get(sid) } : {};
        };

        quando('comando:approva', (sid) => {
            const { s, altro } = altroNellaSessione(sid);
            if (!altro || !s.richieste.has(sid)) return;
            daiComando(altro, s, false, `${utente.nome} ti ha dato il comando.`);
            annota(s, `${utente.nome} ha dato il comando a ${altro.utente.nome}.`);
            inviaPresenze(s);
        });

        quando('comando:rifiuta', (sid) => {
            const { s, altro } = altroNellaSessione(sid);
            if (!altro || !s.richieste.delete(sid)) return;
            altro.socket.emit('avviso', { testo: `${utente.nome} non ti ha dato il comando, per ora.` });
            annota(s, `${utente.nome} non ha dato il comando a ${altro.utente.nome}.`);
            inviaPresenze(s);
        });

        quando('comando:revoca', (sid) => {
            const { s, altro } = altroNellaSessione(sid);
            if (!altro || !altro.comando || eCapo(altro, s)) return;
            togliComando(altro, s, `${utente.nome} ti ha tolto il comando.`);
            annota(s, `${utente.nome} ha tolto il comando a ${altro.utente.nome}.`);
            inviaPresenze(s);
        });

        quando('comando:lascia', () => {
            const s = persona.stanza;
            if (!s || eCapo(persona, s) || !persona.comando) return;
            togliComando(persona, s, 'Hai lasciato il comando.');
            annota(s, `${utente.nome} ha lasciato il comando.`);
            inviaPresenze(s);
        });

        quando('disconnect', () => esci(persona));
    });

    return { mappaCambiata };
}

module.exports = { avviaStanze };
