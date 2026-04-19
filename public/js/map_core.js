// ============================================================================
// MAP CORE - Inizializzazione Mappa, Zoom e Sistema Ping
// ============================================================================

// Variabili globali della mappa
let bounds = [[0, 0], [1080, 1920]];
let map;
let livelloSfondo;
let baseZoom = 0;

// Motore audio globale e cronometro per i tap
let contestoAudioPing = null;
let lastClickTime = 0; // Cronometro ad alta precisione per il doppio tap

// Gruppi di livelli essenziali per i prossimi script
let drawItems = new L.FeatureGroup();
let grigliaLayer = L.layerGroup();
let grigliaAttiva = false;

let pingsAttivi = {};

// ============================================================================
// NUOVA FUNZIONE: ALLINEAMENTO A DESTRA E CALCOLO ZOOM
// ============================================================================
window.allineaMappaADestra = function () {
    if (!map) return;

    map.setMinZoom(-10); // Sblocca temporaneamente i limiti di zoom
    map.fitBounds(bounds, { animate: false }); // Adatta la mappa allo schermo (centrata di default)

    baseZoom = map.getZoom(); // Salva lo zoom perfetto calcolato

    // Calcolo dei pixel per l'allineamento a destra
    // Il punto [540, 1920] corrisponde esattamente alla metà del bordo destro della tua mappa
    let puntoBordoDestro = map.latLngToContainerPoint([540, 1920]).x;
    let larghezzaSchermo = map.getSize().x;

    let scarto = larghezzaSchermo - puntoBordoDestro; // Trova quanti pixel vuoti ci sono a destra

    // Se c'è spazio vuoto a destra (scarto positivo), facciamo slittare la telecamera a sinistra
    if (scarto > 0) {
        map.panBy([-scarto, 0], { animate: false });
    }

    map.setMinZoom(baseZoom); // Riblocca lo zoom per non far rimpicciolire ulteriormente la mappa
};


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

    // 4. Verifichiamo che non esista già nel nostro catalogo per evitare cloni
    if (!window.catalogoMappeGlobale) window.catalogoMappeGlobale = [];

    const esisteGia = window.catalogoMappeGlobale.some(m =>
        m.idMappa.toLowerCase() === nuovoTarget.idMappa.toLowerCase() &&
        m.pianeta === nuovoTarget.pianeta
    );

    if (!esisteGia) {
        // LO AGGIUNGIAMO AL MOTORE DI RICERCA!
        window.catalogoMappeGlobale.push(nuovoTarget);
        console.log(`[DATABASE] Nuovo target acquisito e indicizzato: ${nuovoTarget.nome} in ${nuovoTarget.pianeta}`);

        // (Opzionale) Mostriamo una notifica a schermo
        if (typeof MostraNotifica === 'function') {
            MostraNotifica(`Mappa indicizzata: ${nuovoTarget.nome}`);
        }
    }
};

// ============================================================================
// 1. INIZIALIZZAZIONE MAPPA
// ============================================================================
function initMap() {
    map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 2,
        zoomControl: false,
        doubleClickZoom: false, // Disabilita per non interferire col Ping
        attributionControl: false
    });

    livelloSfondo = L.imageOverlay('mappe/avvio.png', bounds).addTo(map).bringToBack();
    map.addLayer(drawItems);

    // 1. Applica l'allineamento a destra al primo avvio
    allineaMappaADestra();

    // 2. Ricalcola l'allineamento automaticamente se la finestra cambia dimensione
    map.on('resize', () => {
        allineaMappaADestra();
    });

    map.on('zoomend', () => {
        if (grigliaAttiva && typeof generaGrigliaTattica === 'function') {
            generaGrigliaTattica();
        }
    });

    // ========================================================================
    // 2. ASSEGNAZIONE EVENTI DISEGNO
    // ========================================================================
    map.on('mousedown', (e) => {
        if (typeof isMousePremutoGomma !== 'undefined') isMousePremutoGomma = true;
        if (typeof matitaAttiva === 'undefined' || !matitaAttiva || (e.originalEvent && e.originalEvent.pointerType === 'touch')) return;
        if (typeof iniziaDisegno === 'function') iniziaDisegno(e.latlng);
    });

    map.on('mousemove', (e) => {
        if (typeof matitaAttiva === 'undefined' || !matitaAttiva || typeof isDrawingFreehand === 'undefined' || !isDrawingFreehand || (e.originalEvent && e.originalEvent.pointerType === 'touch')) return;
        if (typeof continuaDisegno === 'function') continuaDisegno(e.latlng);
    });

    map.on('mouseup', () => {
        if (typeof isMousePremutoGomma !== 'undefined') isMousePremutoGomma = false;
        if (typeof isDrawingFreehand !== 'undefined' && isDrawingFreehand && typeof fineDisegno === 'function') fineDisegno();
    });

    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.addEventListener('touchstart', (e) => {
            if (typeof matitaAttiva === 'undefined' || !matitaAttiva) return;
            if (e.touches.length === 1) {
                const latlng = map.mouseEventToLatLng(e.touches[0]);
                if (typeof iniziaDisegno === 'function') iniziaDisegno(latlng);
            }
        }, { passive: false });

        mapDiv.addEventListener('touchmove', (e) => {
            if (typeof matitaAttiva === 'undefined' || !matitaAttiva) return;
            e.preventDefault();
            if (typeof isDrawingFreehand !== 'undefined' && isDrawingFreehand && e.touches.length === 1) {
                const latlng = map.mouseEventToLatLng(e.touches[0]);
                if (typeof continuaDisegno === 'function') continuaDisegno(latlng);
            }
        }, { passive: false });

        mapDiv.addEventListener('touchend', () => {
            if (typeof isDrawingFreehand !== 'undefined' && isDrawingFreehand && typeof fineDisegno === 'function') fineDisegno();
        }, { passive: false });
    }

    // ========================================================================
    // 3. SBLOCCO AUDIO SICUREZZA IPAD/TABLET
    // ========================================================================
    document.body.addEventListener('touchstart', function sbloccaAudio() {
        if (!contestoAudioPing) {
            contestoAudioPing = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (contestoAudioPing.state === 'suspended') {
            contestoAudioPing.resume();
        }
        const osc = contestoAudioPing.createOscillator();
        const gain = contestoAudioPing.createGain();
        gain.gain.value = 0;
        osc.connect(gain); gain.connect(contestoAudioPing.destination);
        osc.start(); osc.stop(contestoAudioPing.currentTime + 0.001);

        document.body.removeEventListener('touchstart', sbloccaAudio);
    }, { once: true });

    // ========================================================================
    // 4. EVENTI MAPPA: TESTO LIBERO E PING
    // ========================================================================
    map.on('click', (e) => {
        let currentTime = new Date().getTime();
        let timeDiff = currentTime - lastClickTime;

        if (timeDiff > 0 && timeDiff < 500) {
            lastClickTime = 0;

            if ((typeof matitaAttiva === 'undefined' || !matitaAttiva) &&
                (typeof gommaAttiva === 'undefined' || !gommaAttiva) &&
                (typeof testoAttivo === 'undefined' || !testoAttivo)) {

                let ruoloUtente = (typeof user !== 'undefined' && user.ruolo) ? user.ruolo : 'operatore';
                eseguiSuonoPing(e.latlng.lat, e.latlng.lng, ruoloUtente);

                if (typeof socket !== 'undefined') {
                    socket.emit('invia_ping', { lat: e.latlng.lat, lng: e.latlng.lng, ruolo: ruoloUtente });
                }
            }
            return;
        }

        lastClickTime = currentTime;

        if (typeof testoAttivo !== 'undefined' && testoAttivo) {
            let testo = prompt("Inserisci il testo da posizionare:");
            if (testo && testo.trim() !== "") {
                let color = typeof coloreMatita !== 'undefined' ? coloreMatita : '#ffffff';
                let textMarker = L.marker(e.latlng, {
                    icon: L.divIcon({
                        className: 'etichetta-testo-libero',
                        html: `<div style="color: ${color}; font-weight: bold; font-size: 18px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">${testo}</div>`,
                        iconSize: [200, 30],
                        iconAnchor: [100, 15]
                    }),
                    draggable: typeof possiedoComando !== 'undefined' ? possiedoComando : false
                }).addTo(drawItems);

                textMarker.feature = textMarker.feature || { type: 'Feature', properties: {} };
                textMarker.feature.properties.isText = true;
                textMarker.feature.properties.testo = testo;
                textMarker.feature.properties.color = color;

                textMarker.on('dragend', function () {
                    if (typeof possiedoComando !== 'undefined' && possiedoComando && typeof socket !== 'undefined') {
                        socket.emit('salva_disegni', drawItems.toGeoJSON());
                    }
                });

                if (typeof assegnaEventiDisegno === 'function') assegnaEventiDisegno(textMarker);
                if (typeof socket !== 'undefined') socket.emit('salva_disegni', drawItems.toGeoJSON());
                if (typeof attivaTesto === 'function') window.attivaTesto();
            }
        } else {
            if (typeof deselezionaTutti === 'function') deselezionaTutti();
        }
    });
}

window.toggleNightVision = () => {
    const mapContainer = document.getElementById('map');
    const btn = document.getElementById('btn-nvg');

    const isActive = mapContainer.classList.toggle('night-vision-active');

    // Feedback sul bottone
    if (btn) {
        btn.style.background = isActive ? "#ff4444" : "#444";
        btn.innerText = isActive ? "👁️ NVG ON" : "👁️ NVG OFF";
    }
};

// ============================================================================
// 5. PING CON SUONO PROLUNGATO (3s) E ANIMAZIONE (10s)
// ============================================================================
function eseguiSuonoPing(lat, lng, ruoloMittente) {
    let colore = '#44ff44';
    if (ruoloMittente === 'admin') colore = '#ff4444';
    else if (ruoloMittente === 'responsabile') colore = '#4444ff';

    if (pingsAttivi[ruoloMittente]) {
        if (map.hasLayer(pingsAttivi[ruoloMittente].marker)) {
            map.removeLayer(pingsAttivi[ruoloMittente].marker);
        }
        clearTimeout(pingsAttivi[ruoloMittente].timer);
    }

    const icon = L.divIcon({
        html: `<div class="ping-animato" style="border-color: ${colore}; box-shadow: 0 0 15px ${colore}, inset 0 0 15px ${colore};"></div>`,
        className: '',
        iconSize: [80, 80],
        iconAnchor: [40, 40]
    });

    const p = L.marker([lat, lng], { icon: icon, interactive: false }).addTo(map);

    const timer = setTimeout(() => {
        if (map.hasLayer(p)) map.removeLayer(p);
        delete pingsAttivi[ruoloMittente];
    }, 10000);

    pingsAttivi[ruoloMittente] = { marker: p, timer: timer };

    try {
        if (!contestoAudioPing) {
            contestoAudioPing = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (contestoAudioPing.state === 'suspended') {
            contestoAudioPing.resume();
        }

        for (let i = 0; i < 3; i++) {
            const osc = contestoAudioPing.createOscillator();
            const gain = contestoAudioPing.createGain();
            osc.connect(gain);
            gain.connect(contestoAudioPing.destination);

            osc.frequency.setValueAtTime(700, contestoAudioPing.currentTime + i);
            gain.gain.setValueAtTime(0, contestoAudioPing.currentTime + i);
            gain.gain.linearRampToValueAtTime(0.15, contestoAudioPing.currentTime + i + 0.1);
            gain.gain.linearRampToValueAtTime(0, contestoAudioPing.currentTime + i + 0.8);

            osc.start(contestoAudioPing.currentTime + i);
            osc.stop(contestoAudioPing.currentTime + i + 1);
        }
    } catch (e) {
        console.error("Errore audio ping:", e);
    }
}

// Quando premi il pulsante "Reset Visuale" dalla UI, usa la nuova funzione
window.resetMap = () => {
    allineaMappaADestra();
};