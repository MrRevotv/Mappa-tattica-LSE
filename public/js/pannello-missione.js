// Pannello "Missione": comando e richieste, chi è collegato, salva e carica il file della missione,
// azzera la mappa, registro degli ufficiali, come si usa, uscita.
import { app, invia, on, eUfficiale, NOMI_RUOLI } from './stato.js';
import { $, crea, avviso, conferma } from './ui.js';
import { chiediComando } from './comando.js';
import { disegni } from './disegno.js';

const ora = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function nomeDi(sid) {
    return app.presenze.persone.find((p) => p.sid === sid)?.nome || 'Qualcuno';
}

function puoAzzerare() {
    return eUfficiale() || (app.comando && !app.presenze.persone.some((p) => eUfficiale(p.ruolo)));
}

function disegnaComando() {
    const ufficiale = eUfficiale();
    let frase;
    if (ufficiale) frase = 'Sei un ufficiale: hai sempre il comando e decidi chi altro può modificare la mappa.';
    else if (app.comando) frase = 'Hai il comando: puoi modificare la mappa per tutti.';
    else if (app.richiestaInviata) frase = 'Richiesta inviata: aspetta che un ufficiale ti dia il comando.';
    else frase = 'Stai guardando: per modificare la mappa chiedi il comando a un ufficiale.';
    $('#comando-frase').textContent = frase;
    $('#chiedi-comando').hidden = ufficiale || app.comando || app.richiestaInviata;
    $('#lascia-comando').hidden = ufficiale || !app.comando;

    if (ufficiale) {
        const richieste = app.presenze.richieste;
        const conComando = app.presenze.persone.filter((p) => p.comando && !eUfficiale(p.ruolo));
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
                : crea('p', { class: 'aiuto' }, 'Oltre agli ufficiali, nessuno.'),
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
    const ordinate = [...persone.values()].sort((a, b) => Number(eUfficiale(b.ruolo)) - Number(eUfficiale(a.ruolo)) || a.nome.localeCompare(b.nome));
    $('#collegati').replaceChildren(...ordinate.map((p) => crea('li', { class: 'persona' },
        crea('span', { class: 'persona-nome' }, p.nome, p.id === app.utente.id ? ' (tu)' : '', p.volte > 1 ? ` ×${p.volte}` : ''),
        crea('span', { class: `cartellino${eUfficiale(p.ruolo) ? ' oro' : ''}` }, NOMI_RUOLI[p.ruolo] || p.ruolo),
        p.comando && !eUfficiale(p.ruolo) ? crea('span', { class: 'cartellino oro' }, 'Comando') : null)));
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
        const ok = await conferma({ titolo: 'Azzerare la mappa?', testo: 'Tutte le icone e tutti i disegni spariscono per tutti. Mappa e bounty restano. Salva prima la missione se ti serve.', si: 'Azzera', pericolo: true });
        if (ok) invia('missione:azzera');
    });
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
    on('pannello:aperto', (nome) => {
        if (nome !== 'missione') return;
        const lista = $('#registro');
        lista.scrollTop = lista.scrollHeight;
    });
}
