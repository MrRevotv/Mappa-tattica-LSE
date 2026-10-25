// Le immagini delle mappe, in public/mappe. Ogni "luogo" è una cartella con dentro mappa_master/ (la mappa
// principale); le sottomappe sono le immagini sciolte nella cartella del luogo:
//   mappe/Star_Citizen/Stanton/Hurston/bueno_ravine/mappa_master/bueno_ravine.png   ← mappa principale
//   mappe/Star_Citizen/Stanton/Hurston/bueno_ravine/altra_vista.png                 ← sottomappa
//   mappe/General/Hathor-VIVERE-Aberdeen/mappa_master/Hathor-VIVERE-Aberdeen.jpg      (giochi senza sistemi)
// L'elenco si ricava sempre dalle cartelle: basta copiare una cartella con WinSCP perché compaia.
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { soloUfficiali } = require('./accesso');

const RADICE = path.join(__dirname, '..', 'public', 'mappe');
const TEMPORANEI = path.join(__dirname, '..', 'uploads');
const IMMAGINE = /\.(png|jpe?g|webp)$/i;
const MASSIMO_MB = 80;

// Giochi, sistemi e pianeti proposti anche quando non hanno ancora mappe.
const STRUTTURA = [
    {
        id: 'Star_Citizen',
        nome: 'Star Citizen',
        sistemi: {
            Stanton: ['Microtech', 'Hurston', 'ArcCorp', 'Crusader'],
            Pyro: ['Pyro_I', 'Pyro_II', 'Pyro_III'],
            Nyx: ['Delamar'],
        },
    },
    { id: 'Arma_3', nome: 'Arma 3' },
    { id: 'General', nome: 'General' },
];

const leggibile = (s) => s.replace(/[_-]+/g, ' ').trim().replace(/(^|\s)(\S)/g, (_, spazio, lettera) => spazio + lettera.toUpperCase());
const segmentoValido = (s) => typeof s === 'string' && s.length > 0 && s.length <= 80 && /^[\w\-. ()]+$/.test(s) && s !== '.' && s !== '..';
const urlDi = (assoluto) => 'mappe/' + path.relative(RADICE, assoluto).split(path.sep).join('/');

function immaginiIn(cartella) {
    return fs.readdirSync(cartella, { withFileTypes: true })
        .filter((d) => d.isFile() && IMMAGINE.test(d.name))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b));
}

function cerca(cartella, zona, luoghi) {
    let voci;
    try { voci = fs.readdirSync(cartella, { withFileTypes: true }); } catch { return; }
    for (const voce of voci) {
        if (!voce.isDirectory() || voce.name === 'mappa_master') continue;
        const dentro = path.join(cartella, voce.name);
        const master = path.join(dentro, 'mappa_master');
        if (fs.existsSync(master)) {
            const principali = immaginiIn(master);
            if (!principali.length) continue;
            luoghi.push({
                zona,
                id: voce.name,
                nome: leggibile(voce.name),
                master: urlDi(path.join(master, principali[0])),
                sottomappe: immaginiIn(dentro).map((f) => ({ nome: leggibile(f.replace(IMMAGINE, '')), url: urlDi(path.join(dentro, f)) })),
            });
        } else if (zona.length < 3) {
            cerca(dentro, [...zona, voce.name], luoghi);
        }
    }
}

// Tutto quello che serve al pannello Mappa: giochi → sistemi → pianeti, e i luoghi trovati nelle cartelle.
function leggiCatalogo() {
    const luoghi = [];
    cerca(RADICE, [], luoghi);
    luoghi.sort((a, b) => a.nome.localeCompare(b.nome));

    const giochi = STRUTTURA.map((g) => ({
        id: g.id,
        nome: g.nome,
        sistemi: g.sistemi ? Object.entries(g.sistemi).map(([id, pianeti]) => ({ id, pianeti: [...pianeti] })) : null,
    }));
    // Quello che c'è nelle cartelle ma non nella struttura fissa (es. un pianeta nuovo creato con WinSCP).
    for (const l of luoghi) {
        let gioco = giochi.find((g) => g.id === l.zona[0]);
        if (!gioco) {
            gioco = { id: l.zona[0], nome: leggibile(l.zona[0]), sistemi: null };
            giochi.push(gioco);
        }
        if (l.zona.length === 3) {
            gioco.sistemi ??= [];
            let sistema = gioco.sistemi.find((s) => s.id === l.zona[1]);
            if (!sistema) gioco.sistemi.push((sistema = { id: l.zona[1], pianeti: [] }));
            if (!sistema.pianeti.includes(l.zona[2])) sistema.pianeti.push(l.zona[2]);
        }
    }
    return { giochi, luoghi: luoghi.filter((l) => l.zona.length === 1 || l.zona.length === 3) };
}

// Dove va una mappa: Star Citizen vuole sistema e pianeta, gli altri giochi solo il gioco.
function zonaValida(zona) {
    if (!Array.isArray(zona) || !zona.every(segmentoValido)) return false;
    const conSistemi = leggiCatalogo().giochi.find((g) => g.id === zona[0])?.sistemi;
    return conSistemi ? zona.length === 3 : zona.length === 1;
}

function nomeFile(originale) {
    const estensione = path.extname(originale).toLowerCase().replace('.jpeg', '.jpg');
    const base = path.basename(originale, path.extname(originale)).trim().replace(/\s+/g, '_').replace(/[^\w\-.()]/g, '').slice(0, 80);
    return (base || 'mappa') + estensione;
}

// Il percorso vero sul disco di un indirizzo "mappe/…", solo se sta davvero dentro public/mappe.
function percorsoDa(url) {
    if (typeof url !== 'string' || !/^mappe\//i.test(url)) return null;
    const assoluto = path.resolve(RADICE, url.slice('mappe/'.length));
    return assoluto.startsWith(RADICE + path.sep) ? assoluto : null;
}

function montaMappe(app, { quandoCambia }) {
    fs.mkdirSync(TEMPORANEI, { recursive: true });
    const carica = multer({
        dest: TEMPORANEI,
        limits: { fileSize: MASSIMO_MB * 1024 * 1024, files: 1 },
        fileFilter: (req, file, cb) => cb(null, IMMAGINE.test(file.originalname) && file.mimetype.startsWith('image/')),
    }).single('mappa');

    app.get('/api/mappe', (req, res) => {
        if (!req.session.utente) return res.sendStatus(401);
        res.json(leggiCatalogo());
    });

    app.post('/api/mappe', soloUfficiali, (req, res) => {
        carica(req, res, (err) => {
            const temporaneo = req.file?.path;
            const fallisci = (codice, errore) => {
                if (temporaneo) fs.rm(temporaneo, { force: true }, () => {});
                res.status(codice).json({ errore });
            };
            if (err?.code === 'LIMIT_FILE_SIZE') return fallisci(413, `L'immagine è troppo grande (massimo ${MASSIMO_MB} MB).`);
            if (err) return fallisci(400, 'Caricamento non riuscito.');
            if (!req.file) return fallisci(400, 'Scegli un\'immagine PNG, JPG o WebP.');

            let zona;
            try { zona = JSON.parse(req.body.zona || ''); } catch { zona = null; }
            if (!zonaValida(zona)) return fallisci(400, 'Scegli prima dove mettere la mappa (gioco, sistema e pianeta).');

            const file = nomeFile(req.file.originalname);
            let destinazione;
            if (req.body.tipo === 'master') {
                const luogo = file.replace(IMMAGINE, '');
                const cartella = path.join(RADICE, ...zona, luogo);
                if (fs.existsSync(cartella)) return fallisci(409, `C'è già una mappa chiamata «${leggibile(luogo)}» qui: cambia il nome del file o elimina quella.`);
                destinazione = path.join(cartella, 'mappa_master', file);
            } else if (req.body.tipo === 'sottomappa') {
                if (!segmentoValido(req.body.luogo)) return fallisci(400, 'Scegli prima la mappa principale.');
                const cartella = path.join(RADICE, ...zona, req.body.luogo);
                if (!fs.existsSync(path.join(cartella, 'mappa_master'))) return fallisci(400, 'La mappa principale non esiste più.');
                destinazione = path.join(cartella, file);
                if (fs.existsSync(destinazione)) return fallisci(409, `C'è già una sottomappa con il nome «${file}».`);
            } else {
                return fallisci(400, 'Tipo di caricamento sconosciuto.');
            }

            fs.mkdirSync(path.dirname(destinazione), { recursive: true });
            fs.renameSync(temporaneo, destinazione);
            const url = urlDi(destinazione);
            quandoCambia({ utente: req.session.utente, testo: `ha caricato la mappa ${file}` });
            res.json({ url });
        });
    });

    app.post('/api/mappe/elimina', soloUfficiali, (req, res) => {
        const assoluto = percorsoDa(req.body?.url);
        if (!assoluto || !fs.existsSync(assoluto) || !IMMAGINE.test(assoluto)) return res.status(404).json({ errore: 'Questa mappa non c\'è più.' });
        let tolta;
        if (path.basename(path.dirname(assoluto)) === 'mappa_master') {
            // La mappa principale si porta via tutto il luogo, sottomappe comprese.
            const luogo = path.dirname(path.dirname(assoluto));
            fs.rmSync(luogo, { recursive: true, force: true });
            tolta = { cartella: urlDi(luogo), testo: `ha eliminato la mappa ${path.basename(luogo)} con le sue sottomappe` };
        } else {
            fs.rmSync(assoluto, { force: true });
            tolta = { file: urlDi(assoluto), testo: `ha eliminato la sottomappa ${path.basename(assoluto)}` };
        }
        quandoCambia({ utente: req.session.utente, testo: tolta.testo, tolta });
        res.json({ ok: true });
    });
}

module.exports = { montaMappe, leggiCatalogo, RADICE };
