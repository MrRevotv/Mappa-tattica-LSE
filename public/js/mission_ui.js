// ============================================================================
// MISSION UI - Gestione Mappe, Roster e Salvataggi (Preset)
// ============================================================================

window.mappeData = {};
window.possiedoComando = window.possiedoComando || false;

// Il nostro database base per far apparire le tendine
const databaseSC = {
    "Stanton": ["Microtech", "Hurston", "ArcCorp", "Crusader"],
    "Pyro": ["Pyro_I", "Pyro_II", "Pyro_III"],
    "Nyx": ["Delamar"]
};

// ============================================================================
// MOTORE DI RICERCA FUZZY (TOLLERANZA ERRORI) E AUTOCOMPILAZIONE
// ============================================================================

// 1. IL TUO CATALOGO (DA COMPILARE CON I TUOI DATI REALI)
// Riempi questo array con tutte le tue mappe. Il motore leggerà da qui.
window.catalogoMappeGlobale = [
    // ESEMPIO DI STRUTTURA DA INSERIRE:
    // { nome: "Ghost Hollow", idMappa: "ghost_hollow", gioco: "Star Citizen", sistema: "Stanton", pianeta: "MicroTech" },
    // { nome: "Kareah", idMappa: "spk", gioco: "Star Citizen", sistema: "Stanton", pianeta: "Crusader" }
];

// 2. ALGORITMO DI LEVENSHTEIN (Calcola gli errori di battitura)
function calcolaErroriBattitura(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

// 3. LA FUNZIONE DI RICERCA IN TEMPO REALE
window.eseguiRicercaMappa = (testo) => {
    const box = document.getElementById('suggerimenti-mappa');
    if (testo.length < 2) {
        box.style.display = 'none';
        return;
    }

    const query = testo.toLowerCase();
    let risultati = [];

    window.catalogoMappeGlobale.forEach(mappa => {
        const nomeMappa = mappa.nome.toLowerCase();

        // Match perfetto o parziale (es. scrivi "ghost" e trova "Ghost Hollow")
        if (nomeMappa.includes(query)) {
            risultati.push({ ...mappa, punteggio: 0 });
        }
        // Match Fuzzy (Se hai sbagliato 1 o 2 lettere, es. scrivi "Gost Holow")
        else {
            const errori = calcolaErroriBattitura(query, nomeMappa.substring(0, query.length));
            // Tolleriamo massimo 2 errori di battitura
            if (errori <= 2) {
                risultati.push({ ...mappa, punteggio: errori });
            }
        }
    });

    // Ordiniamo i risultati: prima quelli esatti, poi quelli con errori
    risultati.sort((a, b) => a.punteggio - b.punteggio);

    // Costruiamo l'HTML dei suggerimenti
    if (risultati.length > 0) {
        box.innerHTML = risultati.map(r => `
            <div class="suggerimento-item" onclick="applicaMappaDaRicerca('${r.gioco}', '${r.sistema}', '${r.pianeta}', '${r.idMappa}', '${r.nome}')">
                🎯 ${r.nome}
                <span class="suggerimento-path">${r.gioco} > ${r.sistema} > ${r.pianeta}</span>
            </div>
        `).join('');
        box.style.display = 'block';
    } else {
        box.innerHTML = `<div style="padding:10px; color:#ff4444; font-family:monospace;">❌ Nessun target rilevato...</div>`;
        box.style.display = 'block';
    }
};

// 4. FUNZIONE CHE "PREME I TASTI" PER TE (Con i ritardi per superare le Race Condition)
window.applicaMappaDaRicerca = (gioco, sistema, pianeta, idMappa, nomeMappa) => {
    // 1. Chiudiamo i suggerimenti e puliamo la barra
    document.getElementById('suggerimenti-mappa').style.display = 'none';
    document.getElementById('ricerca-mappa').value = nomeMappa;

    // 2. Avviamo la reazione a catena (Cascata dinamica)
    const elGioco = document.getElementById('filtro-gioco');
    if (elGioco) {
        elGioco.value = gioco;
        elGioco.dispatchEvent(new Event('change'));
    }

    // Usiamo dei piccoli timeout per dare tempo al browser di caricare le tendine successive
    setTimeout(() => {
        const elSistema = document.getElementById('filtro-sistema');
        if (elSistema) {
            elSistema.value = sistema;
            elSistema.dispatchEvent(new Event('change'));
        }

        setTimeout(() => {
            const elPianeta = document.getElementById('filtro-pianeta');
            if (elPianeta) {
                elPianeta.value = pianeta;
                elPianeta.dispatchEvent(new Event('change'));
            }

            setTimeout(() => {
                const elMappa = document.getElementById('tendinaMappe');
                if (elMappa) {
                    elMappa.value = idMappa;
                    elMappa.dispatchEvent(new Event('change'));
                    console.log(`[SISTEMA] Rotta autocompilata per: ${nomeMappa}`);
                }
            }, 300); // Ritardo caricamento Mappe
        }, 300); // Ritardo caricamento Pianeti
    }, 300); // Ritardo caricamento Sistemi
};

// Chiude i suggerimenti se clicchi fuori dalla barra
document.addEventListener('click', (e) => {
    if (e.target.id !== 'ricerca-mappa') {
        const box = document.getElementById('suggerimenti-mappa');
        if (box) box.style.display = 'none';
    }
});

// ============================================================================
// SISTEMA DI AUTO-APPRENDIMENTO MAPPE DA UPLOAD
// ============================================================================

window.apprendiMappaDaUpload = (fileInput) => {
    // Verifichiamo che ci sia un file
    if (!fileInput.files || fileInput.files.length === 0) return;

    const nomeFileCompleto = fileInput.files[0].name; // es: "ghost_hollow.png"

    // 1. Pulizia chirurgica del nome
    let idMappa = nomeFileCompleto.split('.').slice(0, -1).join('.'); // Rimuove .png/.jpg -> "ghost_hollow"
    if (!idMappa) idMappa = nomeFileCompleto;

    // Sostituiamo gli underscore/trattini con spazi e mettiamo le Maiuscole
    let nomePulito = idMappa.replace(/[-_]/g, ' '); // "ghost hollow"
    nomePulito = nomePulito.replace(/\b\w/g, char => char.toUpperCase()); // "Ghost Hollow"

    // 2. Leggiamo le coordinate attuali dai menu (il contesto)
    const gioco = document.getElementById('filtro-gioco')?.value || '';
    const sistema = document.getElementById('filtro-sistema')?.value || '';
    const pianeta = document.getElementById('filtro-pianeta')?.value || '';

    // Se non abbiamo almeno un gioco e un pianeta, ignoriamo (non sapremmo dove catalogarla)
    if (!gioco || !pianeta) {
        console.warn("[SISTEMA] Impossibile catalogare: seleziona prima Gioco e Pianeta.");
        return;
    }

    // 3. Creiamo l'oggetto Target
    const nuovoTarget = {
        nome: nomePulito,
        idMappa: idMappa,
        gioco: gioco,
        sistema: sistema,
        pianeta: pianeta
    };

    // 4. Invio al Database Centrale (Server)
    // Non lo salviamo più "a mano" nel browser. Lo spediamo al Server, 
    // che controllerà i cloni, lo scriverà nel file .json e lo rimbalzerà a tutti.
    if (typeof socket !== 'undefined') {
        socket.emit('nuova_mappa_appresa', nuovoTarget);

        // Manteniamo la notifica per darti un feedback visivo immediato
        if (typeof MostraNotifica === 'function') {
            MostraNotifica(`Target inviato al database: ${nuovoTarget.nome}`);
        }
    }
};

// ============================================================================
// 1. STRUTTURA DINAMICA DEI MENU A TENDINA (A Scomparsa)
// ============================================================================

// Funzione di supporto per inviare il cambio menu (da mettere in cima al file o in tools.js)
window.syncDropdownMaster = (elementId, value) => {
    if (window.stoRicevendoSync) return;

    // Permettiamo il valore vuoto SOLO per la tendinaSubMappe per resettarla
    if ((!value || value === "") && elementId !== 'tendinaSubMappe') return;

    if (typeof possiedoComando !== 'undefined' && possiedoComando) {
        if (typeof socket !== 'undefined') {
            console.log(`[MASTER-SEND] Invio sync per ${elementId}: ${value}`);
            socket.emit('sync_zona_operativa', { id: elementId, value: value });
        }
    }
};

window.gestisciGioco = () => {
    const gioco = document.getElementById('filtro-gioco')?.value;
    const selSistema = document.getElementById('filtro-sistema');
    const selPianeta = document.getElementById('filtro-pianeta');
    const selMappe = document.getElementById('tendinaMappe');
    const selSubMappe = document.getElementById('tendinaSubMappe');

    if (selSistema) selSistema.style.display = 'none';
    if (selPianeta) selPianeta.style.display = 'none';
    if (selMappe) selMappe.style.display = 'none';
    if (selSubMappe) selSubMappe.style.display = 'none';

    if (gioco === 'Star_Citizen' && selSistema) {
        selSistema.style.display = 'block';
        selSistema.innerHTML = '<option value="">-- Seleziona Sistema --</option>';
        Object.keys(databaseSC).forEach(sistema => {
            selSistema.innerHTML += `<option value="${sistema}">${sistema}</option>`;
        });
    }

    if (typeof popolaIcone === 'function') popolaIcone(gioco);

    // --- SINCRONIZZAZIONE ---
    window.syncDropdownMaster('filtro-gioco', gioco);
};

window.gestisciSistema = () => {
    const sistema = document.getElementById('filtro-sistema')?.value;
    const selPianeta = document.getElementById('filtro-pianeta');
    const selMappe = document.getElementById('tendinaMappe');
    const selSubMappe = document.getElementById('tendinaSubMappe');

    if (selPianeta) selPianeta.style.display = 'none';
    if (selMappe) selMappe.style.display = 'none';
    if (selSubMappe) selSubMappe.style.display = 'none';

    if (sistema && databaseSC[sistema] && selPianeta) {
        selPianeta.style.display = 'block';
        selPianeta.innerHTML = '<option value="">-- Seleziona Pianeta --</option>';
        databaseSC[sistema].forEach(pianeta => {
            selPianeta.innerHTML += `<option value="${pianeta}">${pianeta}</option>`;
        });
    }

    // --- SINCRONIZZAZIONE ---
    window.syncDropdownMaster('filtro-sistema', sistema);
};

window.gestisciPianeta = () => {
    const pianeta = document.getElementById('filtro-pianeta')?.value;
    const selMappe = document.getElementById('tendinaMappe');
    const selSubMappe = document.getElementById('tendinaSubMappe');

    if (selSubMappe) selSubMappe.style.display = 'none';

    if (pianeta && selMappe) {
        selMappe.style.display = 'block';
        if (typeof caricaListaMappe === 'function') caricaListaMappe();
    }

    // --- SINCRONIZZAZIONE ---
    window.syncDropdownMaster('filtro-pianeta', pianeta);
};

window.gestisciMappa = (autoCambiaSfondo = true) => {
    const locationName = document.getElementById('tendinaMappe')?.value;
    const selSubMappe = document.getElementById('tendinaSubMappe');

    if (selSubMappe) selSubMappe.innerHTML = '<option value="">-- Seleziona Sottomappa --</option>';

    const gioco = document.getElementById('filtro-gioco')?.value;
    const sistema = document.getElementById('filtro-sistema')?.value;
    const pianeta = document.getElementById('filtro-pianeta')?.value;

    if (locationName && window.mappeData[locationName]) {
        const datiLocation = window.mappeData[locationName];
        let baseURL = `Mappe/${gioco}/${sistema}/${pianeta}/${locationName}`;

        if (datiLocation.master.length > 0 && autoCambiaSfondo) {
            let masterUrl = `${baseURL}/mappa_master/${datiLocation.master[0]}`;
            if (typeof cambiaMappa === 'function') cambiaMappa(masterUrl);
        }

        if (datiLocation.submaps.length > 0 && selSubMappe) {
            selSubMappe.style.display = 'block';
            datiLocation.submaps.forEach(file => {
                let opt = document.createElement('option');
                opt.value = `${baseURL}/${file}`;
                opt.innerText = file.replace(/\.[^/.]+$/, "").replace(/_/g, ' ').toUpperCase();
                selSubMappe.appendChild(opt);
            });
        } else if (selSubMappe) {
            selSubMappe.style.display = 'none';
        }
    } else if (selSubMappe) {
        selSubMappe.style.display = 'none';
    }

    // --- SINCRONIZZAZIONE ---
    // Sincronizziamo solo se è un cambio manuale (autoCambiaSfondo = true)
    if (autoCambiaSfondo) {
        window.syncDropdownMaster('tendinaMappe', locationName);
    }
};

window.gestisciSubMappa = () => {
    if (window.stoRicevendoSync) return;

    const selSub = document.getElementById('tendinaSubMappe');
    const urlSottomappa = selSub?.value;
    const locationName = document.getElementById('tendinaMappe')?.value;

    if (urlSottomappa && urlSottomappa !== "") {
        // Caso A: Selezionata una sottomappa reale
        if (typeof cambiaMappa === 'function') cambiaMappa(urlSottomappa);
        window.syncDropdownMaster('tendinaSubMappe', urlSottomappa);
    } else {
        // Caso B: Deselezionata la sottomappa (scelto "-- Seleziona...")
        console.log("[UI] Sottomappa rimossa, ritorno alla mappa master.");

        if (locationName && window.mappeData[locationName]) {
            const dati = window.mappeData[locationName];
            const gioco = document.getElementById('filtro-gioco')?.value;
            const sistema = document.getElementById('filtro-sistema')?.value;
            const pianeta = document.getElementById('filtro-pianeta')?.value;

            // Ricostruiamo l'URL della master
            const masterUrl = `Mappe/${gioco}/${sistema}/${pianeta}/${locationName}/mappa_master/${dati.master[0]}`;

            if (typeof cambiaMappa === 'function') cambiaMappa(masterUrl);

            // Forza l'invio della sincronizzazione anche se il valore è vuoto
            // Usiamo un flag speciale o chiamiamo direttamente il socket per bypassare il filtro
            if (typeof socket !== 'undefined') {
                socket.emit('sync_zona_operativa', { id: 'tendinaSubMappe', value: "" });
            }
        }
    }
};

window.applicaPermessiMappe = () => {
    const haPermessi = (window.possiedoComando === true);
    const èUfficiale = (window.mioRuolo === 'admin' || window.mioRuolo === 'responsabile');

    // --- 1. Menu a tendina ---
    const ids = ['filtro-gioco', 'filtro-sistema', 'filtro-pianeta', 'tendinaMappe', 'tendinaSubMappe'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !haPermessi;
            el.style.filter = haPermessi ? "none" : "brightness(0.6)";
        }
    });

    // --- 2. Palette Icone ---
    const paletteIcone = document.getElementById('pannello-icone') || document.querySelector('.sidebar-icone');
    if (paletteIcone) {
        paletteIcone.style.display = haPermessi ? "block" : "none";
    }

    // --- 3. Toolbar Disegno ---
    const toolbar = document.querySelector('.leaflet-draw-toolbar');
    if (toolbar) {
        toolbar.style.display = haPermessi ? "block" : "none";
    }

    // --- 4. TASTI DATABASE MAPPE (Solo Ufficiali) ---
    const btnMaster = document.querySelector('button[onclick*="fileMappaMaster"]');
    const btnSub = document.querySelector('button[onclick*="fileSottomappa"]');
    const btnElimina = document.querySelector('button[onclick*="eliminaMappaCorrente"]');

    const tastiCritici = [btnMaster, btnSub, btnElimina];
    tastiCritici.forEach(btn => {
        if (btn) {
            // Questi li vedono solo Admin e Responsabili
            btn.style.display = èUfficiale ? "inline-block" : "none";
        }
    });

    // --- 5. TASTI MISSIONE JSON (Gerarchia Dinamica) ---

    // A. CARICA MISSIONE: Lo vede chi ha il "Comando" (Ufficiali o Operatori autorizzati)
    const btnCaricaJSON = document.querySelector('button[onclick*="caricaSnapshot"]') || document.getElementById('btn-carica-json');
    if (btnCaricaJSON) {
        btnCaricaJSON.style.display = haPermessi ? "inline-block" : "none";
    }

    // B. SCARICA MISSIONE: Lo vedono TUTTI, in qualsiasi momento
    const btnScaricaJSON = document.querySelector('button[onclick*="scaricaMissione"]') || document.querySelector('button[onclick*="richiedi_download_missione"]') || document.getElementById('btn-scarica-json');
    if (btnScaricaJSON) {
        btnScaricaJSON.style.display = "inline-block"; // Nessun blocco, sempre visibile
    }

    // --- 6. Bounty ---
    if (typeof window.applicaPermessiBounty === 'function') window.applicaPermessiBounty();
};

// ============================================================================
// 2. CARICAMENTO MAPPE DAL SERVER (FUNZIONI ASINCRONE CORRETTE)
// ============================================================================

window.caricaListaMappe = async () => {
    try {
        const gioco = document.getElementById('filtro-gioco')?.value;
        const sistema = document.getElementById('filtro-sistema')?.value;
        const pianeta = document.getElementById('filtro-pianeta')?.value;

        if (!gioco || !sistema || !pianeta) return;

        const timestamp = new Date().getTime();
        const url = `/api/lista-mappe?gioco=${gioco}&sistema=${sistema}&pianeta=${pianeta}&t=${timestamp}`;

        const res = await fetch(url);

        if (res.ok) {
            window.mappeData = await res.json();
            console.log("[MAPPE] Dati aggiornati:", window.mappeData);

            // 1. Ricostruisce i nomi nel menu a tendina
            if (typeof renderizzaTendinaMappe === 'function') {
                renderizzaTendinaMappe();
            }

            // 2. FONDAMENTALE: Chiediamo a gestisciMappa di aggiornare i menu 
            // (senza cambiare lo sfondo, passiamo false) per far apparire le sub-mappe
            if (typeof gestisciMappa === 'function') {
                gestisciMappa(false);
            }
        }
    } catch (e) {
        console.error("Errore nel caricamento della lista mappe:", e);
    }
};

// ============================================================================
// 2.1 FUNZIONE MANCANTE: SCRIVE I DATI RICEVUTI NEL MENU A TENDINA
// ============================================================================

window.renderizzaTendinaMappe = () => {
    const t = document.getElementById('tendinaMappe');
    if (!t) return;

    // Salviamo cosa era selezionato per non perderlo se ricarichiamo i dati
    const selezionePrecedente = t.value;

    // Puliamo la tendina e mettiamo l'opzione di default
    t.innerHTML = '<option value="">-- Seleziona Mappa Principale --</option>';

    // Cicliamo su window.mappeData (che ora contiene bueno_ravine)
    for (let nomeMappa in window.mappeData) {
        let opt = document.createElement('option');
        opt.value = nomeMappa;

        // Puliamo il nome per renderlo leggibile (bueno_ravine -> BUENO RAVINE)
        opt.innerText = nomeMappa.replace(/_/g, ' ').toUpperCase();
        t.appendChild(opt);
    }

    // Se la mappa che avevamo prima esiste ancora nei nuovi dati, la re-impostiamo
    if (selezionePrecedente && window.mappeData[selezionePrecedente]) {
        t.value = selezionePrecedente;
    }
};

// ============================================================================
// 3. COMANDI MAPPA ED UPLOAD (FUNZIONI ASINCRONE CORRETTE)
// ============================================================================

window.cambiaMappa = (url) => {
    if (!url) return;
    
    // Invece di mandare solo l'url, creiamo il "pacchetto" con anche i bounds globali
    if (typeof socket !== 'undefined') {
        socket.emit('richiedi_cambio_mappa', { url: url, bounds: bounds });
    }
};

window.uploadMappa = async (tipo) => {
    const inputId = tipo === 'master' ? 'fileMappaMaster' : 'fileSottomappa';
    const fileInput = document.getElementById(inputId);

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

    const gioco = document.getElementById('filtro-gioco').value;
    const sistema = document.getElementById('filtro-sistema').value;
    const pianeta = document.getElementById('filtro-pianeta').value;
    const mappaSelezionata = document.getElementById('tendinaMappe').value;
    const nomeFileOriginale = fileInput.files[0].name;

    if (!gioco || !sistema || !pianeta) {
        alert("⚠️ Seleziona Gioco, Sistema e Pianeta prima di caricare.");
        fileInput.value = ""; return;
    }

    if (tipo === 'submap' && !mappaSelezionata) {
        alert("⚠️ Per caricare una sottomappa, devi prima selezionare la Mappa Principale a cui appartiene!");
        fileInput.value = ""; return;
    }

    const formData = new FormData();
    formData.append('gioco', gioco);
    formData.append('sistema', sistema);
    formData.append('pianeta', pianeta);
    formData.append('tipo', tipo);
    formData.append('cartellaDestinazione', mappaSelezionata);
    formData.append('mappa', fileInput.files[0]);

    if (typeof MostraNotifica === 'function') MostraNotifica("⏳ Upload in corso...");

    try {
        const res = await fetch('/api/upload-mappa', { method: 'POST', body: formData });
        if (res.ok) {
            if (typeof MostraNotifica === 'function') MostraNotifica("✅ Caricamento completato!");

            // Grazie alla nostra nuova memoria, questa funzione aggiorna i dati 
            // ma mantiene selezionata la mappa principale!
            await window.caricaListaMappe();

            const fileNamePulito = nomeFileOriginale.replace(/\s+/g, '_');
            let baseURL = `Mappe/${gioco}/${sistema}/${pianeta}`;

            if (tipo === 'master') {
                const locationName = nomeFileOriginale.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_');
                const tMappe = document.getElementById('tendinaMappe');
                if (tMappe) {
                    tMappe.value = locationName;
                    gestisciMappa(true); // Cambia anche lo sfondo
                }
            } else if (tipo === 'submap') {
                // Imposta la tendina della submappa sul nuovo file appena caricato
                const tSub = document.getElementById('tendinaSubMappe');
                if (tSub) {
                    const subUrl = `${baseURL}/${mappaSelezionata}/${fileNamePulito}`;
                    tSub.value = subUrl;
                    if (typeof cambiaMappa === 'function') cambiaMappa(subUrl); // Mostra la nuova sottomappa
                }
            }
        } else {
            alert("Errore durante l'upload sul server.");
        }
    } catch (err) {
        console.error("Errore di rete durante upload:", err);
    }
    fileInput.value = "";
};

window.eliminaMappaCorrente = async () => {
    const tendinaSub = document.getElementById('tendinaSubMappe');
    const tendinaMaster = document.getElementById('tendinaMappe');
    let mappaDaEliminare = "";
    let tipoEliminazione = "";
    let masterUrlDiRitorno = "";

    // Analizza cosa si sta cercando di eliminare e salva il "punto di ritorno"
    if (tendinaSub && tendinaSub.style.display === 'block' && tendinaSub.value !== "") {
        mappaDaEliminare = tendinaSub.value;
        tipoEliminazione = "submap";

        // Calcola l'URL della mappa master per tornarci dopo l'eliminazione
        const location = tendinaMaster.value;
        const gioco = document.getElementById('filtro-gioco').value;
        const sistema = document.getElementById('filtro-sistema').value;
        const pianeta = document.getElementById('filtro-pianeta').value;
        masterUrlDiRitorno = `Mappe/${gioco}/${sistema}/${pianeta}/${location}/mappa_master/${window.mappeData[location].master[0]}`;

    } else if (tendinaMaster && tendinaMaster.value !== "") {
        const location = tendinaMaster.value;
        if (window.mappeData[location] && window.mappeData[location].master.length > 0) {
            const gioco = document.getElementById('filtro-gioco').value;
            const sistema = document.getElementById('filtro-sistema').value;
            const pianeta = document.getElementById('filtro-pianeta').value;
            mappaDaEliminare = `Mappe/${gioco}/${sistema}/${pianeta}/${location}/mappa_master/${window.mappeData[location].master[0]}`;
            tipoEliminazione = "master";
        }
    }

    if (!mappaDaEliminare) {
        alert("⚠️ Seleziona una mappa o sottomappa da eliminare.");
        return;
    }

    if (!confirm("⚠️ ATTENZIONE ☢️ Vuoi davvero eliminare fisicamente questo file dal server?\nL'operazione non è reversibile!")) return;

    if (typeof MostraNotifica === 'function') MostraNotifica("🗑️ Eliminazione in corso...");

    try {
        const res = await fetch('/api/elimina-mappa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ percorso: mappaDaEliminare })
        });

        if (res.ok) {
            if (typeof MostraNotifica === 'function') MostraNotifica("✅ Mappa eliminata dal server!");

            // --- INIZIO AGGIORNAMENTO DATABASE RICERCA ---
            // Estraiamo il nome del file pulito (es. da "Mappe/.../ghost_hollow.png" ricaviamo "ghost_hollow")
            const nomeFile = mappaDaEliminare.split('/').pop();
            const idMappaDaRimuovere = nomeFile.split('.').slice(0, -1).join('.');

            // Inviamo il comando al server per radere al suolo il record dal file .json
            if (typeof socket !== 'undefined') {
                socket.emit('elimina_mappa_dal_catalogo', idMappaDaRimuovere);
                console.log(`[SISTEMA] Pulizia database ricerca completata per: ${idMappaDaRimuovere}`);
            }
            // --- FINE AGGIORNAMENTO DATABASE RICERCA ---

            if (tipoEliminazione === "master") {
                // Svuota la memoria forzatamente, altrimenti tenderebbe a ricaricarla
                if (tendinaMaster) tendinaMaster.value = "";
                await window.caricaListaMappe();
                gestisciMappa(false);
                // Torna all'immagine di avvio
                if (typeof cambiaMappa === 'function') cambiaMappa("Mappe/avvio.png");

            } else if (tipoEliminazione === "submap") {
                // Ricarica la lista per far sparire il file eliminato, ma mantieni selezionato il Master
                await window.caricaListaMappe();
                if (tendinaSub) tendinaSub.value = ""; // Deseleziona la sottomappa morta
                // Torna alla visuale principale del Master
                if (typeof cambiaMappa === 'function') cambiaMappa(masterUrlDiRitorno);
            }
        } else {
            alert("Errore durante l'eliminazione sul server.");
        }
    } catch (err) {
        console.error("Errore durante eliminazione:", err);
    }
};

// Aggiungiamo l'evento "cambio" alla tendina delle sottomappe
document.getElementById('tendinaSubMappe').addEventListener('change', function () {
    const urlSottomappa = this.value;
    if (urlSottomappa) {
        console.log("[UI] Invio sincronizzazione sottomappa...");
        // 1. Diciamo agli altri di cambiare lo sfondo
        if (typeof cambiaMappa === 'function') cambiaMappa(urlSottomappa);

        // 2. Diciamo agli altri di allineare il menu a tendina
        window.syncDropdownMaster('tendinaSubMappe', urlSottomappa);
    }
});

// ============================================================================
// 4. SALVATAGGIO E CARICAMENTO MISSIONI
// ============================================================================

window.salvaPreset = () => {
    if (typeof markerSquadre === 'undefined' || typeof markerPOI === 'undefined') return;
    if (Object.keys(markerSquadre).length === 0 && Object.keys(markerPOI).length === 0) {
        alert("Errore: Impossibile salvare un preset vuoto. Schiera delle unità o dei POI prima di salvare.");
        return;
    }

    if (typeof socket !== 'undefined') {
        socket.emit('richiedi_download_missione');
        if (typeof MostraNotifica === 'function') MostraNotifica("Generazione file missione in corso...");
    }
};

window.triggerLoadMission = () => {
    document.getElementById('file-upload-missione').click();
};

window.loadMission = (e) => {
    if (!e.target.files[0]) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (typeof socket !== 'undefined') socket.emit('carica_snapshot', data);
        } catch (err) {
            alert("Errore: File missione non valido o corrotto.");
        }
    };
    reader.readAsText(e.target.files[0]);

    // --- LA SOLUZIONE MAGICA ---
    // Resetta fisicamente il valore dell'input nascosto. 
    // In questo modo, il browser "dimentica" il file e ti permetterà 
    // di ricaricare lo stesso identico file quante volte vuoi!
    e.target.value = '';
};

// ============================================================================
// 5. GESTIONE ROSTER NELLA SIDEBAR
// ============================================================================

window.aggiornaSidebar = () => {
    const c = document.getElementById('lista-operatori');
    if (!c) return;
    c.innerHTML = '';

    const pc = (typeof possiedoComando !== 'undefined') ? possiedoComando : false;
    if (typeof datiSquadre === 'undefined') return;

    for (let id in datiSquadre) {
        let squadra = datiSquadre[id];

        // --- FILTRO DI SICUREZZA ---
        // Escludiamo POI e icone nemiche dal roster operativo
        if (squadra.tipo !== 'squadra' || squadra.icona.includes('icone nemiche')) {
            continue;
        }

        let nome = squadra.nome || id;
        let caposquadra = squadra.roster?.capo || '';
        let vice = squadra.roster?.vice || '';
        let membri = squadra.roster?.membri || '';

        let s = document.createElement('div');
        s.className = 'squadra-roster';
        s.innerHTML = `
    <div style="margin-bottom:8px; border-bottom:1px solid #ff8c0033; padding-bottom:5px;">
        <span style="color:#aaa; font-size:10px; display:block; margin-bottom:2px;">NOME UNITÀ:</span>
        <input type="text" id="nome-sidebar-${id}" 
            class="input-roster" 
            style="color:#ff8c00; font-weight:bold; font-size:13px; background:transparent; border:1px solid transparent; width:100%;" 
            value="${nome}" 
            oninput="salvaNomeSquadra('${id}', 'sidebar')" 
            onfocus="this.style.borderColor='#ff8c0055'; this.style.background='#1a1a1a';"
            onblur="this.style.borderColor='transparent'; this.style.background='transparent';"
            ${!pc ? 'disabled' : ''}>
    </div>
    
    <div>
        <span style="color:#aaa; font-size:11px;">Caposquadra:</span> 
        <input type="text" id="capo-${id}" class="input-roster" 
            value="${caposquadra}" 
            oninput="salvaRoster('${id}', 'sidebar')" 
            ${!pc ? 'disabled' : ''}>
    </div>
    
    <div>
        <span style="color:#aaa; font-size:11px;">Vice:</span> 
        <input type="text" id="vice-${id}" class="input-roster" 
            value="${vice}" 
            oninput="salvaRoster('${id}', 'sidebar')" 
            ${!pc ? 'disabled' : ''}>
    </div>
    
    <div>
        <span style="color:#aaa; font-size:11px;">Membri:</span> 
        <input type="text" id="membri-${id}" class="input-roster" 
            value="${membri}" 
            oninput="salvaRoster('${id}', 'sidebar')" 
            placeholder="Separati da virgola" 
            ${!pc ? 'disabled' : ''}>
    </div>
`;
        c.appendChild(s);
    }
};

// ============================================================================
// 6. GESTIONE ICONE SIDEBAR
// ============================================================================

window.popolaIcone = (giocoScelto) => {
    const container = document.getElementById('icone-container');
    if (!container || typeof databaseIcone === 'undefined') return;

    container.innerHTML = '';

    const chiaveDB = giocoScelto === 'Star_Citizen' ? 'sc' : giocoScelto.toLowerCase();
    const setCorrente = databaseIcone[chiaveDB];

    if (!setCorrente) return;

    for (let nomeCategoria in setCorrente.categorie) {
        let listaIcone = setCorrente.categorie[nomeCategoria];

        let titolo = document.createElement('div');
        titolo.className = "sidebar-categoria-titolo"; // Usa la tua classe CSS
        titolo.innerText = nomeCategoria.toUpperCase();
        container.appendChild(titolo);

        let grid = document.createElement('div');
        grid.className = "icone-grid"; // 3 colonne come da tuo CSS

        listaIcone.forEach(icona => {
            let btn = document.createElement('button');
            btn.className = "btn-icona";
            btn.innerText = icona.nome;

            btn.onclick = () => {
                // Passiamo il percorso pulito. 
                // creaElemento deciderà se è squadra o poi guardando la stringa.
                let fullPath = setCorrente.basePath + icona.file;
                fullPath = fullPath.replace('.png', '');

                if (typeof creaElemento === 'function') creaElemento(fullPath);
            };
            grid.appendChild(btn);
        });
        container.appendChild(grid);
    }
};

// ============================================================================
// 7. GESTIONE ICONE AMICHE/NEMICHE
// ============================================================================

window.cambiaFazioneIcona = (idElemento, nuovaFazione) => {
    // 1. Cerchiamo l'elemento e i suoi dati
    const tipo = markerSquadre[idElemento] ? 'squadra' : 'poi';
    const elemento = tipo === 'squadra' ? markerSquadre[idElemento] : markerPOI[idElemento];
    const dati = tipo === 'squadra' ? datiSquadre[idElemento] : datiPOI[idElemento]; // Assicurati di avere datiPOI popolato

    if (!elemento || !dati) return;

    // 2. Aggiorniamo la fazione nei dati locali
    dati.fazione = nuovaFazione;

    // 3. Gestione del percorso immagine (Scambio cartelle)
    // Recuperiamo il percorso attuale cercando l'attributo src nell'HTML dell'icona
    const contenitore = document.getElementById(`icona-${idElemento}`);
    const imgElement = contenitore ? contenitore.querySelector('img') : null;
    let percorsoAttuale = imgElement ? imgElement.src : "";

    // Se il percorso è un URL completo del browser, lo puliamo per lo scambio
    let nuovoPercorso = "";
    if (nuovaFazione === 'nemica') {
        nuovoPercorso = percorsoAttuale.replace("icone amiche", "icone nemiche");
    } else {
        nuovoPercorso = percorsoAttuale.replace("icone nemiche", "icone amiche");
    }

    // 4. RICOSTRUZIONE DIV ICON (Fondamentale per non perdere il nome)
    const coloreAttuale = dati.colore || (tipo === 'squadra' ? '#00e5ff' : '#ffffff');
    const nomeVisualizzato = dati.nome || (tipo === 'squadra' ? 'Unità' : 'Target');

    const nuovoHtml = `
        <div class="contenitore-icona" id="icona-${idElemento}">
            <img src="${nuovoPercorso}" class="immagine-custom" onerror="this.src='Mappe/avvio.png'">
            <div class="etichetta-nome" id="etichetta-${idElemento}" style="color: ${coloreAttuale};">
                ${nomeVisualizzato}
            </div>
        </div>`;

    const grandezzaIcona = 65;
    const nuovaIconConfig = L.divIcon({
        html: nuovoHtml,
        className: 'wrapper-icona custom-div-icon',
        iconSize: [grandezzaIcona, grandezzaIcona],
        iconAnchor: [grandezzaIcona / 2, grandezzaIcona / 2],
        popupAnchor: [0, - (grandezzaIcona / 2)]
    });

    // 5. Applichiamo la nuova icona
    elemento.setIcon(nuovaIconConfig);

    // 6. AGGIORNAMENTO RADAR (Se attivo, cambia colore al volo)
    if (elemento.cerchioAssociato) {
        const coloreRadar = nuovaFazione === 'nemica' ? '#ff4444' : '#00e5ff';
        elemento.cerchioAssociato.setStyle({
            color: coloreRadar,
            fillColor: coloreRadar
        });
    }

    // Funzione per salvare il nome in tempo reale
    window.rinominaEntita = (id, nuovoNome, tipo) => {
        // 1. Aggiorna l'etichetta visibile subito
        const etichetta = document.getElementById(`etichetta-${id}`);
        if (etichetta) etichetta.innerText = nuovoNome;

        // 2. Aggiorna i dati in memoria
        const collezione = tipo === 'squadra' ? datiSquadre : datiPOI;
        if (collezione[id]) collezione[id].nome = nuovoNome;

        // 3. Comunica al server
        if (typeof socket !== 'undefined') {
            socket.emit('rinomina_entita', { id, nome: nuovoNome, tipo });
        }
    };

    // Se non l'hai già fatto, inizializza l'oggetto per i POI a inizio file
    if (typeof datiPOI === 'undefined') window.datiPOI = {};

    // 7. Sincronizzazione Server
    if (typeof socket !== 'undefined') {
        socket.emit('aggiorna_fazione_entita', {
            id: idElemento,
            tipo: tipo,
            fazione: nuovaFazione,
            iconUrl: nuovoPercorso
        });
    }

    if (typeof MostraNotifica === 'function') {
        const iconaNotifica = nuovaFazione === 'nemica' ? '🔴' : '🔵';
        MostraNotifica(`${iconaNotifica} TARGET IDENTIFICATO: ${nuovaFazione.toUpperCase()}`);
    }
};


window.rinominaEntita = function (id, nuovoNome, tipo) {
    // 1. Aggiorna l'oggetto dati locale subito
    const targetDati = (tipo === 'squadra') ? datiSquadre[id] : datiPOI[id];
    if (targetDati) {
        targetDati.nome = nuovoNome;
    }

    // 2. Aggiorna visivamente l'etichetta sulla mappa
    const etichetta = document.getElementById(`etichetta-${id}`);
    if (etichetta) {
        etichetta.innerText = nuovoNome;
    }

    // 3. Spedisce al server
    if (typeof socket !== 'undefined') {
        socket.emit('rinomina_entita', { id: id, nome: nuovoNome, tipo: tipo });
    }
};

window.inviaColoreSquadra = function (id, colore) {
    const etichetta = document.getElementById(`etichetta-${id}`);
    if (etichetta) etichetta.style.color = colore;

    if (datiSquadre[id]) datiSquadre[id].colore = colore;
    if (datiPOI[id]) datiPOI[id].colore = colore;

    if (typeof socket !== 'undefined') {
        socket.emit('cambia_colore_entita', { id: id, colore: colore });
    }
};

// Eseguiamo un controllo iniziale al caricamento
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(applicaPermessiMappe, 1000);
});