// Pannello "Commando": la sessione in cui si è, comando e richieste, chi è collegato, salva e carica il file della
// missione, azzera la mappa, registro dei capi, come si usa, uscita.
// I "capi" di una sessione sono gli ufficiali e chi l'ha creata: hanno sempre il comando e lo danno agli altri.
import { app, invia, on, eUfficiale, NOMI_RUOLI } from './stato.js';
import { $, $$, crea, avviso, conferma } from './ui.js';
import { chiediComando } from './comando.js';
import { disegni } from './disegno.js';
import { puoChiudere } from './sessioni.js';
import { apriScelta, chiudiSessione } from './scelta-sessione.js';

const ora = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function nomeDi(sid) {
    return app.presenze.persone.find((p) => p.sid === sid)?.nome || 'Qualcuno';
}

function puoAzzerare() {
    return app.capo || (app.comando && !app.presenze.persone.some((p) => p.capo));
}

// Chi dà il comando in questa sessione: «un ufficiale» o «Mario o un ufficiale».
function chiDecide() {
    const s = app.sessione;
    return s?.principale || !s?.creatore ? 'un ufficiale' : `${s.creatore} o un ufficiale`;
}

function disegnaSessione() {
    const s = app.sessione;
    if (!s) return;
    $('#sessione-nome').textContent = s.nome;
    $('#sessione-info').textContent = s.principale
        ? 'La sessione di tutti. Quando non c\'è più nessuno, dopo 10 minuti torna pulita.'
        : `Aperta da ${s.creatore || 'qualcuno'}. Resta salvata e si cancella da sola dopo 5 giorni che nessuno la usa.`;
    $('#chiudi-sessione').hidden = !puoChiudere(s, app.utente, eUfficiale());
    $('#conta-sessioni').textContent = app.sessioni.length > 1 ? ` (${app.sessioni.length})` : '';
    for (const el of $$('[data-capi]')) el.hidden = !app.capo;
}

function disegnaComando() {
    const capo = app.capo;
    let frase;
    if (capo && eUfficiale()) frase = 'Sei un ufficiale: hai sempre il comando e decidi chi altro può modificare la mappa.';
    else if (capo) frase = 'Hai aperto tu questa sessione: hai sempre il comando e decidi chi altro può modificare la mappa.';
    else if (app.comando) frase = 'Hai il comando: puoi modificare la mappa per tutti quelli della sessione.';
    else if (app.richiestaInviata) frase = `Richiesta inviata: aspetta che ${chiDecide()} ti dia il comando.`;
    else frase = `Stai guardando: per modificare la mappa chiedi il comando a ${chiDecide()}.`;
    $('#comando-frase').textContent = frase;
    $('#chiedi-comando').hidden = capo || app.comando || app.richiestaInviata;
    $('#lascia-comando').hidden = capo || !app.comando;

    if (capo) {
        const richieste = app.presenze.richieste;
        const conComando = app.presenze.persone.filter((p) => p.comando && !p.capo);
        $('#richieste').replaceChildren(
            crea('h4', { class: 'etichetta richieste-titolo' }, 'Chiedono il comando'),
            richieste.length
                ? crea('ul', { class: 'richieste-lista' }, ...richieste.map((sid) => crea('li', { class: 'persona' },
                    crea('span', { class: 'persona-nome' }, nomeDi(sid)),
                    crea('span', { class: 'azioni-riga' },
                        crea('button', { type: 'button', class: 'targhetta piccola', onclick: () => invia('comando:approva', sid) }, 'Dai il comando'),
                        crea('button', { type: 'button', class: 'pulsante piccolo', onclick: () => invia('comando:rifiuta', sid) }, 'No')))))
                : crea('p', { class: 'aiuto' }, 'Nessuna richiesta.'),
            crea('h4', { class: 'etichetta richieste-titolo' }, 'Hanno il comando'),
            conComando.length
                ? crea('ul', { class: 'richieste-lista' }, ...conComando.map((p) => crea('li', { class: 'persona' },
                    crea('span', { class: 'persona-nome' }, p.nome),
                    crea('button', { type: 'button', class: 'pulsante piccolo pericolo', onclick: () => invia('comando:revoca', p.sid) }, 'Togli il comando'))))
                : crea('p', { class: 'aiuto' }, app.sessione?.principale ? 'Oltre agli ufficiali, nessuno.' : 'Oltre a chi ha aperto la sessione e agli ufficiali, nessuno.'),
        );
    }
    $('#gruppo-azzera').hidden = !puoAzzerare();
}

function disegnaCollegati() {
    // Una riga per persona, anche se è collegata da più schede o dispositivi.
    const persone = new Map();
    for (const p of app.presenze.persone) {
        const gia = persone.get(p.id);
        if (gia) {
            gia.volte++;
            gia.comando ||= p.comando;
        } else {
            persone.set(p.id, { ...p, volte: 1 });
        }
    }
    const ordinate = [...persone.values()].sort((a, b) => Number(b.capo) - Number(a.capo) || a.nome.localeCompare(b.nome));
    const creatore = app.sessione?.creatoreId;
    $('#collegati').replaceChildren(...ordinate.map((p) => crea('li', { class: 'persona' },
        crea('span', { class: 'persona-nome' }, p.nome, p.id === app.utente.id ? ' (tu)' : '', p.volte > 1 ? ` ×${p.volte}` : ''),
        crea('span', { class: `cartellino${eUfficiale(p.ruolo) ? ' oro' : ''}` }, NOMI_RUOLI[p.ruolo] || p.ruolo),
        p.id === creatore ? crea('span', { class: 'cartellino oro' }, 'Ha aperto la sessione') : null,
        p.comando && !p.capo ? crea('span', { class: 'cartellino oro' }, 'Comando') : null)));
    $('#conta-collegati').textContent = `(${persone.size})`;
}

function aggiungiRegistro(riga) {
    const lista = $('#registro');
    lista.querySelector('.vuoto-registro')?.remove();
    const giu = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 8;
    lista.append(crea('li', {}, crea('time', {}, ora(riga.ora)), riga.testo));
    while (lista.children.length > 200) lista.firstElementChild.remove();
    if (giu) lista.scrollTop = lista.scrollHeight;
}

function salvaMissione() {
    const s = app.stato;
    if (!Object.keys(s.squadre).length && !Object.keys(s.poi).length && !disegni.getLayers().length) {
        avviso('La mappa è vuota: schiera qualcosa o disegna prima di salvare.');
        return;
    }
    const missione = { ...s, disegni: disegni.getLayers().length ? disegni.toGeoJSON(1) : null };
    const blob = new Blob([JSON.stringify(missione, null, 2)], { type: 'application/json' });
    const d = new Date();
    const due = (n) => String(n).padStart(2, '0');
    const a = crea('a', { href: URL.createObjectURL(blob), download: `Missione_LSE_${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}_${due(d.getHours())}-${due(d.getMinutes())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    avviso('File della missione scaricato.', { tipo: 'ok' });
}

async function caricaMissione(file) {
    if (!file || !app.comando) return;
    let dati;
    try {
        dati = JSON.parse(await file.text());
    } catch {
        avviso('Questo file non si legge: non è una missione salvata dalla mappa.', { tipo: 'errore' });
        return;
    }
    const ok = await conferma({ titolo: 'Caricare la missione?', testo: `«${file.name}» prende il posto di tutto quello che c'è ora sulla mappa, per tutti.`, si: 'Carica' });
    if (ok) invia('missione:carica', dati);
}

export function avviaPannelloMissione() {
    $('#chiedi-comando').addEventListener('click', chiediComando);
    $('#lascia-comando').addEventListener('click', () => invia('comando:lascia'));
    $('#salva-missione').addEventListener('click', salvaMissione);
    $('#carica-missione').addEventListener('click', () => $('#file-missione').click());
    $('#file-missione').addEventListener('change', (e) => {
        caricaMissione(e.target.files[0]);
        e.target.value = '';
    });
    $('#azzera-mappa').addEventListener('click', async () => {
        const ok = await conferma({ titolo: 'Azzerare la mappa?', testo: 'Tutte le icone e tutti i disegni di questa sessione spariscono per tutti. La mappa resta. Salva prima la missione se ti serve.', si: 'Azzera', pericolo: true });
        if (ok) invia('missione:azzera');
    });
    $('#cambia-sessione').addEventListener('click', () => apriScelta());
    $('#chiudi-sessione').addEventListener('click', () => chiudiSessione(app.sessione));
    if (app.dentroIlSito) $('#esci').hidden = true;

    on('utente', () => {
        const ruolo = NOMI_RUOLI[app.utente.ruolo] || app.utente.ruolo;
        $('#account-frase').textContent = app.dentroIlSito
            ? `Sei entrato dal sito LSE come ${app.utente.nome} (${ruolo}). Per uscire, esci dal sito.`
            : `Sei entrato come ${app.utente.nome} (${ruolo}).`;
    });
    on('registro:tutto', (righe) => {
        $('#registro').replaceChildren(...(righe.length ? [] : [crea('li', { class: 'vuoto-registro' }, 'Ancora niente.')]));
        for (const r of righe) aggiungiRegistro(r);
    });
    on('registro', aggiungiRegistro);
    on('presenze', () => {
        disegnaComando();
        disegnaCollegati();
    });
    on('comando', disegnaComando);
    on('sessione', () => {
        disegnaSessione();
        disegnaComando();
    });
    on('sessioni', disegnaSessione);
    on('pannello:aperto', (nome) => {
        if (nome !== 'missione') return;
        const lista = $('#registro');
        lista.scrollTop = lista.scrollHeight;
    });
}
