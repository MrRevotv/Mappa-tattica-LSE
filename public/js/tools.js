// ============================================================================
// TOOLS.JS - Strumenti Disegno e UI Sidebar
// ============================================================================

let gommaAttiva = false;
let matitaAttiva = false;
let testoAttivo = false;
let coloreMatita = "#ff4444";
let isMousePremutoGomma = false;

// ==========================================================================
// 1. GESTORE CENTRALIZZATO PANNELLI (Supporto Modalità Esclusiva)
// ==========================================================================

window.gestisciAperturaPannello = (idPannelloTarget) => {
    const toggleEsclusivo = document.getElementById('toggle-esclusivo');
    const pannelloTarget = document.getElementById(idPannelloTarget);

    if (!pannelloTarget) return;

    // Se la modalità esclusiva è ATTIVA e stiamo per APRIRE un pannello...
    if (toggleEsclusivo && toggleEsclusivo.checked && pannelloTarget.classList.contains('nascosto')) {

        // Lista di tutti i pannelli laterali del sistema
        const tuttiIPannelli = ['pannello', 'pannello-icone', 'sidebar', 'sidebar-orbita', 'terminal-wrapper'];

        // Chiudi tutti quelli che non sono il nostro target
        tuttiIPannelli.forEach(id => {
            if (id !== idPannelloTarget) {
                const el = document.getElementById(id);
                if (el && !el.classList.contains('nascosto')) {
                    el.classList.add('nascosto');
                }
            }
        });
    }

    // Infine, apri o chiudi il pannello richiesto
    pannelloTarget.classList.toggle('nascosto');
};

// I comandi della UI re-indirizzati al nuovo gestore intelligente
window.togglePannello = () => window.gestisciAperturaPannello('pannello');
window.toggleIcone = () => window.gestisciAperturaPannello('pannello-icone');
window.toggleRoster = () => window.gestisciAperturaPannello('sidebar');
window.toggleOrbita = () => window.gestisciAperturaPannello('sidebar-orbita');
window.toggleConsole = () => window.gestisciAperturaPannello('terminal-wrapper');


// ============================================================================
// 2. STRUMENTI MAPPA (Matita, Gomma, Testo)
// ============================================================================

window.toggleMatita = () => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
    matitaAttiva = !matitaAttiva;

    if (matitaAttiva) {
        if (gommaAttiva) window.toggleGomma(); // Spegne la gomma
        if (testoAttivo) window.attivaTesto(); // Spegne il testo
        document.getElementById('btn-matita').classList.add('attiva');
        if (typeof map !== 'undefined') map.dragging.disable();
        document.getElementById('map').style.cursor = 'crosshair';
    } else {
        document.getElementById('btn-matita').classList.remove('attiva');
        if (typeof map !== 'undefined') map.dragging.enable();
        document.getElementById('map').style.cursor = '';
    }
};

window.toggleGomma = () => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
    gommaAttiva = !gommaAttiva;

    if (gommaAttiva) {
        if (matitaAttiva) window.toggleMatita(); // Spegne la matita se è accesa
        if (testoAttivo) window.attivaTesto();   // Spegne il testo se è acceso
        document.getElementById('btn-gomma').classList.add('attiva');
        if (typeof map !== 'undefined') map.dragging.disable();
        document.getElementById('map').style.cursor = 'help';
    } else {
        document.getElementById('btn-gomma').classList.remove('attiva');
        if (typeof map !== 'undefined') map.dragging.enable();
        document.getElementById('map').style.cursor = '';
    }
};

window.attivaTesto = () => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
    testoAttivo = !testoAttivo;

    if (testoAttivo) {
        if (matitaAttiva) window.toggleMatita(); // Spegne la matita
        if (gommaAttiva) window.toggleGomma();   // Spegne la gomma
        document.getElementById('btn-testo').classList.add('attiva');
        document.getElementById('map').style.cursor = 'text';
    } else {
        document.getElementById('btn-testo').classList.remove('attiva');
        document.getElementById('map').style.cursor = '';
    }
};

// ============================================================================
// STRUMENTO GLOBALE: GONIOMETRO TATTICO
// ============================================================================

// Variabili globali
window.markerGoniometro = null;
window.angoloGoniometro = 0;

// Funzione globale che genera l'SVG
window.generaSvgGoniometro = () => {
    let svg = `<svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<circle cx="150" cy="150" r="140" fill="rgba(0, 40, 0, 0.2)" stroke="rgba(0, 255, 204, 0.3)" stroke-width="1" />`;

    for (let i = 0; i < 360; i += 10) {
        let isPrincipale = (i % 90 === 0);
        let y1 = 10;
        let y2 = isPrincipale ? 35 : 20;
        let color = (i === 0) ? 'rgba(255, 68, 68, 0.8)' : 'rgba(0, 255, 204, 0.6)';
        let spessore = isPrincipale ? 2.5 : 1;

        svg += `<line x1="150" y1="${y1}" x2="150" y2="${y2}" stroke="${color}" stroke-width="${spessore}" transform="rotate(${i}, 150, 150)" />`;

        if (isPrincipale) {
            svg += `<text x="150" y="55" fill="${color}" font-size="14" font-family="monospace" font-weight="bold" text-anchor="middle" transform="rotate(${i}, 150, 150)">${i}°</text>`;
        }
    }

    svg += `<circle cx="150" cy="150" r="3" fill="#ff4444" />`;
    svg += `<line x1="140" y1="150" x2="160" y2="150" stroke="#ff4444" stroke-width="1.5" />`;
    svg += `<line x1="150" y1="140" x2="150" y2="160" stroke="#ff4444" stroke-width="1.5" />`;
    svg += `</svg>`;

    return svg;
};

// Funzione globale per accendere/spegnere lo strumento
window.toggleGoniometro = () => {
    const btn = document.getElementById('btn-goniometro');

    if (window.markerGoniometro) {
        // Se c'è già, lo spegniamo
        map.removeLayer(window.markerGoniometro);
        window.markerGoniometro = null;
        if (btn) btn.style.background = "#444"; // Colore bottone spento
        return;
    }

    // Se non c'è, lo posizioniamo al centro dello schermo
    const centroMappa = map.getCenter();
    window.angoloGoniometro = 0;

    // Inseriamo le classi CSS al posto dello stile inline
    const goniometroHTML = `
        <div id="goniometro-wrapper" class="goniometro-wrapper" style="transform: rotate(0deg);">
            ${window.generaSvgGoniometro()}
        </div>
    `;

    const iconaGoniometro = L.divIcon({
        className: 'stile-goniometro-trasparente',
        html: goniometroHTML,
        iconSize: [300, 300],
        iconAnchor: [150, 150]
    });

    window.markerGoniometro = L.marker(centroMappa, {
        icon: iconaGoniometro,
        draggable: true,
        zIndexOffset: 2000
    }).addTo(map);

    // Popup pulito che richiama le classi CSS
    const popupContent = `
        <div class="goniometro-popup">
            <span class="titolo">ROTAZIONE</span><br>
            <input type="range" min="0" max="360" value="${window.angoloGoniometro}" 
                   oninput="window.ruotaGoniometro(this.value)">
            <br>
            <span id="label-gradi-popup" class="valore-gradi">${window.angoloGoniometro}°</span>
        </div>
    `;

    window.markerGoniometro.bindPopup(popupContent, { closeButton: false, offset: [0, -20] });

    if (btn) btn.style.background = "#28a745"; // Colore bottone acceso
};

// Funzione globale per la rotazione dinamica
window.ruotaGoniometro = (gradi) => {
    window.angoloGoniometro = gradi;
    const wrapper = document.getElementById('goniometro-wrapper');
    const labelPopup = document.getElementById('label-gradi-popup');

    // Aggiorniamo dinamicamente solo il transform (CSS inline necessario) e il testo
    if (wrapper) wrapper.style.transform = `rotate(${gradi}deg)`;
    if (labelPopup) labelPopup.innerText = `${gradi}°`;
};


window.cambiaColoreMatita = () => {
    const picker = document.getElementById('colore-matita');
    if (picker) coloreMatita = picker.value;
};

// GESTIONE DISEGNO E CANCELLAZIONE (Blindata per PC e Tablet)
window.assegnaEventiDisegno = (layer) => {
    const eseguiCancellazione = function (e) {
        if (typeof gommaAttiva !== 'undefined' && gommaAttiva) {
            if (typeof isUfficiale !== 'undefined' && !isUfficiale) return;
            try {
                if (e && e.originalEvent && typeof e.originalEvent.preventDefault === 'function') {
                    e.originalEvent.preventDefault();
                }
                L.DomEvent.stopPropagation(e);
            } catch (err) { }

            if (typeof drawItems !== 'undefined') drawItems.removeLayer(layer);
            if (typeof socket !== 'undefined') socket.emit('salva_disegni', drawItems.toGeoJSON());
        }
    };

    layer.on('click mousedown touchstart touchend', eseguiCancellazione);

    layer.on('mouseover', function (e) {
        if (typeof gommaAttiva !== 'undefined' && gommaAttiva && typeof isMousePremutoGomma !== 'undefined' && isMousePremutoGomma) {
            eseguiCancellazione(e);
        }
    });
};

// ============================================================================
// 3. GESTIONE NOTIFICHE
// ============================================================================

window.MostraNotifica = (testo) => {
    const b = document.getElementById('banner-notifiche');
    if (b) {
        b.innerText = testo;
        b.style.display = 'block';
        setTimeout(() => b.style.display = 'none', 4000);
    }
};

// ============================================================================
// 4. STRUMENTI ADMIN E FUNZIONI SPECIALI
// ============================================================================

window.eseguiNukeMappa = () => {
    if (typeof isUfficiale !== 'undefined' && !isUfficiale) return;

    if (confirm("☢️ ATTENZIONE ☢️ Sei sicuro di voler ELIMINARE TUTTE LE SQUADRE, POI E DISEGNI? L'operazione non è reversibile!")) {

        if (typeof drawItems !== 'undefined') {
            drawItems.clearLayers();
            if (typeof socket !== 'undefined') socket.emit('pulisci_lavagna');
        }

        if (typeof deselezionaTutti === 'function') deselezionaTutti();

        if (typeof markerSquadre !== 'undefined') {
            for (let id in markerSquadre) {
                if (typeof socket !== 'undefined') socket.emit('elimina_elemento', { id: id, tipo: 'squadra' });
            }
        }

        if (typeof markerPOI !== 'undefined') {
            for (let id in markerPOI) {
                if (typeof socket !== 'undefined') socket.emit('elimina_elemento', { id: id, tipo: 'poi' });
            }
        }

        if (typeof socket !== 'undefined') socket.emit('nuke_mappa');

        if (typeof MostraNotifica === 'function') MostraNotifica("☢️ Mappa azzerata dall'Alto Comando.");
    }
};

// Arma nucleare anti-doppio tap per iOS/Tablet
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    let now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// ==========================================================================
// COLLAPSE ALL - CHIUSURA GLOBALE PANNELLI (Doppio Tocco/Click Ibrido)
// ==========================================================================
let ultimoClickCollapse = 0;

window.gestisciCollapse = () => {
    const ora = new Date().getTime();

    if (ora - ultimoClickCollapse < 400) {
        const pannelli = ['pannello', 'pannello-icone', 'sidebar', 'sidebar-orbita', 'terminal-wrapper'];

        pannelli.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('nascosto')) {
                el.classList.add('nascosto');
            }
        });
        ultimoClickCollapse = 0;
    } else {
        ultimoClickCollapse = ora;
    }
};