// js/bounty_sync.js

function toggleBounty() {
    const w = document.getElementById('bounty-wrapper');
    w.classList.toggle('nascosto');
}

// --- GENERAZIONE RIGHE ---

function addMatRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input class="mat-name" type="text" onchange="triggerBountySync()"></td>
        <td><input class="mat-qty" type="number" min="0" onchange="triggerBountySync()"></td>
        <td><input class="mat-price" type="number" min="0" onchange="triggerBountySync()"></td>
        <td><button class="row-del-btn" onclick="this.parentElement.parentElement.remove(); triggerBountySync()">X</button></td>
    `;
    document.querySelector('#materialiTable tbody').appendChild(tr);
}

function addPayRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input class="pay-name" type="text" onchange="triggerBountySync()"></td>
        <td><input class="pay-delta" type="number" value="0" onchange="triggerBountySync()"></td>
        <td><input class="pay-amt" type="text" readonly style="border:none; text-align:right; color:#ff8c00; font-weight:bold;"></td>
        <td><button class="row-del-btn" onclick="this.parentElement.parentElement.remove(); triggerBountySync()">X</button></td>
    `;
    document.querySelector('#pagamentiTable tbody').appendChild(tr);
}

function addCostRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input class="sp-desc" type="text" onchange="triggerBountySync()"></td>
        <td><input class="sp-amt" type="number" min="0" onchange="triggerBountySync()"></td>
        <td><input class="sp-name" type="text" onchange="triggerBountySync()"></td>
        <td><button class="row-del-btn" onclick="this.parentElement.parentElement.remove(); triggerBountySync()">X</button></td>
    `;
    document.querySelector('#speseFisseTable tbody').appendChild(tr);
}

// --- CALCOLO (Puramente visivo, non invia dati) ---
function eseguiCalcoloBounty() {
    const asInt = v => Math.round(v);
    
    // 1. Lordo
    let lordo = 0;
    document.querySelectorAll('.mat-price').forEach(i => lordo += +i.value || 0);
    document.getElementById('ricavoLordo').innerText = lordo.toLocaleString('it-IT');

    // 2. Spese Fisse
    let spTot = 0, spPer = {};
    document.querySelectorAll('#speseFisseTable tbody tr').forEach(r => {
        const v = +r.querySelector('.sp-amt').value || 0;
        const n = r.querySelector('.sp-name').value.trim();
        spTot += v;
        if (n) spPer[n] = (spPer[n] || 0) + v;
    });

    const postSpese = lordo - spTot;

    // 3. Commissioni
    const bankPct = +document.getElementById('bankCommission').value || 0;
    const orgPct = +document.getElementById('orgCommission').value || 0;
    const givPct = +document.getElementById('giverCommission').value || 0;
    const selPct = +document.getElementById('sellerCommission').value || 0;

    const bankFee = asInt(postSpese * bankPct / 100);
    const basePostBank = postSpese - bankFee;

    const givFee = asInt(basePostBank * givPct / 100);
    const selFee = asInt(basePostBank * selPct / 100);
    const orgFee = asInt(basePostBank * orgPct / 100);

    document.getElementById('bankAmount').innerText = bankFee.toLocaleString('it-IT');
    document.getElementById('orgAmount').innerText = orgFee.toLocaleString('it-IT');
    document.getElementById('giverAmount').innerText = givFee.toLocaleString('it-IT');
    document.getElementById('sellerAmount').innerText = selFee.toLocaleString('it-IT');

    // 4. Netto
    const pool = basePostBank - givFee - selFee - orgFee;
    document.getElementById('profittoNetto').innerText = pool.toLocaleString('it-IT');

    // 5. Quote
    const rows = Array.from(document.querySelectorAll('#pagamentiTable tbody tr')).filter(r => r.querySelector('.pay-name').value.trim());
    const pesi = rows.map(r => 1 + (+r.querySelector('.pay-delta').value || 0) / 100);
    const sommaPesi = pesi.reduce((a, b) => a + b, 0) || 1;
    const quotaBase = pool / sommaPesi;

    const nG = document.getElementById('giverName').value.trim();
    const nS = document.getElementById('sellerName').value.trim();
    const nT = document.getElementById('treasurerName').value.trim();

    rows.forEach((r, idx) => {
        const nm = r.querySelector('.pay-name').value.trim();
        let imp = quotaBase * pesi[idx];

        if (nm === nG) imp += givFee;
        if (nm === nS) imp += selFee;
        if (nm === nT) imp += orgFee;
        imp += spPer[nm] || 0;

        r.querySelector('.pay-amt').value = asInt(imp).toLocaleString('it-IT') + ' UEC';
    });
}

// --- SINCRONIZZAZIONE: Dal DOM al JSON ---
function estraiDatiBounty() {
    return {
        materiali: Array.from(document.querySelectorAll('#materialiTable tbody tr')).map(r => ({
            name: r.querySelector('.mat-name').value,
            qty: r.querySelector('.mat-qty').value,
            price: r.querySelector('.mat-price').value
        })),
        pagamenti: Array.from(document.querySelectorAll('#pagamentiTable tbody tr')).map(r => ({
            name: r.querySelector('.pay-name').value,
            delta: r.querySelector('.pay-delta').value
        })),
        spese: Array.from(document.querySelectorAll('#speseFisseTable tbody tr')).map(r => ({
            desc: r.querySelector('.sp-desc').value,
            amt: r.querySelector('.sp-amt').value,
            name: r.querySelector('.sp-name').value
        })),
        config: {
            bank: document.getElementById('bankCommission').value,
            org: document.getElementById('orgCommission').value,
            giverPct: document.getElementById('giverCommission').value,
            giverName: document.getElementById('giverName').value,
            sellerPct: document.getElementById('sellerCommission').value,
            sellerName: document.getElementById('sellerName').value,
            treasName: document.getElementById('treasurerName').value
        }
    };
}

// Chiamata quando chi ha il comando modifica un valore
window.triggerBountySync = () => {
    if (!window.possiedoComando) return;
    eseguiCalcoloBounty(); // Aggiorna i calcoli visivi
    const dati = estraiDatiBounty();
    if (typeof socket !== 'undefined') socket.emit('sync_bounty', dati);
};

// --- RICEZIONE: Dal JSON al DOM ---
window.applicaDatiBounty = (dati) => {
    if (!dati) return;
    
    // Pulisci Tabelle
    document.querySelector('#materialiTable tbody').innerHTML = '';
    document.querySelector('#pagamentiTable tbody').innerHTML = '';
    document.querySelector('#speseFisseTable tbody').innerHTML = '';

    // Ricostruisci
    dati.materiali.forEach(m => { addMatRow(); const r = document.querySelector('#materialiTable tbody tr:last-child'); r.querySelector('.mat-name').value = m.name; r.querySelector('.mat-qty').value = m.qty; r.querySelector('.mat-price').value = m.price; });
    dati.pagamenti.forEach(p => { addPayRow(); const r = document.querySelector('#pagamentiTable tbody tr:last-child'); r.querySelector('.pay-name').value = p.name; r.querySelector('.pay-delta').value = p.delta; });
    dati.spese.forEach(s => { addCostRow(); const r = document.querySelector('#speseFisseTable tbody tr:last-child'); r.querySelector('.sp-desc').value = s.desc; r.querySelector('.sp-amt').value = s.amt; r.querySelector('.sp-name').value = s.name; });

    // Config
    if(dati.config.bank !== undefined) document.getElementById('bankCommission').value = dati.config.bank;
    if(dati.config.org !== undefined) document.getElementById('orgCommission').value = dati.config.org;
    if(dati.config.giverPct !== undefined) document.getElementById('giverCommission').value = dati.config.giverPct;
    if(dati.config.giverName !== undefined) document.getElementById('giverName').value = dati.config.giverName;
    if(dati.config.sellerPct !== undefined) document.getElementById('sellerCommission').value = dati.config.sellerPct;
    if(dati.config.sellerName !== undefined) document.getElementById('sellerName').value = dati.config.sellerName;
    if(dati.config.treasName !== undefined) document.getElementById('treasurerName').value = dati.config.treasName;

    eseguiCalcoloBounty();
    applicaPermessiBounty(); // Blocca se l'utente è un operatore
};

// --- GESTIONE PERMESSI ---
window.applicaPermessiBounty = () => {
    const haPermessi = window.possiedoComando === true;
    const wrapper = document.getElementById('bounty-wrapper');
    if (!wrapper) return;

    // Disabilita tutti gli input e selezioni
    wrapper.querySelectorAll('input').forEach(i => i.disabled = !haPermessi);
    
    // Nascondi i bottoni "Aggiungi" e le "X" di eliminazione
    wrapper.querySelectorAll('button:not([onclick="toggleBounty()"])').forEach(b => {
        b.style.display = haPermessi ? "inline-block" : "none";
    });

    document.getElementById('bounty-lock-status').innerText = haPermessi ? "(Modalità Scrittura)" : "(Sola Lettura)";
};

// --- RESET ---
window.resetBounty = () => {
    if (!window.possiedoComando || !confirm("Cancellare tutto il calcolatore?")) return;
    document.querySelector('#materialiTable tbody').innerHTML = '';
    document.querySelector('#pagamentiTable tbody').innerHTML = '';
    document.querySelector('#speseFisseTable tbody').innerHTML = '';
    addMatRow(); addPayRow(); addCostRow();
    triggerBountySync();
};