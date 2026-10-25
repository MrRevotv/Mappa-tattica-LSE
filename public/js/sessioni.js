// L'elenco delle sessioni, uguale per la mappa e per il bounty: nome, chi l'ha aperta, chi c'è dentro, quando si
// cancella da sola. Ogni riga ha «Entra» e, per chi l'ha creata (o un ufficiale), il cestino.
import { crea, icona, avviso, conferma, chiediTesto } from './ui.js';

const ORA = 60 * 60 * 1000;
const GIORNO = 24 * ORA;

function traQuanto(quando) {
    const manca = quando - Date.now();
    if (manca >= 36 * ORA) return `tra ${Math.round(manca / GIORNO)} giorni`;
    if (manca >= 20 * ORA) return 'tra un giorno';
    if (manca >= 2 * ORA) return `tra ${Math.round(manca / ORA)} ore`;
    return 'tra poco';
}

export const puoChiudere = (s, utente, ufficiale) => !s.principale && (s.creatoreId === utente.id || ufficiale);

// Le righe sotto il nome: chi l'ha aperta, chi c'è dentro (o quando si cancella). Nella mappa stanno su una riga
// sola separate da «·», nel bounty una sotto l'altra (lo decide il CSS).
function dettagli(s) {
    const parti = [crea('span', {}, s.principale ? 'La sessione di tutti' : `Aperta da ${s.creatore || 'qualcuno'}`)];
    if (s.dentro) {
        const altri = s.dentro - s.nomi.length;
        parti.push(crea('span', { class: 'dentro' }, `Dentro ora: ${s.nomi.join(', ')}${altri > 0 ? ` e altri ${altri}` : ''}`));
    } else {
        parti.push(crea('span', {}, 'Nessuno dentro'));
        if (s.scade) parti.push(crea('span', {}, `Si cancella da sola ${traQuanto(s.scade)}`));
    }
    return parti;
}

export function rigaSessione(s, { attuale = false, mia = false, chiudibile = false, entra, chiudi }) {
    return crea('li', { class: `sessione-voce${attuale ? ' attuale' : ''}` },
        crea('div', { class: 'sessione-testi' },
            crea('p', { class: 'sessione-titolo' },
                crea('span', {}, s.nome),
                mia ? crea('span', { class: 'cartellino' }, 'Tua') : null,
                attuale ? crea('span', { class: 'cartellino oro' }, 'Ci sei') : null),
            crea('p', { class: 'sessione-dettagli' }, ...dettagli(s))),
        crea('span', { class: 'azioni-riga' },
            attuale ? null : crea('button', { type: 'button', class: 'targhetta piccola', onclick: () => entra(s) }, 'Entra'),
            chiudibile ? crea('button', {
                type: 'button',
                class: 'pulsante-icona pericolo',
                'aria-label': `Chiudi la sessione ${s.nome}`,
                title: 'Chiudi la sessione',
                onclick: () => chiudi(s),
            }, icona('trash')) : null));
}

// Chiede il nome e la crea; chi la crea ci entra subito. fatto() quando il server ha risposto di sì.
export async function nuovaSessione(socket, { titolo, fatto }) {
    const nome = await chiediTesto({ titolo, etichetta: 'Nome della sessione', si: 'Crea' });
    if (!nome) return;
    socket.emit('sessione:crea', { nome }, (risposta) => {
        if (risposta?.errore) avviso(risposta.errore, { tipo: 'errore' });
        else fatto?.();
    });
}

// Restituisce true se l'ha chiusa.
export async function chiudiSessione(socket, s, testo) {
    const ok = await conferma({ titolo: `Chiudere «${s.nome}»?`, testo, si: 'Chiudi la sessione', pericolo: true });
    if (ok) socket.emit('sessione:chiudi', s.id);
    return ok;
}
