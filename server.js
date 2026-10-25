// Mappa tattica della LSE: server web + tempo reale. Si avvia con "npm start" (impostazioni nel file .env).
require('dotenv').config({ quiet: true });
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { creaSessione, montaAccesso, LSE_SITI } = require('./server/accesso');
const { montaMappe, RADICE } = require('./server/mappe');
const { avviaStanze } = require('./server/stanza');
const { avviaBounty } = require('./server/bounty');
const { chiudiArchivi } = require('./server/archivio');

const app = express();
const server = http.createServer(app);
// Le missioni con molti disegni pesano: fino a 8 MB per messaggio.
const io = new Server(server, { maxHttpBufferSize: 8e6 });
const PORT = process.env.PORT || 3000;
const PUBBLICA = path.join(__dirname, 'public');

app.disable('x-powered-by');
// Solo la mappa stessa e il sito LSE possono mostrarla dentro una pagina; script solo da qui.
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
        `frame-ancestors ${["'self'", ...LSE_SITI].join(' ')}`,
        "script-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

const sessione = creaSessione();
app.use(sessione);
app.use(express.json({ limit: '100kb' }));
io.engine.use(sessione);

montaAccesso(app);
const stanze = avviaStanze(io);
avviaBounty(io);
montaMappe(app, { quandoCambia: (dati) => stanze.mappaCambiata(dati) });

// File: pagina, codice e mappe si ricontrollano a ogni apertura (dopo un aggiornamento arrivano subito);
// icone, font e Leaflet non cambiano e restano in cache.
const mappe = express.static(RADICE, { maxAge: 0 });
app.use('/mappe', mappe);
app.use('/Mappe', mappe); // le missioni salvate con la mappa di prima scrivono "Mappe/…"
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist'), { maxAge: '7d' }));
for (const cartella of ['Icone', 'fonts', 'img']) {
    app.use(`/${cartella}`, express.static(path.join(PUBBLICA, cartella), { maxAge: '7d' }));
}
app.get('/bounty', (req, res) => res.sendFile(path.join(PUBBLICA, 'bounty.html'), { maxAge: 0 }));
app.use(express.static(PUBBLICA, { maxAge: 0 }));

server.listen(PORT, () => console.log(`Mappa tattica online sulla porta ${PORT}`));

// Allo spegnimento (aggiornamento, riavvio del container) le sessioni non ancora scritte sul disco si scrivono subito.
for (const segnale of ['SIGTERM', 'SIGINT']) {
    process.on(segnale, () => {
        chiudiArchivi();
        process.exit(0);
    });
}
