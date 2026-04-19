// ============================================================================
// ENTITIES MANAGER - Gestione Marker, Squadre, Selezioni e Orbita
// ============================================================================

// Variabili Globali delle Entità
let markerSquadre = {};
let markerPOI = {};
let datiSquadre = {};
let elementiSelezionati = [];
let dragOffsets = {};
let datiPOI = {};

// ============================================================================
// 1. CREAZIONE E RENDERING MARKER
// ============================================================================

window.creaElemento = (icona, tipoInutile) => {
    // 1. Disattiva strumenti di disegno se attivi
    if (typeof matitaAttiva !== 'undefined' && matitaAttiva && typeof toggleMatita === 'function') {
        toggleMatita();
    }

    // 2. Controllo permessi (se sei l'admin/autorizzato)
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;

    const center = map.getCenter();
    const id = 'ent_' + Date.now();

    // --- LOGICA DI DISTINZIONE ---
    // Controlliamo il percorso: se contiene "icone amiche" è una squadra vera,
    // altrimenti (es. cartella "generali") è un semplice POI/Segnalino.
    const isSquadra = icona.includes('icone amiche');
    const tipoDefinitivo = isSquadra ? 'squadra' : 'poi';

    const dati = {
        id: id,
        tipo: tipoDefinitivo,
        lat: center.lat,
        lng: center.lng,
        icona: icona,
        percorsoIcona: icona,
        cerchioAttivo: false,
        // Chiede il nome SOLO se è una squadra
        nome: isSquadra ? (prompt("Inserisci Nome Unità Operativa:") || "Unità Ignota") : '',
        // Crea l'oggetto roster SOLO se è una squadra
        roster: isSquadra ? { capo: '', vice: '', membri: '' } : null
    };

    // --- CORREZIONE FONDAMENTALE ---
    // Registriamo i dati in datiSquadre SOLO se è una squadra.
    // Poiché la sidebar legge datiSquadre per mostrare gli operatori,
    // escludendo i 'poi' qui, non appariranno più nella sezione operatori.
    if (tipoDefinitivo === 'squadra') {
        datiSquadre[id] = dati;
    } else {
        // Se vuoi tenere traccia dei segnalini senza mostrarli nel roster,
        // puoi salvarli in una variabile separata (es. datiPOI) definita in cima al file.
        if (typeof datiPOI !== 'undefined') datiPOI[id] = dati;
    }

    // Crea il marker fisico sulla mappa (gestito da Leaflet)
    creaMarker(dati);

    // Sincronizza con gli altri utenti tramite socket
    if (typeof socket !== 'undefined') {
        socket.emit('nuovo_elemento', dati);
    }
};

function creaMarker(dati) {
    if (markerSquadre[dati.id] || markerPOI[dati.id]) return;
    if (!dati.hasOwnProperty('cerchioAttivo')) dati.cerchioAttivo = false;

    if (typeof datiSquadre === 'undefined') window.datiSquadre = {};
    if (typeof datiPOI === 'undefined') window.datiPOI = {};

    const coloreEtichetta = dati.colore || (dati.tipo === 'squadra' ? '#00e5ff' : '#ffffff');
    const nomeVisualizzato = dati.nome || '';
    const fazioneAttuale = dati.fazione || (dati.tipo === 'squadra' ? 'amica' : 'nemica');

    let path = dati.icona || dati.percorsoIcona || 'fps';
    let srcFinale = path.startsWith('Icone') ? `${path}.png` : `icone/${path}.png`;

    const htmlIcona = `
        <div class="contenitore-icona" id="icona-${dati.id}">
            <img src="${srcFinale}" class="immagine-custom" onerror="this.src='Mappe/avvio.png'">
            <div class="etichetta-nome" id="etichetta-${dati.id}" style="color: ${coloreEtichetta};">${nomeVisualizzato}</div>
        </div>`;

    const grandezzaIcona = 65;
    const iconConfig = L.divIcon({
        html: htmlIcona,
        className: 'wrapper-icona custom-div-icon',
        iconSize: [grandezzaIcona, grandezzaIcona],
        iconAnchor: [grandezzaIcona / 2, grandezzaIcona / 2],
        popupAnchor: [0, - (grandezzaIcona / 2)]
    });

    const m = L.marker([dati.lat, dati.lng], {
        icon: iconConfig,
        draggable: typeof possiedoComando !== 'undefined' ? possiedoComando : false
    }).addTo(map);

    m.datiId = dati.id;
    m.datiTipo = dati.tipo;

    if (dati.tipo === 'squadra') {
        markerSquadre[dati.id] = m;
        datiSquadre[dati.id] = dati;
        if (typeof aggiornaSidebar === 'function') aggiornaSidebar();
    } else {
        markerPOI[dati.id] = m;
        datiPOI[dati.id] = dati;
    }

    function gestisciToggleCerchio(marker) {
        if (marker.cerchioAssociato) {
            if (map.hasLayer(marker.cerchioAssociato)) map.removeLayer(marker.cerchioAssociato);
            marker.cerchioAssociato = null;
        } else {
            let raggioAdattivo = (grandezzaIcona / 2) + 12;
            let coloreRadar = (fazioneAttuale === 'nemica') ? '#ff4444' : '#00e5ff';

            marker.cerchioAssociato = L.circleMarker(marker.getLatLng(), {
                color: coloreRadar,
                weight: 3,
                fillOpacity: 0.15,
                radius: raggioAdattivo,
                interactive: false
            }).addTo(map);
        }
    }

    const puoComandare = (typeof possiedoComando !== 'undefined' && possiedoComando);
    const solaLettura = puoComandare ? "" : "disabled";

    const coloriMatita = ['#ffffff', '#ff4444', '#00e5ff', '#00ff00', '#ffeb3b', '#ff8c00', '#9c27b0'];
    let paletteHTML = `<div class="palette-colori-box" style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">`;
    coloriMatita.forEach(col => {
        const clickAzione = puoComandare ? `onclick="window.inviaColoreSquadra('${dati.id}', '${col}')"` : "";
        paletteHTML += `<div class="color-swatch" style="background-color: ${col}; width:22px; height:22px; border:1px solid #555; border-radius:3px; cursor:pointer;" ${clickAzione}></div>`;
    });
    paletteHTML += `</div>`;

    // --- COSTRUZIONE POPUP INTELLIGENTE ---
    let popupContent = `<div class="squadra-popup">
        <h3 style="margin-top:0; color:#ff8c00;">${dati.tipo === 'squadra' ? 'Opzioni Squadra' : 'Opzioni Target'}</h3>`;

    if (dati.tipo === 'squadra') {
        // La tua funzione originale per le squadre
        popupContent += (typeof generaMenuIcona === 'function' ? generaMenuIcona(dati.id, dati) : '');
    } else {
        // Menu per i POI che usa le TUE funzioni originali
        popupContent += `
            <label style="display:block; margin-bottom:5px;">Identificativo Target:</label>
            <input id="nome-popup-${dati.id}" value="${nomeVisualizzato}" 
                oninput="salvaNomeSquadra('${dati.id}')" 
                style="width:100%; margin-bottom:10px; padding:5px;" ${solaLettura}>
            
            <label style="display:block; margin-bottom:5px;">Fazione (IFF):</label>
            <div style="display:flex; gap:5px; margin-bottom:10px;">
                <button onclick="cambiaFazione('${dati.id}', 'amica')" 
                    style="flex:1; padding:5px; background:${fazioneAttuale === 'amica' ? '#00e5ff' : '#444'}; color:white; border:none; cursor:pointer; font-weight:bold; border-radius:3px;">AMICA</button>
                <button onclick="cambiaFazione('${dati.id}', 'nemica')" 
                    style="flex:1; padding:5px; background:${fazioneAttuale === 'nemica' ? '#ff4444' : '#444'}; color:white; border:none; cursor:pointer; font-weight:bold; border-radius:3px;">NEMICA</button>
            </div>
        `;
    }

    popupContent += `
        <hr style="border-color:#444;">
        <label style="font-size:12px; display:block; margin-bottom:5px;">Colore Etichetta Nome:</label>
        ${paletteHTML}
    `;

    if (dati.tipo === 'squadra') {
        popupContent += `
            <hr style="border-color:#444;">
            <label>Capo:</label>
            <input id="c_${dati.id}" value="${dati.roster?.capo || ''}" oninput="salvaRoster('${dati.id}', 'popup')" ${solaLettura}>
            <label>Vice:</label>
            <input id="v_${dati.id}" value="${dati.roster?.vice || ''}" oninput="salvaRoster('${dati.id}', 'popup')" ${solaLettura}>
            <label>Membri:</label>
            <textarea id="m_${dati.id}" oninput="salvaRoster('${dati.id}', 'popup')" ${solaLettura}>${dati.roster?.membri || ''}</textarea>
            ${puoComandare ? `<button onclick="window.parcheggiaInOrbita('${dati.id}')" style="background:#ff8c00; color:white; width:100%; margin-top:10px; font-weight:bold; border:none; padding:10px; border-radius:3px; cursor:pointer;">🚀 Manda in Orbita</button>` : ''}
        `;
    }

    popupContent += `</div>`;
    m.bindPopup(popupContent);

    m.on('popupopen', () => {
        const inputNome = document.getElementById(`nome-popup-${dati.id}`);
        if (inputNome) inputNome.value = dati.nome || '';
        const selectFazione = document.getElementById(`fazione_${dati.id}`);
        if (selectFazione) selectFazione.value = dati.fazione || (dati.tipo === 'squadra' ? 'amica' : 'nemica');

        if (dati.tipo === 'squadra') {
            if (document.getElementById(`c_${dati.id}`)) document.getElementById(`c_${dati.id}`).value = datiSquadre[dati.id]?.roster?.capo || '';
            if (document.getElementById(`v_${dati.id}`)) document.getElementById(`v_${dati.id}`).value = datiSquadre[dati.id]?.roster?.vice || '';
            if (document.getElementById(`m_${dati.id}`)) document.getElementById(`m_${dati.id}`).value = datiSquadre[dati.id]?.roster?.membri || '';
        }
    });

    m.on('mousedown', (e) => {
        if (typeof matitaAttiva !== 'undefined' && matitaAttiva && typeof toggleMatita === 'function') toggleMatita();
        if (e.originalEvent.button === 1) {
            e.originalEvent.preventDefault();
            m.closePopup();
            toggleSelezione(dati.id, dati.tipo);
        }
    });

    m.on('contextmenu', (e) => {
        if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
        e.originalEvent.preventDefault();
        gestisciToggleCerchio(m);
        dati.cerchioAttivo = !!m.cerchioAssociato;
        if (typeof socket !== 'undefined') socket.emit('toggle_cerchio_tattico', { id: dati.id, tipo: dati.tipo, stato: dati.cerchioAttivo });
    });

    m.on('dragstart', () => {
        if (typeof matitaAttiva !== 'undefined' && matitaAttiva && typeof toggleMatita === 'function') toggleMatita();
        dragOffsets = {};
        if (elementiSelezionati.some(el => el.id === dati.id)) {
            elementiSelezionati.forEach(el => {
                const trgt = el.tipo === 'squadra' ? markerSquadre[el.id] : markerPOI[el.id];
                if (trgt) dragOffsets[el.id] = { dLat: trgt.getLatLng().lat - m.getLatLng().lat, dLng: trgt.getLatLng().lng - m.getLatLng().lng };
            });
        }
    });

    m.on('drag', () => {
        if (m.cerchioAssociato) m.cerchioAssociato.setLatLng(m.getLatLng());
        if (elementiSelezionati.some(el => el.id === dati.id)) {
            elementiSelezionati.forEach(el => {
                if (el.id !== dati.id) {
                    const trgt = el.tipo === 'squadra' ? markerSquadre[el.id] : markerPOI[el.id];
                    if (trgt) {
                        const nuovaPos = [m.getLatLng().lat + dragOffsets[el.id].dLat, m.getLatLng().lng + dragOffsets[el.id].dLng];
                        trgt.setLatLng(nuovaPos);
                        if (trgt.cerchioAssociato) trgt.cerchioAssociato.setLatLng(nuovaPos);
                    }
                }
            });
        }
    });

    m.on('dragend', () => {
        const finale = m.getLatLng();
        dati.lat = finale.lat;
        dati.lng = finale.lng;
        if (typeof socket !== 'undefined') {
            if (elementiSelezionati.some(el => el.id === dati.id)) {
                elementiSelezionati.forEach(el => {
                    const trgt = el.tipo === 'squadra' ? markerSquadre[el.id] : markerPOI[el.id];
                    if (trgt) socket.emit('aggiorna_posizione', { id: el.id, tipo: el.tipo, lat: trgt.getLatLng().lat, lng: trgt.getLatLng().lng });
                });
            } else {
                socket.emit('aggiorna_posizione', { id: dati.id, tipo: dati.tipo, lat: finale.lat, lng: finale.lng });
            }
        }
    });

    m.on('remove', function () {
        if (m.cerchioAssociato && map.hasLayer(m.cerchioAssociato)) map.removeLayer(m.cerchioAssociato);
    });

    if (dati.cerchioAttivo) gestisciToggleCerchio(m);
}
// ============================================================================
// 2. SELEZIONE E INTERAZIONE
// ============================================================================

window.toggleSelezione = (id, tipo) => {
    const m = tipo === 'squadra' ? markerSquadre[id] : markerPOI[id];
    if (!m) return;
    const index = elementiSelezionati.findIndex(el => el.id === id);
    if (index !== -1) {
        elementiSelezionati.splice(index, 1);
        m.getElement().querySelector('.contenitore-icona').classList.remove('squadra-selezionata');
    } else {
        elementiSelezionati.push({ id, tipo });
        m.getElement().querySelector('.contenitore-icona').classList.add('squadra-selezionata');
    }
};

window.selezionaElementoUnico = (id, tipo) => {
    deselezionaTutti();
    toggleSelezione(id, tipo);
};

window.deselezionaTutti = () => {
    elementiSelezionati.forEach(el => {
        const m = el.tipo === 'squadra' ? markerSquadre[el.id] : markerPOI[el.id];
        if (m && m.getElement()) {
            let iconContainer = m.getElement().querySelector('.contenitore-icona');
            if (iconContainer) iconContainer.classList.remove('squadra-selezionata');
        }
    });
    elementiSelezionati = [];
};

window.eliminaElemento = (id, tipo) => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
    if (confirm("Sei sicuro di voler eliminare questo elemento?")) {
        if (typeof socket !== 'undefined') socket.emit('elimina_elemento', { id: id, tipo: tipo });
    }
};

// ============================================================================
// 3. MENU POPUP E MODIFICHE ICONE
// ============================================================================

window.generaMenuIcona = (id, dati) => {
    let path = dati.icona || dati.percorsoIcona || "";
    let isGeneral = path.includes('general');

    // Controllo permessi
    const puoModificare = (typeof possiedoComando !== 'undefined' && possiedoComando);
    const disabilitato = puoModificare ? "" : "disabled";

    let html = `
        <label style="color:#aaa; font-size:10px; display:block; margin-bottom:2px;">NOME UNITÀ:</label>
        <input type="text" id="nome-popup-${id}" 
            value="${dati.nome || ''}" 
            placeholder="es. Alpha" 
            oninput="salvaNomeSquadra('${id}', 'popup')"
            ${disabilitato}
            style="width: 100%; margin-bottom: 10px; background: #2b2b2b; color: #ff8c00; border: 1px solid #555; padding: 6px; border-radius: 3px; font-weight:bold; font-size:13px;">`;

    if (!isGeneral && puoModificare) { // Mostra i tasti fazione SOLO se può modificare
        html += `
        <div style="margin-bottom: 10px; display:flex; gap: 5px; justify-content: space-between;">
            <button class="btn-amica" onclick="cambiaFazione('${id}', 'amica')" 
                style="flex:1; background:#1b5e20; color:#44ff44; border:1px solid #44ff44; padding:8px; font-size:10px; border-radius:3px;">AMICA</button>
            <button class="btn-nemica" onclick="cambiaFazione('${id}', 'nemica')" 
                style="flex:1; background:#7f1d1d; color:#ff4444; border:1px solid #ff4444; padding:8px; font-size:10px; border-radius:3px;">NEMICA</button>
        </div>`;
    }

    return html;
};

window.salvaModificheIcona = (id) => {
    let dati = datiSquadre[id];
    if (dati) {
        let inputNome = document.getElementById(`nome-${id}`);
        if (inputNome) dati.nome = inputNome.value;

        // Aggiorna l'HTML visivo senza ricaricare l'icona
        const m = markerSquadre[id];
        if (m && m.getElement()) {
            let label = m.getElement().querySelector('.etichetta-nome');
            if (label) label.innerText = dati.nome;
        }

        if (typeof socket !== 'undefined') socket.emit('aggiorna_stato_icona', dati);
        if (typeof aggiornaSidebar === 'function') aggiornaSidebar();
    }
};

window.cambiaFazione = (id, fazione) => {
    // 1. Recupera i dati corretti (Squadra o POI)
    let dati = datiSquadre[id] || datiPOI[id];
    let marker = markerSquadre[id] || markerPOI[id];

    if (dati && marker) {
        // --- SALVATAGGIO STATO E POSIZIONE ---
        const posizioneAttuale = marker.getLatLng();
        dati.lat = posizioneAttuale.lat;
        dati.lng = posizioneAttuale.lng;
        dati.fazione = fazione;

        let percorsoOriginale = dati.percorsoIcona || dati.icona;

        if (dati.tipo === 'squadra') {
            // --- TUA LOGICA ORIGINALE SQUADRE (Invariata) ---
            let parti = percorsoOriginale.split('/');
            if (fazione === 'nemica') {
                if (parti[2]) parti[2] = "icone nemiche";
                if (parti[3] && !parti[3].includes('_ENEMY')) parti[3] = parti[3] + "_ENEMY";
                if (parti[4] && !parti[4].includes('-enemy')) parti[4] = parti[4] + "-enemy";
            } else {
                if (parti[2]) parti[2] = "icone amiche";
                if (parti[3]) parti[3] = parti[3].replace('_ENEMY', '');
                if (parti[4]) parti[4] = parti[4].replace('-enemy', '');
            }
            dati.icona = parti.join('/');
            dati.percorsoIcona = dati.icona;
        } 
        else if (dati.tipo === 'poi') {
            // --- LOGICA SPECIFICA PER POI (Icone Star Citizen) ---
            let nuovoPath = percorsoOriginale;

            if (fazione === 'nemica') {
                // 1. Scambio cartella: da "generali" a "generali nemiche"
                if (nuovoPath.includes('/generali/')) {
                    nuovoPath = nuovoPath.replace('/generali/', '/generali nemiche/');
                }
                // 2. Aggiunta suffisso al nome del file (senza estensione, la mette creaMarker)
                if (!nuovoPath.endsWith('-enemy')) {
                    nuovoPath = nuovoPath + "-enemy";
                }
            } else {
                // 1. Ritorno alla cartella originale
                if (nuovoPath.includes('/generali nemiche/')) {
                    nuovoPath = nuovoPath.replace('/generali nemiche/', '/generali/');
                }
                // 2. Rimozione del suffisso -enemy
                if (nuovoPath.endsWith('-enemy')) {
                    nuovoPath = nuovoPath.replace('-enemy', '');
                }
            }

            dati.icona = nuovoPath;
            dati.percorsoIcona = nuovoPath;
        }

        // --- RESET E RE-SCHIERAMENTO ---
        map.removeLayer(marker);
        if (markerSquadre[id]) delete markerSquadre[id];
        if (markerPOI[id]) delete markerPOI[id];

        // Ricrea il marker (creaMarker aggiungerà .png al percorso modificato)
        creaMarker(dati);

        if (typeof socket !== 'undefined') socket.emit('aggiorna_stato_icona', dati);

        if (typeof MostraNotifica === 'function') {
            const colore = fazione === 'nemica' ? '🔴' : '🔵';
            MostraNotifica(`${colore} Fazione: ${fazione.toUpperCase()}`);
        }
    }
};

window.aggiornaCerchioMarker = (id, tipo, stato) => {
    const m = tipo === 'squadra' ? markerSquadre[id] : markerPOI[id];
    if (m && m.getElement()) {
        const iconaDiv = m.getElement().querySelector('.contenitore-icona');
        if (iconaDiv) {
            if (stato) iconaDiv.classList.add('cerchio-tattico-attivo');
            else iconaDiv.classList.remove('cerchio-tattico-attivo');
        }
    }
};

window.aggiornaPosizioneElemento = (marker) => {
    if (typeof socket === 'undefined') return;
    if (marker.datiId && marker.datiTipo) {
        socket.emit('aggiorna_posizione', { id: marker.datiId, tipo: marker.datiTipo, lat: marker.getLatLng().lat, lng: marker.getLatLng().lng });
    }
};

window.salvaRoster = (id, sorgente) => {
    if (!datiSquadre[id]) return;

    let c, v, m;

    // 1. LEGGE I DATI DALLA SORGENTE DOVE STAI SCRIVENDO
    if (sorgente === 'popup') {
        c = document.getElementById(`c_${id}`)?.value || '';
        v = document.getElementById(`v_${id}`)?.value || '';
        m = document.getElementById(`m_${id}`)?.value || '';

        // AGGIORNA LA SIDEBAR (se esiste ed è visibile)
        let sCapo = document.getElementById(`capo-${id}`);
        let sVice = document.getElementById(`vice-${id}`);
        let sMembri = document.getElementById(`membri-${id}`);

        if (sCapo) sCapo.value = c;
        if (sVice) sVice.value = v;
        if (sMembri) sMembri.value = m;
    }
    else {
        c = document.getElementById(`capo-${id}`)?.value || '';
        v = document.getElementById(`vice-${id}`)?.value || '';
        m = document.getElementById(`membri-${id}`)?.value || '';

        // AGGIORNA IL POPUP (se è aperto sulla mappa)
        let pCapo = document.getElementById(`c_${id}`);
        let pVice = document.getElementById(`v_${id}`);
        let pMembri = document.getElementById(`m_${id}`);

        if (pCapo) pCapo.value = c;
        if (pVice) pVice.value = v;
        if (pMembri) pMembri.value = m;
    }

    // 2. AGGIORNA IL DATABASE GLOBALE
    datiSquadre[id].roster = { capo: c, vice: v, membri: m };

    // 3. SINCRONIZZA VIA SOCKET
    if (typeof socket !== 'undefined') {
        socket.emit('aggiorna_roster', { id: id, roster: datiSquadre[id].roster });
    }
};

// AGGANCIO GLOBALE PER I POPUP
// Questo è vitale: rende le funzioni visibili agli onclick dell'HTML
window.cambiaFazione = window.cambiaFazione || cambiaFazione;
window.eliminaElemento = window.eliminaElemento || eliminaElemento;

window.salvaNomeSquadra = (id) => {
    // 1. Recupera l'input dal popup
    const input = document.getElementById(`nome-popup-${id}`);
    if (!input) return;
    const nuovoNome = input.value;

    // 2. Cerca i dati (prova prima nelle squadre, poi nei POI)
    let dati = datiSquadre[id] || datiPOI[id];

    if (dati) {
        // Aggiorna la memoria locale
        dati.nome = nuovoNome;

        // 3. Aggiorna visivamente l'etichetta sulla mappa
        const etichetta = document.getElementById(`etichetta-${id}`);
        if (etichetta) {
            etichetta.innerText = nuovoNome;
        }

        // 4. Comunica al server (usa l'evento originale che hai nel progetto)
        if (typeof socket !== 'undefined') {
            socket.emit('rinomina_entita', {
                id: id,
                nome: nuovoNome,
                tipo: dati.tipo
            });
        }
    }
};

// 1. Questa funzione viene chiamata da chi preme il tasto o dal socket
window.aggiungiUnitaInOrbitaUI = (id) => {
    const dati = datiSquadre[id];
    if (!dati) return;

    const container = document.getElementById('orbita-container');
    if (document.getElementById(`parked-row-${id}`)) return; // Evita duplicati

    // Creazione della riga (UI)
    const row = document.createElement('div');
    row.id = `parked-row-${id}`;
    row.className = 'icona-parcheggiata-row';

    const unitSection = document.createElement('div');
    unitSection.className = 'orbita-unit-section';
    unitSection.title = "Clicca sull'icona per rischierare in campo";

    const img = document.createElement('img');
    let path = dati.icona || dati.percorsoIcona || 'fps';
    img.src = path.startsWith('Icone') ? `${path}.png` : `icone/${path}.png`;
    img.style.width = "40px";

    const label = document.createElement('div');
    label.className = 'etichetta-nome-orbita';
    label.innerText = dati.nome || 'Unità';

    unitSection.appendChild(img);
    unitSection.appendChild(label);

    const noteSection = document.createElement('div');
    noteSection.className = 'orbita-note-section';
    const textarea = document.createElement('textarea');
    textarea.className = 'orbita-note-textarea';
    textarea.placeholder = "Note missione / Tasking...";
    noteSection.appendChild(textarea);

    row.appendChild(unitSection);
    row.appendChild(noteSection);

    // LOGICA DI RIENTRO CORRETTA
    unitSection.onclick = () => {
        if (typeof possiedoComando !== 'undefined' && !possiedoComando) {
            return;
        }
        const centro = map.getCenter();
        const marker = markerSquadre[id]; // Recuperiamo il marker

        // --- 1. Ripristino Locale (Ciò che mancava) ---
        if (marker) {
            marker.addTo(map);
            marker.setLatLng(centro);
            marker.setOpacity(1);
            if (marker.dragging) marker.dragging.enable();

            // Effetto Pulsazione HUD
            const iconElement = marker.getElement()?.querySelector('.contenitore-icona');
            if (iconElement) {
                iconElement.classList.add('pulsazione-rientro');
                setTimeout(() => iconElement.classList.remove('pulsazione-rientro'), 3000);
            }

            if (dati.cerchioAttivo && marker.cerchioAssociato) {
                marker.cerchioAssociato.addTo(map).setLatLng(centro);
            }
        }

        row.remove(); // Pulizia sidebar

        // Aggiorna dati locali
        dati.lat = centro.lat;
        dati.lng = centro.lng;

        // --- 2. Sincronizzazione Server ---
        if (typeof socket !== 'undefined') {
            socket.emit('sync_stato_orbita', {
                id: id, inOrbita: false, lat: centro.lat, lng: centro.lng
            });
            socket.emit('aggiorna_posizione', {
                id: id, tipo: dati.tipo, lat: centro.lat, lng: centro.lng
            });
        }
    };

    container.appendChild(row);
};

// 2. Questa è la funzione che "lancia" il comando per parcheggiare
window.parcheggiaInOrbita = (id) => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
    const marker = markerSquadre[id];
    if (!marker) return;

    // Apertura automatica sidebar
    const sidebar = document.getElementById('sidebar-orbita');
    if (sidebar && sidebar.classList.contains('nascosto')) {
        sidebar.classList.remove('nascosto');
    }

    // Eseguiamo l'azione localmente (Rimuoviamo dalla mappa)
    marker.closePopup();
    map.removeLayer(marker);
    if (marker.cerchioAssociato && map.hasLayer(marker.cerchioAssociato)) {
        map.removeLayer(marker.cerchioAssociato);
    }

    // Creiamo la UI nella sidebar
    window.aggiungiUnitaInOrbitaUI(id);

    // Comunichiamo a tutti di fare lo stesso
    if (typeof socket !== 'undefined') {
        socket.emit('sync_stato_orbita', { id: id, inOrbita: true });
    }
};

window.eliminaSelezionati = () => {
    // 1. Controllo se c'è qualcosa da eliminare
    if (elementiSelezionati.length === 0) {
        if (typeof possiedoComando !== 'undefined' && !possiedoComando)
            alert("Seleziona prima le icone che vuoi eliminare usando il TASTO CENTRALE del mouse (rotellina)!");
        return;
    }

    // 2. Conferma di sicurezza
    const numero = elementiSelezionati.length;
    if (confirm(`Confermi di voler eliminare definitivamente queste ${numero} entità dal campo di battaglia?`)) {

        // Creiamo una copia della lista per non avere problemi mentre la cicliamo
        const listaDaRimuovere = [...elementiSelezionati];

        listaDaRimuovere.forEach(el => {
            if (typeof socket !== 'undefined') {
                // Inviamo il comando al server per ogni elemento
                socket.emit('elimina_elemento', { id: el.id, tipo: el.tipo });
                console.log(`Sistema: Eliminazione inviata per ${el.id}`);
            }
        });

        // 3. Pulizia finale: deselezioniamo tutto per svuotare la lista gialla
        deselezionaTutti();

        if (typeof MostraNotifica === 'function') {
            MostraNotifica(`${numero} elementi eliminati.`);
        }
    }
};