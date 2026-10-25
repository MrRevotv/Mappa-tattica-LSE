// Le sessioni salvate sul disco (cartella «dati», una sottocartella per la mappa e una per il bounty): un file JSON per
// sessione, così sopravvivono a un riavvio o a un aggiornamento. Una sessione che nessuno usa da 5 giorni si cancella.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATI = path.join(__dirname, '..', 'dati');
const DURATA_MS = 5 * 24 * 60 * 60 * 1000;
const CONTROLLO_SCADENZE_MS = 60 * 60 * 1000;
// Tanti cambi di fila (un'icona trascinata, una cifra scritta) diventano una scrittura sola.
const ATTESA_SCRITTURA_MS = 2000;
const ID = /^[\w-]{6,32}$/;

const archivi = [];

const nuovoId = () => crypto.randomBytes(6).toString('base64url');
// Un momento salvato (ms dal 1970): solo numeri validi e mai nel futuro, sennò "adesso".
const istante = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, Date.now()) : Date.now());
const idValido = (id) => typeof id === 'string' && ID.test(id);
// Scaduta: nessuno dentro e nessuno l'ha usata negli ultimi 5 giorni.
const scaduta = (sessione, adesso = Date.now()) => sessione.persone.size === 0 && adesso - sessione.ultimoUso > DURATA_MS;

function prova(fn, cosa) {
    try {
        fn();
    } catch (e) {
        console.error(`[ARCHIVIO] ${cosa} non riuscito:`, e.message);
    }
}

function creaArchivio(nome) {
    const cartella = path.join(DATI, nome);
    fs.mkdirSync(cartella, { recursive: true });
    const inAttesa = new Map(); // id → { timer, dati }
    const file = (id) => path.join(cartella, `${id}.json`);

    // Prima in un file a parte, poi al suo posto: se il server si spegne a metà, il file di prima resta buono.
    function scrivi(id, dati) {
        prova(() => {
            fs.mkdirSync(cartella, { recursive: true }); // se nel frattempo qualcuno l'ha cancellata
            const temporaneo = `${file(id)}.tmp`;
            fs.writeFileSync(temporaneo, JSON.stringify(dati));
            fs.renameSync(temporaneo, file(id));
        }, `Salvataggio di ${nome}/${id}`);
    }

    const archivio = {
        // Tutte le sessioni salvate; un file rovinato si salta (e resta lì, per guardarlo a mano).
        leggiTutte() {
            const sessioni = [];
            for (const nomeFile of fs.readdirSync(cartella)) {
                const id = nomeFile.replace(/\.json$/, '');
                if (!nomeFile.endsWith('.json') || !idValido(id)) continue;
                prova(() => sessioni.push({ ...JSON.parse(fs.readFileSync(file(id), 'utf8')), id }), `Lettura di ${nome}/${nomeFile}`);
            }
            return sessioni;
        },
        // "dati" è una funzione: si salva la sessione com'è al momento della scrittura, non com'era alla chiamata.
        salva(id, dati) {
            const gia = inAttesa.get(id);
            if (gia) {
                gia.dati = dati;
                return;
            }
            const voce = { dati, timer: null };
            voce.timer = setTimeout(() => {
                inAttesa.delete(id);
                scrivi(id, voce.dati());
            }, ATTESA_SCRITTURA_MS);
            inAttesa.set(id, voce);
        },
        cancella(id) {
            clearTimeout(inAttesa.get(id)?.timer);
            inAttesa.delete(id);
            prova(() => fs.rmSync(file(id), { force: true }), `Eliminazione di ${nome}/${id}`);
        },
        scriviSubito() {
            for (const [id, voce] of inAttesa) {
                clearTimeout(voce.timer);
                scrivi(id, voce.dati());
            }
            inAttesa.clear();
        },
    };
    archivi.push(archivio);
    return archivio;
}

// Allo spegnimento (aggiornamento, riavvio) si scrive subito quello che era ancora in attesa.
function chiudiArchivi() {
    for (const a of archivi) a.scriviSubito();
}

module.exports = { creaArchivio, chiudiArchivi, nuovoId, idValido, istante, scaduta, DURATA_MS, CONTROLLO_SCADENZE_MS };
