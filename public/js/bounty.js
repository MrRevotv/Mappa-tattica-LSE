// La pagina del tool «Bounty e salvage»: l'elenco delle sessioni e il calcolatore della sessione aperta, condiviso in
// tempo reale con chi c'è dentro. Lo usano tutti quelli che sono entrati (Discord o sito LSE), qualunque ruolo abbiano.
// La sessione aperta resta nell'indirizzo della pagina: ricaricando (o mandando il link) si torna lì.
import { $, crea, avviso, conferma, rimanda } from './ui.js';
import { avviaCalcolatore, applica, leggi } from './calcolatore-bounty.js';
import { rigaSessione, puoChiudere, nuovaSessione, chiudiSessione } from './sessioni.js';

const UFFICIALI = ['admin', 'responsabile'];
const dentroIlSito = window.parent !== window;
const stato = { utente: null, sessioni: [], sessione: null, presenze: [], socket: null };
const eUfficiale = () => UFFICIALI.includes(stato.utente?.ruolo);

// Dentro il sito LSE (Area membri → Strumenti) la pagina dice al sito se si è aperta o se serve l'accesso.
let prontaDetta = false;
function avvisaSitoLse(cosa) {
    if (cosa === 'pronta') {
        if (prontaDetta) return;
        prontaDetta = true;
    }
    if (dentroIlSito) window.parent.postMessage({ tipo: 'lse-strumento', stato: cosa }, '*');
}

const ERRORI_INGRESSO = {
    fuori: 'Il tuo account Discord non risulta nel server della LSE.',
    errore: 'Accesso con Discord non riuscito: riprova tra poco.',
    annullato: 'Accesso annullato.',
    spento: 'L\'accesso con Discord non è ancora configurato su questo server.',
};

function mostraIngresso(discordAttivo) {
    $('#avvio').hidden = true;
    $('#ingresso').hidden = false;
    const errore = ERRORI_INGRESSO[new URLSearchParams(location.search).get('accesso')] || (discordAttivo === false ? ERRORI_INGRESSO.spento : '');
    $('#ingresso-errore').textContent = errore;
    $('#ingresso-errore').hidden = !errore;
    if (location.search) history.replaceState(null, '', location.pathname);
    avvisaSitoLse('serve-accesso');
}

function ricorda(s) {
    history.replaceState(null, '', s ? `${location.pathname}?sessione=${encodeURIComponent(s.id)}` : location.pathname);
}

// --- Elenco ---
function disegnaElenco() {
    $('#elenco-sessioni').replaceChildren(...stato.sessioni.map((s) => rigaSessione(s, {
        mia: s.creatoreId === stato.utente.id,
        chiudibile: puoChiudere(s, stato.utente, eUfficiale()),
        entra: (s) => stato.socket.emit('sessione:entra', s.id),
        chiudi: (s) => chiudiSessione(stato.socket, s, 'Sparisce per tutti, con tutti i suoi conti. Se ti servono, apri la sessione e salva prima il file.'),
    })));
    $('#elenco-vuoto').hidden = stato.sessioni.length > 0;
}

function mostraElenco() {
    stato.sessione = null;
    stato.presenze = [];
    ricorda(null);
    $('#vista-sessione').hidden = true;
    $('#vista-elenco').hidden = false;
    disegnaElenco();
}

// --- Sessione aperta ---
const inviaDopo = rimanda((dati) => stato.socket.emit('bounty', dati), 400);

function disegnaSessione() {
    const s = stato.sessione;
    if (!s) return;
    $('#sessione-nome').textContent = s.nome;
    $('#sessione-info').textContent = `Aperta da ${s.creatore || 'qualcuno'} · dentro ora:`;
    // Prima tu, poi gli altri.
    const nomi = [stato.utente.nome, ...stato.presenze.filter((nome) => nome !== stato.utente.nome)];
    $('#sessione-presenti').replaceChildren(...nomi.map((nome, i) => crea('li', {}, nome, i === 0 ? crea('span', { class: 'tu' }, ' (tu)') : null)));
    $('#chiudi-sessione').hidden = !puoChiudere(s, stato.utente, eUfficiale());
    const altre = stato.sessioni.length;
    $('#conta-sessioni').textContent = altre > 1 ? ` (${altre})` : '';
}

function tornaAllElenco() {
    inviaDopo.subito();
    stato.socket.emit('sessione:esci');
    mostraElenco();
}

function nomeFile(testo) {
    return testo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'bounty';
}

function salvaFile() {
    const s = stato.sessione;
    const dati = { tipo: 'bounty-lse', versione: 1, nome: s.nome, salvato: new Date().toISOString(), bounty: leggi() };
    const blob = new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' });
    const d = new Date();
    const due = (n) => String(n).padStart(2, '0');
    const a = crea('a', { href: URL.createObjectURL(blob), download: `Bounty_LSE_${nomeFile(s.nome)}_${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    avviso('File del bounty scaricato.', { tipo: 'ok' });
}

// Va bene un file salvato qui o una missione della mappa di prima (che aveva anche il bounty).
async function caricaFile(file) {
    if (!file || !stato.sessione) return;
    let dati;
    try {
        dati = JSON.parse(await file.text());
    } catch {
        dati = null;
    }
    const bounty = dati?.bounty;
    if (!bounty || typeof bounty !== 'object') {
        avviso('Questo file non contiene un bounty: scegline uno salvato da qui o dalla mappa di prima.', { tipo: 'errore' });
        return;
    }
    const ok = await conferma({ titolo: 'Caricare il file?', testo: `I conti di «${file.name}» prendono il posto di quelli di questa sessione, per tutti.`, si: 'Carica' });
    if (!ok || !stato.sessione) return;
    applica(bounty);
    inviaDopo(leggi());
    inviaDopo.subito();
}

// --- Collegamento ---
function collega() {
    const socket = io('/bounty', { transports: ['websocket', 'polling'] });
    stato.socket = socket;
    let primaVolta = true;

    // Appena collegati: si rientra nella sessione in cui si era (collegamento perso, link, pagina ricaricata)
    // oppure si mostra l'elenco.
    socket.on('ciao', ({ utente, sessioni }) => {
        stato.utente = utente;
        stato.sessioni = sessioni;
        $('#utente').textContent = utente.nome;
        const voluta = stato.sessione?.id || new URLSearchParams(location.search).get('sessione');
        if (voluta && sessioni.some((s) => s.id === voluta)) {
            socket.emit('sessione:entra', voluta);
        } else {
            if (voluta) avviso('La sessione in cui eri è stata chiusa.');
            mostraElenco();
        }
        if (primaVolta) {
            primaVolta = false;
            $('#avvio').hidden = true;
            avvisaSitoLse('pronta');
        } else {
            avviso('Di nuovo collegato.', { tipo: 'ok', durata: 2500 });
        }
    });

    socket.on('sessioni', (sessioni) => {
        stato.sessioni = sessioni;
        if (!$('#vista-elenco').hidden) disegnaElenco();
        else disegnaSessione();
    });

    socket.on('benvenuto', ({ sessione, bounty }) => {
        stato.sessione = sessione;
        stato.presenze = [];
        applica(bounty);
        ricorda(sessione);
        $('#vista-elenco').hidden = true;
        $('#vista-sessione').hidden = false;
        $('#app').scrollTop = 0;
        disegnaSessione();
    });

    socket.on('presenze', (nomi) => {
        stato.presenze = nomi;
        disegnaSessione();
    });
    socket.on('bounty', (dati) => applica(dati));
    socket.on('sessione:sparita', () => {
        avviso('Quella sessione non c\'è più.', { tipo: 'errore' });
        mostraElenco();
    });
    socket.on('sessione:chiusa', ({ nome, da }) => {
        avviso(`${da} ha chiuso la sessione «${nome}».`);
        mostraElenco();
    });
    socket.on('serve-accesso', () => location.reload());
    socket.on('disconnect', (motivo) => {
        if (motivo !== 'io client disconnect') avviso('Collegamento perso: riprovo da solo…', { tipo: 'errore', durata: 6000 });
    });
}

async function avvia() {
    let risposta;
    try {
        risposta = await fetch('/api/me', { cache: 'no-store' });
    } catch {
        $('#avvio p').textContent = 'Il calcolatore non risponde: controlla la connessione e ricarica la pagina.';
        return;
    }
    if (!risposta.ok) {
        const info = await risposta.json().catch(() => ({}));
        mostraIngresso(info.discord);
        return;
    }

    $('#app').hidden = false;
    if (dentroIlSito) $('#esci').hidden = true;
    avviaCalcolatore({ cambiato: (dati) => { if (stato.sessione) inviaDopo(dati); } });
    $('#nuova-sessione').addEventListener('click', () => nuovaSessione(stato.socket, { titolo: 'Nuova sessione del bounty' }));
    $('#torna-elenco').addEventListener('click', tornaAllElenco);
    $('#scarica-bounty').addEventListener('click', salvaFile);
    $('#carica-bounty').addEventListener('click', () => $('#file-bounty').click());
    $('#file-bounty').addEventListener('change', (e) => {
        caricaFile(e.target.files[0]);
        e.target.value = '';
    });
    $('#chiudi-sessione').addEventListener('click', async () => {
        const s = stato.sessione;
        const chiusa = await chiudiSessione(stato.socket, s, 'Sparisce per tutti, con tutti i suoi conti. Se ti servono, salva prima il file.');
        if (chiusa && stato.sessione === s) mostraElenco();
    });
    collega();
}

avvia();
