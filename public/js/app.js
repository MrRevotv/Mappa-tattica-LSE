// Avvio della mappa tattica: controlla l'accesso, apre il collegamento in tempo reale e smista i messaggi.
import { app, emetti, on, trovaElemento } from './stato.js';
import { $, avviso } from './ui.js';
import { preparaAudio } from './suoni.js';
import { creaMappa, impostaSfondo, disegnaGriglia, mostraPing } from './mappa.js';
import { avviaElementi, rendiTutti, aggiornaVista, sposta, aggiungiDaFuori, togli, aggiornaTrascinabili } from './elementi.js';
import { avviaScheda } from './scheda.js';
import { avviaDisegno, mostraDisegni } from './disegno.js';
import { avviaPannelli } from './pannelli.js';
import { avviaComando, aggiornaComando } from './comando.js';
import { avviaGoniometro } from './goniometro.js';
import { avviaPannelloMappa } from './pannello-mappa.js';
import { avviaPannelloSchiera } from './pannello-schiera.js';
import { avviaPannelloSquadre } from './pannello-squadre.js';
import { avviaPannelloMissione } from './pannello-missione.js';
import { avviaSceltaSessione, entraAllInizio, ricordaSessione } from './scelta-sessione.js';

// Dentro il sito LSE (Area membri → Strumenti) la mappa sta in una pagina del sito: le dice se si è aperta
// ("pronta") o se qui dentro non ha l'accesso ("serve-accesso"), così il sito può proporre una scheda nuova.
let prontaDetta = false;
function avvisaSitoLse(stato) {
    if (stato === 'pronta') {
        if (prontaDetta) return;
        prontaDetta = true;
    }
    if (app.dentroIlSito) window.parent.postMessage({ tipo: 'lse-strumento', stato }, '*');
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

function applicaStato(stato) {
    app.stato = stato;
    impostaSfondo(stato.sfondo, stato.bounds);
    disegnaGriglia();
    rendiTutti();
    mostraDisegni(stato.disegni);
    emetti('stato:nuovo');
}

function collega() {
    const socket = io({ transports: ['websocket', 'polling'] });
    app.socket = socket;
    let primaVolta = true;

    // Appena collegati arriva l'elenco delle sessioni: si entra in una (o si sceglie), poi arriva il "benvenuto".
    socket.on('ciao', ({ utente, sessioni }) => {
        app.utente = utente;
        app.sessioni = sessioni;
        emetti('utente');
        emetti('sessioni');
        if (!entraAllInizio()) {
            $('#avvio').hidden = true;
            avvisaSitoLse('pronta');
        }
    });

    socket.on('benvenuto', ({ sessione, comando, capo, stato, catalogo, registro }) => {
        const cambiata = app.sessione && app.sessione.id !== sessione.id;
        app.sessione = sessione;
        app.capo = capo;
        app.comando = comando;
        app.richiestaInviata = false;
        app.catalogo = catalogo;
        applicaStato(stato);
        emetti('sessione');
        emetti('catalogo');
        emetti('registro:tutto', registro);
        aggiornaComando();
        aggiornaTrascinabili();
        ricordaSessione(sessione);
        if (primaVolta) {
            primaVolta = false;
            $('#avvio').hidden = true;
            mostraNovita();
            avvisaSitoLse('pronta');
        } else if (cambiata) {
            avviso(`Sei nella sessione «${sessione.nome}».`, { tipo: 'ok', durata: 3000 });
        } else {
            avviso('Di nuovo collegato.', { tipo: 'ok', durata: 2500 });
        }
    });

    socket.on('sessioni', (sessioni) => {
        app.sessioni = sessioni;
        app.sessione = sessioni.find((s) => s.id === app.sessione?.id) || app.sessione;
        emetti('sessioni');
    });
    socket.on('sessione:sparita', () => emetti('sessione:sparita'));

    socket.on('serve-accesso', () => location.reload());
    socket.on('disconnect', (motivo) => {
        if (motivo !== 'io client disconnect') avviso('Collegamento perso: riprovo da solo…', { tipo: 'errore', durata: 6000 });
    });

    socket.on('stato', (stato) => applicaStato(stato));
    socket.on('catalogo', (catalogo) => {
        app.catalogo = catalogo;
        emetti('catalogo');
    });
    socket.on('presenze', (presenze) => {
        app.presenze = presenze;
        emetti('presenze');
    });
    socket.on('comando', ({ comando, motivo }) => {
        app.comando = comando;
        aggiornaComando();
        aggiornaTrascinabili();
        if (motivo) avviso(motivo, { tipo: comando ? 'ok' : '' });
    });
    socket.on('richiesta', (r) => emetti('richiesta', r));
    socket.on('registro', (riga) => emetti('registro', riga));
    socket.on('avviso', ({ testo, tipo }) => avviso(testo, { tipo }));

    socket.on('elemento:nuovo', (e) => aggiungiDaFuori(e));
    socket.on('elemento:modifica', ({ id, campi }) => {
        const e = trovaElemento(id);
        if (!e) return;
        Object.assign(e, campi);
        aggiornaVista(id, campi);
        if ('inOrbita' in campi) emetti('elementi:cambiati');
    });
    socket.on('elemento:sposta', ({ lista }) => sposta(lista));
    socket.on('elemento:elimina', (ids) => togli(ids, { daFuori: true }));

    socket.on('disegni', (g) => {
        app.stato.disegni = g;
        mostraDisegni(g);
    });
    socket.on('griglia', (attiva) => {
        app.stato.grigliaAttiva = attiva;
        disegnaGriglia();
        emetti('griglia', attiva);
    });
    socket.on('mappa', ({ url, bounds, zona }) => {
        app.stato.sfondo = url;
        app.stato.bounds = bounds;
        app.stato.zonaOperativa = zona;
        impostaSfondo(url, bounds);
        emetti('mappa:cambiata');
    });
    socket.on('ping', ({ lat, lng, id, nome, ruolo }) => mostraPing(lat, lng, { ruolo, nome, chiave: id }));
}

// Un suggerimento la prima volta su questo dispositivo.
function mostraNovita() {
    try {
        if (localStorage.getItem('mappa-lse-suggerimento')) return;
        localStorage.setItem('mappa-lse-suggerimento', '1');
    } catch {
        return;
    }
    setTimeout(() => avviso('Suggerimento: doppio tocco sulla mappa per mandare un ping a tutti.', { durata: 7000 }), 1200);
}

async function avvia() {
    preparaAudio();
    let risposta;
    try {
        risposta = await fetch('/api/me', { cache: 'no-store' });
    } catch {
        $('#avvio p').textContent = 'La mappa non risponde: controlla la connessione e ricarica la pagina.';
        return;
    }
    if (!risposta.ok) {
        const info = await risposta.json().catch(() => ({}));
        mostraIngresso(info.discord);
        return;
    }
    app.utente = await risposta.json();

    // La pagina si prepara sotto la schermata d'attesa: Leaflet deve conoscere le misure vere della mappa.
    $('#app').hidden = false;
    creaMappa();
    avviaPannelli();
    avviaComando();
    avviaElementi();
    avviaScheda();
    avviaDisegno();
    avviaGoniometro();
    avviaPannelloMappa();
    avviaPannelloSchiera();
    avviaPannelloSquadre();
    avviaPannelloMissione();
    avviaSceltaSessione();
    on('utente', () => document.body.classList.toggle('ufficiale', ['admin', 'responsabile'].includes(app.utente.ruolo)));
    collega();
}

avvia();
