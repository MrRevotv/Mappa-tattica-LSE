// Chi entra nella mappa e con che ruolo: login con Discord oppure biglietto firmato del sito LSE.
// I ruoli si leggono dal server Discord una volta sola, all'ingresso.
const crypto = require('crypto');
const session = require('express-session');

const UFFICIALI = ['admin', 'responsabile'];

// --- ACCESSO DAL SITO LSE (Area membri → Strumenti) ---
// Il sito mostra la mappa dentro una sua pagina e le passa un biglietto firmato con LSE_SEGRETO: chi è entrato nel
// sito entra anche qui, senza rifare il login con Discord (che dentro un'altra pagina Discord non permette).
const LSE_SEGRETO = process.env.LSE_SEGRETO || '';
// Indirizzi del sito LSE che possono mostrare la mappa (separati da virgola), es. https://lse.sc
const LSE_SITI = (process.env.LSE_SITO_URL || '').split(',').map((s) => s.trim()).filter(Boolean).map((u) => new URL(u).origin);
const dentroIlSitoLse = Boolean(LSE_SEGRETO && LSE_SITI.length);

const discord = {
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    callback: process.env.CALLBACK_URL || '',
    guild: process.env.GUILD_ID || '',
};
const discordAttivo = Boolean(discord.clientId && discord.clientSecret && discord.callback);
const API_DISCORD = 'https://discord.com/api/v10';

function creaSessione() {
    let segreto = process.env.SESSION_SECRET;
    if (!segreto) {
        segreto = crypto.randomBytes(32).toString('hex');
        console.warn('[ACCESSO] SESSION_SECRET mancante nel .env: uso una chiave provvisoria (a ogni riavvio bisogna rientrare).');
    }
    return session({
        name: 'mappa.sid',
        secret: segreto,
        resave: false,
        saveUninitialized: false,
        // Dentro la pagina del sito LSE la mappa conta come "un altro sito": il cookie deve poterci stare
        // (SameSite=None, solo su https) e resta separato per ogni sito che la ospita (Partitioned).
        // nginx deve passare "X-Forwarded-Proto": è così che si sa che la connessione è https.
        ...(dentroIlSitoLse && { proxy: true }),
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            ...(dentroIlSitoLse ? { secure: true, sameSite: 'none', partitioned: true } : { sameSite: 'lax' }),
        },
    });
}

// Il ruolo nella mappa, dai ruoli del server Discord (vale sia per il login con Discord sia per l'ingresso dal sito LSE).
function ruoloDa(id, ruoli) {
    if (id === process.env.CREATOR_USER_ID || ruoli.includes(process.env.ADMIN_ROLE_ID)) return 'admin';
    if (ruoli.includes(process.env.RESPONSABILE_ROLE_ID)) return 'responsabile';
    if (ruoli.includes(process.env.PLSE_ROLE_ID)) return 'p-lse';
    return 'operatore';
}

// Biglietto del sito LSE: "<dati in base64url>.<firma HMAC-SHA256 in base64url>". Vale 60 secondi e una volta sola.
const bigliettiUsati = new Map(); // codice del biglietto → quando scade (ms)
function leggiBigliettoLse(biglietto) {
    if (!dentroIlSitoLse || typeof biglietto !== 'string') return null;
    const [corpo, firma] = biglietto.split('.');
    if (!corpo || !firma) return null;
    const attesa = crypto.createHmac('sha256', LSE_SEGRETO).update(corpo).digest();
    const ricevuta = Buffer.from(firma, 'base64url');
    if (ricevuta.length !== attesa.length || !crypto.timingSafeEqual(ricevuta, attesa)) return null;
    let dati;
    try { dati = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch { return null; }
    if (!dati || dati.v !== 1 || typeof dati.id !== 'string' || typeof dati.nome !== 'string' || typeof dati.n !== 'string') return null;
    if (!Array.isArray(dati.ruoli) || typeof dati.scade !== 'number') return null;
    const adesso = Date.now();
    if (dati.scade * 1000 < adesso) return null;
    for (const [codice, scade] of bigliettiUsati) if (scade < adesso) bigliettiUsati.delete(codice);
    if (bigliettiUsati.has(dati.n)) return null;
    bigliettiUsati.set(dati.n, dati.scade * 1000);
    return dati;
}

const paginaAccessoLseNegato = `<!doctype html><html lang="it"><meta charset="utf-8"><title>Accesso non riuscito</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#141312;color:#f1eee6;font:18px system-ui,sans-serif">
<p>Accesso dal sito LSE non riuscito: ricarica la pagina.</p>
<script src="/js/accesso-negato.js"></script>`;

// Apre la sessione nuova (mai riusare quella di prima) con chi è entrato.
function entra(req, res, utente) {
    req.session.regenerate((err) => {
        if (err) return res.redirect('/?accesso=errore');
        req.session.utente = utente;
        req.session.save(() => res.redirect('/'));
    });
}

async function jsonDiscord(risposta) {
    if (!risposta.ok) throw new Error(`Discord ha risposto ${risposta.status}: ${await risposta.text()}`);
    return risposta.json();
}

function montaAccesso(app) {
    if (dentroIlSitoLse) app.set('trust proxy', 1);
    if (!discordAttivo) console.warn('[ACCESSO] CLIENT_ID, CLIENT_SECRET o CALLBACK_URL mancanti: il login con Discord è spento.');

    app.get('/auth/discord', (req, res) => {
        if (!discordAttivo) return res.redirect('/?accesso=spento');
        const stato = crypto.randomBytes(16).toString('base64url');
        req.session.statoDiscord = stato;
        const url = new URL('https://discord.com/oauth2/authorize');
        url.search = new URLSearchParams({
            client_id: discord.clientId,
            redirect_uri: discord.callback,
            response_type: 'code',
            scope: 'identify guilds.members.read',
            state: stato,
            prompt: 'none',
        }).toString();
        req.session.save(() => res.redirect(url.toString()));
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const { code, state } = req.query;
        const atteso = req.session.statoDiscord;
        delete req.session.statoDiscord;
        if (typeof code !== 'string' || typeof state !== 'string' || !atteso || state !== atteso) return res.redirect('/?accesso=annullato');
        try {
            const token = await jsonDiscord(await fetch(`${API_DISCORD}/oauth2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: discord.clientId,
                    client_secret: discord.clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: discord.callback,
                }),
            }));
            const intestazioni = { Authorization: `Bearer ${token.access_token}` };
            const io = await jsonDiscord(await fetch(`${API_DISCORD}/users/@me`, { headers: intestazioni }));
            const risposta = await fetch(`${API_DISCORD}/users/@me/guilds/${discord.guild}/member`, { headers: intestazioni });
            if (risposta.status === 404) return res.redirect('/?accesso=fuori');
            const membro = await jsonDiscord(risposta);
            entra(req, res, {
                id: io.id,
                nome: membro.nick || io.global_name || io.username,
                ruolo: ruoloDa(io.id, membro.roles || []),
            });
        } catch (e) {
            console.error('[ACCESSO] Login con Discord non riuscito:', e.message);
            res.redirect('/?accesso=errore');
        }
    });

    app.get('/auth/lse', (req, res) => {
        if (dentroIlSitoLse && req.get('x-forwarded-proto') !== 'https') {
            console.warn('[LSE] La richiesta non risulta https: in nginx aggiungi "proxy_set_header X-Forwarded-Proto $scheme;" o il cookie non viene salvato.');
        }
        const dati = leggiBigliettoLse(req.query.t);
        if (!dati) return res.status(403).type('html').send(paginaAccessoLseNegato);
        entra(req, res, { id: dati.id, nome: dati.nome, ruolo: ruoloDa(dati.id, dati.ruoli) });
    });

    app.get('/api/me', (req, res) => {
        const utente = req.session.utente;
        if (!utente) return res.status(401).json({ discord: discordAttivo });
        res.json(utente);
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });
}

// Solo admin e responsabili (per caricare ed eliminare le mappe).
function soloUfficiali(req, res, next) {
    const utente = req.session.utente;
    if (!utente || !UFFICIALI.includes(utente.ruolo)) {
        return res.status(403).json({ errore: 'Solo admin e responsabili possono gestire le mappe.' });
    }
    next();
}

module.exports = { creaSessione, montaAccesso, soloUfficiali, LSE_SITI, UFFICIALI };
