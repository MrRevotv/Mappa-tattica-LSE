// Aiutanti per l'interfaccia: creare elementi, avvisi in basso, finestre di conferma.

export const $ = (selettore, dentro = document) => dentro.querySelector(selettore);
export const $$ = (selettore, dentro = document) => [...dentro.querySelectorAll(selettore)];

// crea('button', { class: 'pulsante', onclick: fn }, 'Testo', altroElemento)
export function crea(tag, attributi = {}, ...figli) {
    const el = document.createElement(tag);
    for (const [chiave, valore] of Object.entries(attributi)) {
        if (valore === false || valore == null) continue;
        if (chiave.startsWith('on')) el.addEventListener(chiave.slice(2), valore);
        else if (chiave === 'class') el.className = valore;
        else if (chiave === 'dataset') Object.assign(el.dataset, valore);
        else if (chiave === 'style') for (const [p, v] of Object.entries(valore)) el.style.setProperty(p, v);
        else if (valore === true) el.setAttribute(chiave, '');
        else el.setAttribute(chiave, valore);
    }
    for (const figlio of figli.flat()) {
        if (figlio == null || figlio === false) continue;
        el.append(figlio instanceof Node ? figlio : document.createTextNode(String(figlio)));
    }
    return el;
}

export function icona(nome) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    uso.setAttribute('href', `icone-ui.svg#${nome}`);
    svg.append(uso);
    return svg;
}

// Avviso che sparisce da solo. tipo: "ok", "errore" o niente.
export function avviso(testo, { tipo = '', durata = 4500, azione } = {}) {
    const contenitore = $('#avvisi');
    const el = crea('div', { class: `avviso ${tipo}`, role: tipo === 'errore' ? 'alert' : 'status' }, crea('span', {}, testo));
    if (azione) el.append(crea('button', { type: 'button', class: 'pulsante piccolo', onclick: () => { azione.fai(); togli(); } }, azione.testo));
    contenitore.append(el);
    while (contenitore.children.length > 3) contenitore.firstElementChild.remove();
    let timer = setTimeout(togli, durata);
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', () => { timer = setTimeout(togli, 1500); });
    function togli() {
        el.classList.add('esce');
        setTimeout(() => el.remove(), 220);
    }
}

// Finestra di conferma. Restituisce true se si conferma.
export function conferma({ titolo, testo = '', si = 'Conferma', no = 'Annulla', pericolo = false }) {
    return apriDialogo({ titolo, testo, si, no, pericolo }).then((r) => r !== null);
}

// Finestra con una casella di testo. Restituisce il testo scritto o null.
export function chiediTesto({ titolo, etichetta, valore = '', si = 'Fatto' }) {
    return apriDialogo({ titolo, etichetta, valore, si, campo: true }).then((r) => (r === null ? null : r.trim() || null));
}

function apriDialogo({ titolo, testo = '', etichetta = '', valore = '', si, no = 'Annulla', pericolo = false, campo = false }) {
    const dialogo = $('#dialogo');
    const input = $('#dialogo-input');
    $('#dialogo-titolo').textContent = titolo;
    $('#dialogo-testo').textContent = testo;
    $('#dialogo-testo').hidden = !testo;
    $('#dialogo-campo').hidden = !campo;
    $('#dialogo-etichetta').textContent = etichetta;
    $('#dialogo-si').textContent = si;
    $('#dialogo-no').textContent = no;
    dialogo.classList.toggle('pericolo', pericolo);
    input.value = valore;
    dialogo.returnValue = '';
    dialogo.showModal();
    if (campo) input.focus();
    else $(pericolo ? '#dialogo-no' : '#dialogo-si').focus();
    return new Promise((risolvi) => {
        dialogo.addEventListener('close', () => {
            risolvi(dialogo.returnValue === 'si' ? (campo ? input.value : '') : null);
        }, { once: true });
    });
}

// Chiama fn dopo una pausa di "attesa" ms; .subito() la esegue adesso se c'era una chiamata in sospeso.
export function rimanda(fn, attesa) {
    let timer = null;
    let sospesi = null;
    const esegui = () => {
        const argomenti = sospesi;
        clearTimeout(timer);
        timer = null;
        sospesi = null;
        fn(...argomenti);
    };
    const rimandata = (...argomenti) => {
        sospesi = argomenti;
        clearTimeout(timer);
        timer = setTimeout(esegui, attesa);
    };
    rimandata.subito = () => { if (sospesi) esegui(); };
    return rimandata;
}

export function alPiuOgni(fn, intervallo) {
    let ultimo = 0;
    let timer;
    return (...argomenti) => {
        const adesso = Date.now();
        clearTimeout(timer);
        if (adesso - ultimo >= intervallo) {
            ultimo = adesso;
            fn(...argomenti);
        } else {
            timer = setTimeout(() => { ultimo = Date.now(); fn(...argomenti); }, intervallo - (adesso - ultimo));
        }
    };
}

// Aggiorna il valore di un campo solo se non ci sta scrivendo nessuno.
export function metti(campo, valore) {
    if (campo && document.activeElement !== campo && campo.value !== valore) campo.value = valore;
}

export const eTelefono = () => window.matchMedia('(max-width: 47.99rem)').matches;
