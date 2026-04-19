require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

const sessionMiddleware = session({ secret: process.env.SESSION_SECRET || 'tattico-segreto-123', resave: false, saveUninitialized: false });
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
io.engine.use(sessionMiddleware);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL,
    scope: ['identify', 'guilds', 'guilds.members.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const response = await axios.get(`https://discord.com/api/users/@me/guilds/${process.env.GUILD_ID}/member`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const roles = response.data.roles;
        let assignedRole = 'operatore';
        if (profile.id === process.env.CREATOR_USER_ID || roles.includes(process.env.ADMIN_ROLE_ID)) assignedRole = 'admin';
        else if (roles.includes(process.env.RESPONSABILE_ROLE_ID)) assignedRole = 'responsabile';
        else if (roles.includes(process.env.PLSE_ROLE_ID)) assignedRole = 'p-lse';
        return done(null, { id: profile.id, nome: response.data.nick || profile.username, ruolo: assignedRole });
    } catch (e) {
        console.error("ERRORE LOGIN DISCORD:", e.response ? e.response.data : e.message);
        return done(null, false);
    }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/api/me', (req, res) => req.isAuthenticated() ? res.json(req.user) : res.status(401).send());
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// --- CONFIGURAZIONE UPLOAD (Usa una cartella temporanea) ---
const tempUploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(tempUploadDir)) fs.mkdirSync(tempUploadDir);
const upload = multer({ dest: 'uploads/' });

// ============================================================================
// UPLOAD MAPPE (RICEZIONE E SALVATAGGIO FISICO)
// ============================================================================

// Configurazione di Multer per decidere DOVE salvare i file e COME chiamarli
// Configurazione di Multer per decidere DOVE salvare i file e COME chiamarli
const storageMappe = multer.diskStorage({
    destination: (req, file, cb) => {
        const { gioco, sistema, pianeta, tipo, cartellaDestinazione } = req.body;

        let basePath = path.join(__dirname, 'public', 'Mappe', gioco, sistema, pianeta);
        let finalPath;

        if (tipo === 'master') {
            // È una NUOVA Mappa. Crea una cartella col nome del file (es. Lorville)
            const locationName = file.originalname.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_');
            finalPath = path.join(basePath, locationName, 'mappa_master');
        } else if (tipo === 'submap') {
            // È una SOTTOMAPPA. Mettila "sfusa" dentro la cartella della mappa selezionata
            finalPath = path.join(basePath, cartellaDestinazione);
        }

        // Se le cartelle non esistono, le crea al volo
        if (!fs.existsSync(finalPath)) {
            fs.mkdirSync(finalPath, { recursive: true });
        }

        cb(null, finalPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname.replace(/\s+/g, '_'));
    }
});

const uploadMappe = multer({ storage: storageMappe });

// 1. Creiamo il "Buttafuori" (Middleware di sicurezza)
const controllaPermessiUfficiali = (req, res, next) => {
    // Se non sei loggato o non sei admin/responsabile, ti blocco subito!
    if (!req.isAuthenticated() || !['admin', 'responsabile'].includes(req.user.ruolo)) {
        console.warn(`[SICUREZZA] Upload negato. Utente non autorizzato: ${req.user ? req.user.nome : 'Sconosciuto'}`);
        return res.status(403).json({ error: "Accesso negato: Solo gli Ufficiali possono caricare mappe." });
    }
    // Se hai i permessi, ti lascio passare al salvataggio del file
    next();
};

// 2. Rotta API aggiornata: [Rotta] -> [Buttafuori] -> [Salvataggio Multer] -> [Risposta]
app.post('/api/upload-mappa', controllaPermessiUfficiali, uploadMappe.single('mappa'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Nessun file ricevuto." });
        }
        console.log(`[MAPPE] Nuovo file caricato: ${req.file.filename} in ${req.file.destination}`);

        // Risponde al browser che è andato tutto bene
        res.status(200).json({ success: true, message: "Mappa caricata!" });
    } catch (error) {
        console.error("[MAPPE] Errore upload:", error);
        res.status(500).json({ error: "Errore interno del server" });
    }
});


// --- NUOVA GESTIONE LETTURA MAPPE (CON AUTO-CREAZIONE) ---
app.get('/api/lista-mappe', (req, res) => {
    const { gioco, sistema, pianeta } = req.query;

    // Se mancano i dati, restituisce un oggetto vuoto
    if (!gioco || !sistema || !pianeta) return res.json({});

    // Percorso: Mappe / Star_Citizen / Stanton / Hurston
    const basePath = path.join(__dirname, 'public', 'Mappe', gioco, sistema, pianeta);

    let mappeDisponibili = {};

    // MODIFICA: Se la cartella non esiste, la creiamo invece di uscire
    if (!fs.existsSync(basePath)) {
        console.log(`[API] Cartella pianeta non trovata, la creo ora: ${basePath}`);
        try {
            // Crea la cartella (recursive: true crea anche le cartelle "padri" se mancano)
            fs.mkdirSync(basePath, { recursive: true });
        } catch (err) {
            console.error("Errore nella creazione automatica cartella:", err);
            return res.json({}); // Se fallisce la creazione, usciamo in sicurezza
        }
    }

    try {
        // 1. Legge tutte le cartelle "NomeCartellaMappa"
        const locationDirs = fs.readdirSync(basePath).filter(d => {
            const fullPath = path.join(basePath, d);
            return fs.statSync(fullPath).isDirectory();
        });

        locationDirs.forEach(loc => {
            const locPath = path.join(basePath, loc);
            mappeDisponibili[loc] = { master: [], submaps: [] };

            // 2. Cerca la cartella "mappa_master"
            const masterPath = path.join(locPath, 'mappa_master');
            if (fs.existsSync(masterPath)) {
                mappeDisponibili[loc].master = fs.readdirSync(masterPath).filter(f =>
                    f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png')
                );
            }

            // 3. Cerca le submappe sparse
            mappeDisponibili[loc].submaps = fs.readdirSync(locPath).filter(f => {
                const fPath = path.join(locPath, f);
                return fs.statSync(fPath).isFile() && (f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png'));
            });
        });

        // Invia i dati strutturati al client
        res.json(mappeDisponibili);

    } catch (err) {
        console.error("Errore nella lettura della struttura mappe:", err);
        res.status(500).json({ error: "Errore interno nella lettura mappe" });
    }
});

// --- NUOVA GESTIONE UPLOAD MAPPE (Crea cartelle automaticamente) ---
app.post('/upload-mappa', upload.single('nuovaMappa'), (req, res) => {
    if (!req.isAuthenticated() || !['admin', 'responsabile'].includes(req.user.ruolo)) return res.sendStatus(403);

    const { tipo, gioco, sistema, mappaPrincipale } = req.body;
    const tempPath = req.file.path;
    const originalName = req.file.originalname.replace(/\s+/g, '-'); // Togli spazi dal nome

    let targetDir = path.join(__dirname, 'public', 'Mappe');

    // Naviga nella struttura base
    if (gioco === 'sc') targetDir = path.join(targetDir, 'Star Citizen', sistema || 'Stanton');
    else if (gioco === 'arma') targetDir = path.join(targetDir, 'Arma');
    else targetDir = path.join(targetDir, 'General');

    // Crea la gerarchia della mappa
    if (tipo === 'master') {
        let nomeCartella = originalName.replace(/\.[^/.]+$/, ""); // Es: "Hathor-Aberdeen"
        targetDir = path.join(targetDir, nomeCartella, 'mappa_master');
    } else if (tipo === 'submap') {
        targetDir = path.join(targetDir, mappaPrincipale); // Va direttamente nella cartella creata dalla master
    }

    // Se le cartelle non esistono, le crea tutte!
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Sposta il file dalla cartella temporanea alla destinazione finale
    const finalPath = path.join(targetDir, originalName);
    fs.renameSync(tempPath, finalPath);

    logEvento(`[SISTEMA] L'Ufficiale ${req.user.nome} ha caricato una mappa: ${originalName}`);
    res.sendStatus(200);
});

// --- ELIMINAZIONE MAPPE E CARTELLE ---
// Nota: Abbiamo aggiunto "controllaPermessiUfficiali" direttamente qui
app.post('/api/elimina-mappa', controllaPermessiUfficiali, (req, res) => {

    // 1. IL CONTROLLO PERMESSI NON SERVE PIÙ QUI DENTRO!
    // Se il codice arriva qui, significa che il middleware "controllaPermessiUfficiali"
    // ha già verificato che l'utente è un Admin o Responsabile.

    const { percorso } = req.body;
    if (!percorso) return res.sendStatus(400);

    // 2. Sicurezza: previene attacchi hacker di navigazione cartelle (Directory Traversal)
    if (percorso.includes('..')) return res.sendStatus(403);

    // 3. Costruisce il percorso fisico esatto sul tuo PC
    const absolutePath = path.join(__dirname, 'public', percorso);

    try {
        if (percorso.includes('/mappa_master/')) {
            // ELIMINA L'INTERA CARTELLA DELLA MAPPA
            const locationFolder = path.dirname(path.dirname(absolutePath));
            const locationName = path.basename(locationFolder);

            if (fs.existsSync(locationFolder)) {
                fs.rmSync(locationFolder, { recursive: true, force: true });
            }
            if (typeof logEvento === 'function') logEvento(`[SISTEMA] L'Ufficiale ${req.user.nome} ha eliminato l'intera mappa ${locationName}`);

        } else {
            // ELIMINA SOLO LA SOTTOMAPPA
            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
            }
            const subName = path.basename(absolutePath);
            if (typeof logEvento === 'function') logEvento(`[SISTEMA] L'Ufficiale ${req.user.nome} ha eliminato la sottomappa ${subName}`);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error("Errore eliminazione mappa:", err);
        res.sendStatus(500);
    }
});

// Carichiamo la memoria del motore di ricerca all'avvio del server
let catalogoMappe = [];
try {
    if (fs.existsSync('catalogo_mappe.json')) {
        catalogoMappe = JSON.parse(fs.readFileSync('catalogo_mappe.json'));
        console.log(`[SISTEMA] Motore di ricerca pronto: caricate ${catalogoMappe.length} mappe in memoria.`);
    }
} catch (err) {
    console.log("[AVVISO] Nessun catalogo mappe esistente, il motore partirà da zero.");
}

// --- LOGICA DI STATO E PERMESSI ---
// Aggiungiamo zonaOperativa per ricordare i menu a tendina
// --- VARIABILI DI STATO E CONTATORI ---
let utentiTotali = 0; // Conta chiunque sia connesso (Admin, Resp, Operatori)
let ufficialiOnline = 0; // Conta solo Admin e Responsabili
let operatoriAutorizzati = {};
let richiestePendenti = {};

// Funzione per generare uno stato vergine (Home)
function creaStatoPulito() {
    return {
        sfondo: 'mappe/avvio.png',
        squadre: {},
        poi: {},
        disegni: null,
        grigliaAttiva: false,
        zonaOperativa: {
            gioco: '',
            sistema: '',
            pianeta: '',
            mappa: '',
            submappa: ''
        },
        bounty: { materiali: [], pagamenti: [], spese: [], config: {} }
    };
}

// Inizializzazione della memoria del server
let statoMappa = creaStatoPulito();

function logEvento(msg) { io.emit('nuovo_log', `[${new Date().toLocaleTimeString()}] ${msg}`); }

io.on('connection', (socket) => {
    const user = socket.request.session?.passport?.user;

    if (!user) return;


    // 2. Quando l'operatore carica un'immagine e "insegna" una mappa al sistema
    socket.on('nuova_mappa_appresa', (nuovoTarget) => {
        // Solo gli Ufficiali possono modificare il database
        if (!haPermessi()) return;

        // Verifichiamo che non sia un doppione
        const esisteGia = catalogoMappe.some(m =>
            m.idMappa.toLowerCase() === nuovoTarget.idMappa.toLowerCase() &&
            m.pianeta === nuovoTarget.pianeta
        );

        if (!esisteGia) {
            catalogoMappe.push(nuovoTarget);
            // Scriviamo fisicamente il file sul disco del server per non perderlo mai più
            fs.writeFileSync('catalogo_mappe.json', JSON.stringify(catalogoMappe, null, 2));

            // Diciamo a tutti i computer collegati di aggiornare la barra di ricerca
            io.emit('sync_catalogo_mappe', catalogoMappe);
            console.log(`[DATABASE] Nuova mappa indicizzata permanentemente: ${nuovoTarget.nome}`);
        }
    });

    // 3. Quando un Admin elimina una mappa
    socket.on('elimina_mappa_dal_catalogo', (idMappaDaEliminare) => {
        if (!haPermessi()) return;

        // Filtriamo il catalogo tenendo SOLO le mappe che NON hanno quell'ID
        const lunghezzaIniziale = catalogoMappe.length;
        catalogoMappe = catalogoMappe.filter(m => m.idMappa !== idMappaDaEliminare);

        // Se abbiamo effettivamente tolto qualcosa, aggiorniamo il file e i client
        if (catalogoMappe.length < lunghezzaIniziale) {
            fs.writeFileSync('catalogo_mappe.json', JSON.stringify(catalogoMappe, null, 2));
            io.emit('sync_catalogo_mappe', catalogoMappe);
            console.log(`[DATABASE] Target rimosso permanentemente dal radar: ${idMappaDaEliminare}`);
        }
    });

    // --- AGGIUNTA AUTOCLEAN: Aumentiamo il contatore degli utenti connessi ---
    utentiTotali++;

    const isUff = ['admin', 'responsabile'].includes(user.ruolo);

    // 1. Appena un operatore entra, gli diamo il catalogo completo
    socket.emit('sync_catalogo_mappe', catalogoMappe);

    // --- NUOVA LOGICA DI CO-GESTIONE ---
    if (isUff) {
        ufficialiOnline++;

        // 1. Diamo il comando DIRETTAMENTE a chi si è appena connesso
        socket.emit('comando_concesso');

        // 2. Avvisiamo solo gli OPERATORI che c'è un ufficiale (così loro si bloccano)
        // Usiamo broadcast per non mandare questo messaggio a noi stessi
        socket.broadcast.emit('ufficiale_online');

        // 3. Se c'erano operatori autorizzati manualmente, ora li resettiamo
        if (Object.keys(operatoriAutorizzati).length > 0) {
            operatoriAutorizzati = {};
            // Avvisiamo solo gli operatori della revoca
            socket.broadcast.emit('comando_revocato_per_operatori');
            io.emit('aggiorna_autorizzati', operatoriAutorizzati);
        }

        logEvento(`[SISTEMA] Ufficiale ${user.nome} è operativo. (Totale Ufficiali: ${ufficialiOnline})`);
    }

    logEvento(`[CONNESSIONE] ${user.nome} (${user.ruolo}) collegato.`);
    socket.emit('stato_iniziale', statoMappa);

    const haPermessi = () => {
        return isUff || operatoriAutorizzati[socket.id];
    };

    // --- BOUNTY E SINCRONIZZAZIONI ---
    socket.on('sync_bounty', (dati) => {
        // Verifichiamo se chi invia è nel registro ufficiale
        if (!haPermessi()) {
            console.warn(`[SICUREZZA] L'utente ${user ? user.nome : 'Sconosciuto'} ha provato a salvare il Bounty senza permessi validi. Dati respinti.`);
            return;
        }
        // SALVATAGGIO UFFICIALE
        statoMappa.bounty = dati;
        // Rimbalza agli altri
        socket.broadcast.emit('sync_bounty', dati);
    });

    socket.on('richiedi_comando_iniziale', () => {
        if (isUff) {
            socket.emit('comando_concesso');
        } else if (ufficialiOnline === 0) {
            operatoriAutorizzati[socket.id] = user.nome;
            socket.emit('comando_concesso');
            io.emit('aggiorna_autorizzati', operatoriAutorizzati);
            logEvento(`[SISTEMA] ${user.nome} assume il comando tattico (Nessun Ufficiale Online).`);
        } else {
            socket.emit('comando_revocato');
        }
    });

    socket.on('richiedi_comando', () => {
        if (isUff) return;
        if (ufficialiOnline === 0) {
            operatoriAutorizzati[socket.id] = user.nome;
            socket.emit('comando_concesso');
            io.emit('aggiorna_autorizzati', operatoriAutorizzati);
            logEvento(`[SISTEMA] ${user.nome} ha preso il comando.`);
        } else {
            richiestePendenti[socket.id] = user.nome;
            io.emit('aggiorna_richieste', richiestePendenti);
            logEvento(`[RICHIESTA] L'operatore ${user.nome} chiede autorizzazione.`);
        }
    });

    socket.on('approva_richiesta', (id) => {
        if (!isUff) return;
        if (richiestePendenti[id]) {
            operatoriAutorizzati[id] = richiestePendenti[id];
            delete richiestePendenti[id];
            io.to(id).emit('comando_concesso');
            io.emit('aggiorna_autorizzati', operatoriAutorizzati);
            io.emit('aggiorna_richieste', richiestePendenti);
            logEvento(`[SISTEMA] Autorizzazione concessa a ${operatoriAutorizzati[id]} da ${user.nome}.`);
        }
    });

    socket.on('revoca_comando', (id) => {
        if (!isUff) return;
        const nome = operatoriAutorizzati[id];
        delete operatoriAutorizzati[id];
        io.to(id).emit('comando_revocato');
        io.emit('aggiorna_autorizzati', operatoriAutorizzati);
        logEvento(`[SISTEMA] Autorizzazione revocata a ${nome}.`);
    });

    socket.on('rilascia_comando', () => {
        delete operatoriAutorizzati[socket.id];
        socket.emit('comando_revocato');
        io.emit('aggiorna_autorizzati', operatoriAutorizzati);
        logEvento(`[SISTEMA] ${user.nome} ha rilasciato il comando.`);
    });

    socket.on('toggle_griglia_globale', (stato) => {
        if (!haPermessi()) return;
        statoMappa.grigliaAttiva = stato;
        io.emit('cambio_griglia_globale', stato);
    });

    socket.on('salva_disegni', (disegni) => {
        if (!haPermessi()) return;
        statoMappa.disegni = disegni;
        socket.broadcast.emit('aggiorna_disegni', disegni);
    });

    socket.on('pulisci_lavagna', () => {
        if (!haPermessi()) return;
        statoMappa.disegni = null;
        io.emit('aggiorna_disegni', null);
        logEvento(`[MAPPA] Disegni cancellati da ${user.nome}.`);
    });

    socket.on('nuke_mappa', () => {
        const canNuke = isUff || (operatoriAutorizzati[socket.id] && ufficialiOnline === 0);
        if (!canNuke) return;

        statoMappa.squadre = {}; statoMappa.poi = {}; statoMappa.disegni = null;
        io.emit('stato_iniziale', statoMappa);
        logEvento(`[SISTEMA] Mappa resettata completamente da ${user.nome}.`);
    });

    socket.on('nuovo_elemento', (dati) => {
        if (!haPermessi()) return;
        if (dati.tipo === 'squadra') statoMappa.squadre[dati.id] = dati; else statoMappa.poi[dati.id] = dati;
        socket.broadcast.emit('elemento_creato', dati);
        logEvento(`[SCHIERAMENTO] ${user.nome} ha schierato: ${dati.nome || dati.tipo}`);
    });

    socket.on('aggiorna_posizione', (dati) => {
        if (!haPermessi()) return;
        const target = dati.tipo === 'squadra' ? statoMappa.squadre[dati.id] : statoMappa.poi[dati.id];
        if (target) { target.lat = dati.lat; target.lng = dati.lng; }
        socket.broadcast.emit('posizione_aggiornata', dati);
    });

    socket.on('toggle_cerchio_tattico', (dati) => {
        if (!haPermessi()) return;

        const target = dati.tipo === 'squadra' ? statoMappa.squadre[dati.id] : statoMappa.poi[dati.id];

        if (target) {
            // Aggiorniamo lo stato (acceso/spento)
            target.cerchioAttivo = dati.stato;

            // Salviamo il raggio nella memoria del server!
            // Se l'operatore ha inserito un raggio lo salviamo, altrimenti teniamo quello vecchio, o 1000 di default
            target.raggio = dati.raggio || target.raggio || 1000;

            // Rimbalziamo il segnale agli altri operatori con tutte le informazioni complete
            socket.broadcast.emit('aggiorna_cerchio', {
                id: dati.id,
                tipo: dati.tipo,
                stato: target.cerchioAttivo,
                raggio: target.raggio
            });
        }
    });

    socket.on('aggiorna_roster', (dati) => {
        if (!haPermessi()) return;
        if (statoMappa.squadre[dati.id]) {
            statoMappa.squadre[dati.id].roster = dati.roster;
            socket.broadcast.emit('roster_aggiornato', dati);
        }
    });

    socket.on('elimina_elemento', (dati) => {
        if (!haPermessi()) return;
        if (dati.tipo === 'squadra') delete statoMappa.squadre[dati.id]; else delete statoMappa.poi[dati.id];
        io.emit('elemento_eliminato', dati);
        logEvento(`[RIMOZIONE] Elemento rimosso da ${user.nome}.`);
    });

    socket.on('invia_ping', (dati) => {
        io.emit('ricevi_ping', { ...dati, utente: user.nome, ruolo: user.ruolo });
    });

socket.on('richiedi_cambio_mappa', (pacchetto) => {
        if (!haPermessi()) return;
        
        // Salviamo nella memoria del server sia il link (url) che le dimensioni (bounds)
        statoMappa.sfondo = pacchetto.url;
        statoMappa.bounds = pacchetto.bounds; 
        
        // Giriamo l'intero pacchetto agli altri tablet
        io.emit('cambio_mappa', pacchetto); 
        logEvento(`[MAPPA] ${user.nome} ha cambiato la mappa in visualizzazione.`);
    });

    socket.on('carica_snapshot', (snap) => {
        console.log(`\n[DEBUG SERVER] L'utente ${user.nome} sta tentando di caricare una missione...`);

        // Usiamo haPermessi()! Così il server accetta il file dagli Ufficiali
        // E ANCHE dall'operatore che in quel momento ha i permessi di comando.
        if (!haPermessi()) {
            console.log(`[DEBUG SERVER] NEGATO: L'utente ${user.nome} non ha i permessi operativi in questo momento.`);
            socket.emit('mostra_notifica', "Devi avere il Comando Tattico per caricare una missione.");
            return;
        }

        console.log(`[DEBUG SERVER] File accettato! Sostituisco la mappa e invio ai client...`);
        statoMappa = snap;
        io.emit('stato_iniziale', snap);

        if (typeof logEvento === 'function') {
            logEvento(`[SISTEMA] Missione ripristinata da ${user.nome}.`);
        }
    });

    // --- SINCRONIZZAZIONE NOME ED ETICHETTA COLORATA ---
    socket.on('rinomina_entita', (data) => {
        if (!haPermessi()) return; // Solo chi ha il comando può cambiare i nomi

        // 1. Salva il nuovo nome nella memoria del server per i futuri connessi
        if (statoMappa.squadre && statoMappa.squadre[data.id]) {
            statoMappa.squadre[data.id].nome = data.nome;
        } else if (statoMappa.poi && statoMappa.poi[data.id]) {
            statoMappa.poi[data.id].nome = data.nome;
        }

        // 2. Manda l'aggiornamento a tutti gli altri tablet
        socket.broadcast.emit('rinomina_entita', data);

        if (typeof logEvento === 'function') {
            logEvento(`[MAPPA] ${user.nome} ha rinominato un'icona in: ${data.nome}`);
        }
    });

    socket.on('cambia_colore_entita', (data) => {
        if (!haPermessi()) return; // Solo chi ha il comando può cambiare i colori

        // 1. Salva il colore nella memoria del server
        if (statoMappa.squadre && statoMappa.squadre[data.id]) {
            statoMappa.squadre[data.id].colore = data.colore;
        } else if (statoMappa.poi && statoMappa.poi[data.id]) {
            statoMappa.poi[data.id].colore = data.colore;
        }

        // 2. Manda l'aggiornamento a tutti gli altri tablet
        socket.broadcast.emit('cambia_colore_entita', data);
    });

    socket.on('aggiorna_stato_icona', (data) => {
        if (statoMappa.squadre && statoMappa.squadre[data.id]) {
            Object.assign(statoMappa.squadre[data.id], data);
        }
        else if (statoMappa.poi && statoMappa.poi[data.id]) {
            Object.assign(statoMappa.poi[data.id], data);
        }
        socket.broadcast.emit('aggiorna_stato_icona', data);
        if (typeof logEvento === 'function' && typeof user !== 'undefined') {
            logEvento(`[SCHIERAMENTO] ${user.nome} ha aggiornato l'icona: ${data.nome || data.id}`);
        }
    });

    socket.on('richiedi_download_missione', () => {
        socket.emit('ricevi_download_missione', statoMappa);
    });

    socket.on('sync_stato_orbita', (data) => {
        socket.broadcast.emit('sync_stato_orbita', data);
    });

    socket.on('sync_zona_operativa', (data) => {
        if (data.id === 'filtro-gioco') statoMappa.zonaOperativa.gioco = data.value;
        if (data.id === 'filtro-sistema') statoMappa.zonaOperativa.sistema = data.value;
        if (data.id === 'filtro-pianeta') statoMappa.zonaOperativa.pianeta = data.value;
        if (data.id === 'tendinaMappe') statoMappa.zonaOperativa.mappa = data.value;
        if (data.id === 'tendinaSubMappe') statoMappa.zonaOperativa.submappa = data.value;
        socket.broadcast.emit('sync_zona_operativa', data);
    });

    // --- LA NUOVA GESTIONE DISCONNESIONE (AUTOCLEAN) ---
    socket.on('disconnect', () => {
        logEvento(`[DISCONNESSIONE] ${user.nome} disconnesso.`);

        // 1. Scaliamo il contatore di 1
        utentiTotali--;

        if (isUff) {
            ufficialiOnline--;
            if (ufficialiOnline <= 0) {
                ufficialiOnline = 0;
                io.emit('comandi_liberati');
                logEvento(`[SISTEMA] Ultimo Ufficiale disconnesso. Comandi sbloccati.`);
            }
        }

        delete operatoriAutorizzati[socket.id];
        delete richiestePendenti[socket.id];
        io.emit('aggiorna_autorizzati', operatoriAutorizzati);
        io.emit('aggiorna_richieste', richiestePendenti);

        // 2. IL RESET DELLA STANZA
        if (utentiTotali <= 0) {
            utentiTotali = 0; // Previene errori
            if (typeof creaStatoPulito === 'function') {
                statoMappa = creaStatoPulito();
            }
            console.log("🧹 [SISTEMA] Server vuoto! Mappa, icone, menu e Bounty riportati allo stato di Home.");
            if (typeof logEvento === 'function') logEvento("[SISTEMA] Memoria server ripristinata per inattività.");
        }
    });

});

server.listen(PORT, () => console.log(`C2 Server online sulla porta ${PORT}`));