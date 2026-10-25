// Il tool «Bounty e salvage» (pagina /bounty): calcolatori condivisi in tempo reale, separati dalla mappa.
// Chiunque sia entrato (anche operatori e P-LSE) apre le sue sessioni; chi è dentro una sessione la compila insieme
// agli altri. Le sessioni sono salvate sul disco e si cancellano da sole dopo 5 giorni che nessuno le usa; prima le
// può chiudere chi le ha create (o un ufficiale).
const { normalizzaBounty, normalizzaNome, normalizzaCreatore } = require('./normalizza');
const { UFFICIALI } = require('./accesso');
const { creaArchivio, nuovoId, idValido, istante, scaduta, DURATA_MS, CONTROLLO_SCADENZE_MS } = require('./archivio');

const SESSIONI_A_TESTA = 5;
const SESSIONI_IN_TUTTO = 50;

function avviaBounty(io) {
    const spazio = io.of('/bounty');
    const archivio = creaArchivio('bounty');
    const sessioni = new Map(); // id → { id, nome, creatore, creata, ultimoUso, bounty, persone: Map(socket.id → utente) }

    function nuovaSessione({ id, nome, creatore, bounty = normalizzaBounty(null), creata = Date.now(), ultimoUso = Date.now() }) {
        const s = { id, nome, creatore, bounty, creata, ultimoUso, persone: new Map() };
        sessioni.set(id, s);
        return s;
    }

    for (const d of archivio.leggiTutte()) {
        nuovaSessione({
            id: d.id,
            nome: normalizzaNome(d.nome) || 'Bounty',
            creatore: normalizzaCreatore(d.creatore),
            bounty: normalizzaBounty(d.bounty),
            creata: istante(d.creata),
            ultimoUso: istante(d.ultimoUso),
        });
    }

    const stanza = (s) => `b:${s.id}`;

    function toccata(s) {
        s.ultimoUso = Date.now();
        archivio.salva(s.id, () => ({ id: s.id, nome: s.nome, creatore: s.creatore, creata: s.creata, ultimoUso: s.ultimoUso, bounty: s.bounty }));
    }

    const nomiDentro = (s) => [...new Map([...s.persone.values()].map((u) => [u.id, u.nome])).values()];

    function infoSessione(s) {
        const nomi = nomiDentro(s);
        return {
            id: s.id,
            nome: s.nome,
            principale: false,
            creatore: s.creatore?.nome ?? null,
            creatoreId: s.creatore?.id ?? null,
            dentro: nomi.length,
            nomi: nomi.slice(0, 8),
            scade: s.ultimoUso + DURATA_MS,
        };
    }

    const elenco = () => [...sessioni.values()].sort((a, b) => b.ultimoUso - a.ultimoUso).map(infoSessione);
    const inviaElenco = () => spazio.emit('sessioni', elenco());
    const inviaPresenze = (s) => spazio.to(stanza(s)).emit('presenze', nomiDentro(s));

    function togliScadute() {
        let tolte = 0;
        for (const s of sessioni.values()) {
            if (!scaduta(s)) continue;
            sessioni.delete(s.id);
            archivio.cancella(s.id);
            tolte++;
            console.log(`[BOUNTY] Sessione «${s.nome}» cancellata: nessuno la usava da 5 giorni.`);
        }
        if (tolte) inviaElenco();
    }
    togliScadute();
    setInterval(togliScadute, CONTROLLO_SCADENZE_MS).unref();

    spazio.on('connection', (socket) => {
        const utente = socket.request.session?.utente;
        if (!utente) {
            socket.emit('serve-accesso');
            socket.disconnect(true);
            return;
        }
        let dentro = null;
        // La sessione in cui si è, se nel frattempo nessuno l'ha chiusa.
        const attuale = () => (dentro && sessioni.get(dentro.id) === dentro ? dentro : null);
        socket.emit('ciao', { utente, sessioni: elenco() });

        const quando = (evento, fn) => socket.on(evento, (...argomenti) => {
            try { fn(...argomenti); } catch (e) { console.error(`[BOUNTY] Errore su «${evento}»:`, e); }
        });

        function esci() {
            const s = attuale();
            dentro = null;
            if (!s) return;
            s.persone.delete(socket.id);
            socket.leave(stanza(s));
            inviaPresenze(s);
            toccata(s);
        }

        function entra(s) {
            esci();
            dentro = s;
            s.persone.set(socket.id, utente);
            socket.join(stanza(s));
            socket.emit('benvenuto', { sessione: infoSessione(s), bounty: s.bounty });
            inviaPresenze(s);
            toccata(s);
            inviaElenco();
        }

        quando('sessione:entra', (id) => {
            const s = typeof id === 'string' ? sessioni.get(id) : undefined;
            if (!s) return socket.emit('sessione:sparita');
            if (s !== attuale()) entra(s);
        });

        quando('sessione:esci', () => {
            esci();
            inviaElenco();
        });

        quando('sessione:crea', (dati, rispondi) => {
            const risposta = typeof rispondi === 'function' ? rispondi : () => {};
            const nome = normalizzaNome(dati?.nome);
            if (!nome) return risposta({ errore: 'Dai un nome alla sessione.' });
            const mie = [...sessioni.values()].filter((s) => s.creatore?.id === utente.id).length;
            if (mie >= SESSIONI_A_TESTA) return risposta({ errore: `Hai già ${mie} sessioni aperte: chiudine una prima di aprirne un'altra.` });
            if (sessioni.size >= SESSIONI_IN_TUTTO) return risposta({ errore: 'Ci sono già troppe sessioni aperte: chiedi di chiuderne qualcuna.' });
            let id;
            do id = nuovoId(); while (sessioni.has(id) || !idValido(id));
            entra(nuovaSessione({ id, nome, creatore: { id: utente.id, nome: utente.nome } }));
            risposta({ ok: true, id });
        });

        quando('sessione:chiudi', (id) => {
            const s = typeof id === 'string' ? sessioni.get(id) : undefined;
            if (!s || (s.creatore?.id !== utente.id && !UFFICIALI.includes(utente.ruolo))) return;
            // Chi è dentro torna all'elenco.
            spazio.to(stanza(s)).except(socket.id).emit('sessione:chiusa', { nome: s.nome, da: utente.nome });
            spazio.in(stanza(s)).socketsLeave(stanza(s));
            sessioni.delete(s.id);
            archivio.cancella(s.id);
            if (dentro === s) dentro = null;
            inviaElenco();
        });

        quando('bounty', (dati) => {
            const s = attuale();
            if (!s) return;
            s.bounty = normalizzaBounty(dati);
            socket.to(stanza(s)).emit('bounty', s.bounty);
            toccata(s);
        });

        quando('disconnect', () => {
            esci();
            inviaElenco();
        });
    });
}

module.exports = { avviaBounty };
