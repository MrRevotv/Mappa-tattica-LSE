# Mappa tattica LSE (versione nuova)

La mappa condivisa in tempo reale per coordinare squadre e operazioni, rifatta da zero con lo stile e le regole
del sito LSE. Funziona da computer, iPad e telefono, anche dentro il sito (Area membri → Strumenti).

## Cosa resta uguale

Puoi mettere questa versione al posto della vecchia senza toccare il sito né Discord:

- **stesso file `.env`** (stesse voci: `CLIENT_ID`, `CLIENT_SECRET`, `CALLBACK_URL`, `GUILD_ID`, ruoli, `SESSION_SECRET`,
  `PORT`, `LSE_SEGRETO`, `LSE_SITO_URL`);
- **stessi indirizzi**: `/auth/discord`, `/auth/discord/callback`, `/auth/lse` (ingresso dal sito), `/api/me`, `/logout`;
- **stesse cartelle delle mappe** in `public/mappe` (gioco → sistema → pianeta → mappa, con `mappa_master` e le sottomappe);
- **stessi file missione**: quelli salvati con la mappa vecchia si caricano qui, e viceversa;
- **stesse regole del comando**: admin e responsabili hanno sempre il comando; se non c'è nessun ufficiale ce l'hanno
  tutti; altrimenti si chiede e un ufficiale lo dà o lo toglie;
- **stessi strumenti**: icone amiche e nemiche, nomi e colori, cerchio tattico, squadre con caposquadra/vice/membri,
  orbita con le note, matita con le forme automatiche, gomma, testo, griglia tattica, goniometro, visione notturna,
  ping con suono, calcolatore bounty (stessa formula), salva/carica missione, azzera mappa, registro.

## Cosa è cambiato

- **Interfaccia pulita**: un pannello alla volta (Mappa, Schiera, Disegna, Squadre, Bounty, Missione). Sul telefono gli
  strumenti stanno in una barra in basso e i pannelli salgono dal basso, lasciando vedere la mappa.
- **Scheda dell'icona**: toccando un'icona si apre una scheda con nome, fazione, colore, cerchio tattico (con il
  raggio regolabile), squadra, orbita ed elimina. Prima l'eliminazione singola non c'era e il cerchio e la selezione
  multipla funzionavano solo col mouse: ora anche col dito («Seleziona altre icone»).
- **Si vede sempre chi ha il comando** (riquadro in alto a destra) e chi può solo guardare ha i comandi bloccati con la
  spiegazione e il pulsante «Chiedi il comando». Gli ufficiali sentono un suono e vedono le richieste.
- **Mappe con le proporzioni giuste**: prima ogni immagine veniva stirata in 16:9; ora la mappa ha la sua forma e la
  griglia si adatta (le missioni vecchie si aprono come prima, per non spostare le icone).
- **Elenco delle mappe letto dalle cartelle**: basta copiare una cartella con WinSCP perché compaia, anche per
  «General» e «Arma 3» (prima non si potevano scegliere). Il file `catalogo_mappe.json` non serve più.
- **Ricerca delle mappe** su tutte le mappe e sottomappe, anche con qualche lettera sbagliata.
- **In tempo reale anche durante il trascinamento**, l'orbita e le note ora si vedono anche da chi entra dopo, e
  un'icona appena schierata non copre più quella già al centro.
- **Disegno col dito e con l'Apple Pencil** più affidabile; con due dita si zooma senza lasciare segni.
- **Se esci tutti un attimo la mappa non si svuota subito**: si azzera dopo 10 minuti senza nessuno collegato (prima
  bastava che l'ultimo chiudesse il tablet per perdere tutto).
- **Più sicura**: nomi e testi non possono più contenere codice, tutto quello che arriva al server viene controllato,
  caricamenti solo di immagini e solo dentro la cartella delle mappe.
- **Meno librerie**: tolte quelle che non servivano (axios, discord.js, leaflet-draw, passport, passport-discord).
- **Tolti**: la «Modalità esclusiva» (ora è sempre un pannello alla volta) e il tasto «chiudi tutto» col doppio tocco
  (si chiude con la X o con Esc).

Serve un browser recente: su iPhone e iPad almeno iOS 15.4.

## Avviarla sul PC

```
npm install
npm start
```

Le impostazioni vanno in un file `.env` (vedi `.env.example`). Senza `CLIENT_ID` e `CLIENT_SECRET` la mappa parte lo
stesso, ma il login con Discord è spento (si entra solo dal sito con `LSE_SEGRETO`).

## Metterla online al posto della vecchia (VPS)

Il container `mappatattica` della VPS (`/home/ubuntu/container/mappatattica`) va bene così com'è: usa Node 24 e lancia
`node server.js`.

1. Con WinSCP, nella cartella `mappatattica` della VPS **tieni** `.env` e `public/mappe`; sposta il resto in una
   cartella di riserva (così torni indietro in un attimo).
2. Carica i file di questa cartella **tranne** `node_modules`, `.env` e `public/mappe`.
3. Crea un file vuoto chiamato `update`: entro 15 minuti la VPS reinstalla i pacchetti e riaccende la mappa.

Per tornare alla versione vecchia basta rimettere i file dalla cartella di riserva e creare di nuovo `update`.

## Com'è fatta

- `server.js`: avvio del server web e del tempo reale (Express + Socket.IO).
- `server/accesso.js`: login con Discord, biglietto del sito LSE, ruoli.
- `server/mappe.js`: elenco, caricamento ed eliminazione delle mappe.
- `server/stanza.js`: lo stato condiviso e le regole del comando.
- `server/normalizza.js`: controlli su tutto quello che arriva dai browser e dai file missione.
- `public/index.html`, `public/css/mappa.css`: la pagina e il suo stile.
- `public/js/`: un file per ogni parte (mappa, icone, scheda, disegno, pannelli, comando…).
