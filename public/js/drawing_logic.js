// ============================================================================
// DRAWING LOGIC - Matita, Disegni a Mano Libera, Forme Smart e Griglia
// ============================================================================

let isDrawingFreehand = false; 
let freehandCoords = [];
let freehandPolyline = null;

// Variabili per il sistema di riconoscimento forme stile iOS
let holdTimer = null;
const HOLD_DELAY = 600; // Tempo (in millisecondi) di sosta per innescare la forma perfetta

// ============================================================================
// 1. GESTIONE MATITA (A MANO LIBERA E SMART)
// ============================================================================

function iniziaDisegno(latlng) {
    isDrawingFreehand = true; 
    freehandCoords = [latlng];
    clearTimeout(holdTimer); 
    
    let currentColor = typeof coloreMatita !== 'undefined' ? coloreMatita : '#ff4444';

    freehandPolyline = L.polyline(freehandCoords, { 
        color: currentColor, 
        weight: 4, 
        interactive: true 
    }).addTo(drawItems);

    freehandPolyline.feature = freehandPolyline.feature || { type: 'Feature', properties: {} };
    freehandPolyline.feature.properties.color = currentColor;

    if (typeof assegnaEventiDisegno === 'function') assegnaEventiDisegno(freehandPolyline);
}

function continuaDisegno(latlng) {
    if (isDrawingFreehand && freehandPolyline) {
        freehandCoords.push(latlng);
        freehandPolyline.setLatLngs(freehandCoords);

        // Se l'utente muove il mouse, resettiamo il timer. 
        // Se si ferma per HOLD_DELAY millisecondi, scatta l'autocorrezione!
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            riconosciFormaSmart();
        }, HOLD_DELAY);
    }
}

function fineDisegno() {
    clearTimeout(holdTimer);
    if (isDrawingFreehand) { 
        isDrawingFreehand = false; 
        if (typeof socket !== 'undefined') {
            socket.emit('salva_disegni', drawItems.toGeoJSON()); 
        }
    }
}

// ============================================================================
// 1.5 ALGORITMO DI RICONOSCIMENTO FORME (iOS Style)
// ============================================================================

function riconosciFormaSmart() {
    // Se ci sono troppo pochi punti, non fa nulla
    if (!isDrawingFreehand || freehandCoords.length < 15) return;

    // Blocchiamo il disegno a mano libera così muovere il mouse dopo la correzione non rovina la forma
    isDrawingFreehand = false;

    const start = freehandCoords[0];
    const end = freehandCoords[freehandCoords.length - 1];
    let currentColor = freehandPolyline.feature.properties.color;
    
    // Calcolo della distanza in linea d'aria tra inizio e fine
    const distInizioFine = Math.sqrt(Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2));
    
    // Calcolo della lunghezza totale "disegnata"
    let lunghezzaTotale = 0;
    for (let i = 1; i < freehandCoords.length; i++) {
        lunghezzaTotale += Math.sqrt(Math.pow(freehandCoords[i].lat - freehandCoords[i-1].lat, 2) + Math.pow(freehandCoords[i].lng - freehandCoords[i-1].lng, 2));
    }

    const ratioLinea = distInizioFine / lunghezzaTotale;
    let shapeLayer = null;

    // SE È UNA FIGURA CHIUSA (Punto finale vicino a quello iniziale)
    if (ratioLinea < 0.25) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        freehandCoords.forEach(p => {
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lng < minLng) minLng = p.lng;
            if (p.lng > maxLng) maxLng = p.lng;
        });

        const altezza = maxLat - minLat;
        const larghezza = maxLng - minLng;
        const centerLat = minLat + altezza / 2;
        const centerLng = minLng + larghezza / 2;
        const proporzione = altezza / larghezza;
        
        // Se larghezza e altezza sono simili (rapporto tra 0.75 e 1.25)
        if (proporzione > 0.75 && proporzione < 1.25) {
            const raggioBase = (altezza + larghezza) / 4;
            let puntiAgliAngoli = 0;
            
            // "Corner Detector": Conta quanti punti si allungano verso gli angoli del quadrato
            freehandCoords.forEach(p => {
                let d = Math.sqrt(Math.pow(p.lat - centerLat, 2) + Math.pow(p.lng - centerLng, 2));
                if (d > raggioBase * 1.15) puntiAgliAngoli++;
            });

            if (puntiAgliAngoli > freehandCoords.length * 0.12) {
                // QUADRATO (Più del 12% dei punti nei vertici)
                shapeLayer = L.polygon([
                    [minLat, minLng], [maxLat, minLng], [maxLat, maxLng], [minLat, maxLng]
                ], { color: currentColor, weight: 4, fillOpacity: 0.1 });
            } else {
                // CERCHIO
                let puntiCerchio = [];
                for (let i = 0; i <= 36; i++) {
                    let angolo = (i * 10) * Math.PI / 180;
                    puntiCerchio.push([centerLat + raggioBase * Math.sin(angolo), centerLng + raggioBase * Math.cos(angolo)]);
                }
                shapeLayer = L.polygon(puntiCerchio, { color: currentColor, weight: 4, fillOpacity: 0.1 });
            }
        } 
        // Altrimenti, Rettangolo
        else {
            shapeLayer = L.polygon([
                [minLat, minLng], [maxLat, minLng], [maxLat, maxLng], [minLat, maxLng]
            ], { color: currentColor, weight: 4, fillOpacity: 0.1 });
        }
    } 
    // SE È UNA LINEA DRITTA APERTA (Tira quasi dritto verso l'arrivo)
    else if (ratioLinea > 0.85) {
        const angolo = Math.atan2(end.lat - start.lat, end.lng - start.lng);
        const arrowSize = 25; 
        
        const punta1 = [end.lat - arrowSize * Math.sin(angolo - Math.PI / 6), end.lng - arrowSize * Math.cos(angolo - Math.PI / 6)];
        const punta2 = [end.lat - arrowSize * Math.sin(angolo + Math.PI / 6), end.lng - arrowSize * Math.cos(angolo + Math.PI / 6)];

        shapeLayer = L.polyline([start, end, punta1, end, punta2], { color: currentColor, weight: 4 });
    }
    // SE È UNA CURVA (es. una manovra di aggiramento)
    else {
        // Applica un filtro "Moving Average" per smussare le imperfezioni della mano
        let smoothed = [];
        let windowSize = 5; // Più alto è questo numero, più ammorbidisce la curva
        
        for (let i = 0; i < freehandCoords.length; i++) {
            if (i < windowSize || i >= freehandCoords.length - windowSize) {
                smoothed.push(freehandCoords[i]);
            } else {
                let sumLat = 0, sumLng = 0;
                for (let j = -windowSize; j <= windowSize; j++) {
                    sumLat += freehandCoords[i+j].lat;
                    sumLng += freehandCoords[i+j].lng;
                }
                let count = (windowSize * 2) + 1;
                smoothed.push(L.latLng(sumLat/count, sumLng/count));
            }
        }

        // Calcola l'angolazione per la freccia usando l'ultima parte della curva morbida
        let p1 = smoothed[smoothed.length - Math.min(6, smoothed.length-1)]; 
        let p2 = smoothed[smoothed.length - 1];
        
        const angolo = Math.atan2(p2.lat - p1.lat, p2.lng - p1.lng);
        const arrowSize = 25; 
        
        const punta1 = [p2.lat - arrowSize * Math.sin(angolo - Math.PI / 6), p2.lng - arrowSize * Math.cos(angolo - Math.PI / 6)];
        const punta2 = [p2.lat - arrowSize * Math.sin(angolo + Math.PI / 6), p2.lng - arrowSize * Math.cos(angolo + Math.PI / 6)];

        // Unisce la freccia al percorso
        smoothed.push(L.latLng(punta1[0], punta1[1]));
        smoothed.push(L.latLng(p2.lat, p2.lng));
        smoothed.push(L.latLng(punta2[0], punta2[1]));

        shapeLayer = L.polyline(smoothed, { color: currentColor, weight: 4 });
    }

    // Effettua la sostituzione visiva
    if (shapeLayer) {
        drawItems.removeLayer(freehandPolyline);
        shapeLayer.feature = { type: 'Feature', properties: { color: currentColor, isShape: true } };
        shapeLayer.addTo(drawItems);
        
        if (typeof assegnaEventiDisegno === 'function') assegnaEventiDisegno(shapeLayer);
        if (typeof socket !== 'undefined') socket.emit('salva_disegni', drawItems.toGeoJSON());
    }
}

// ============================================================================
// 2. AZIONI SUI DISEGNI E STRUMENTI TATTICI
// ============================================================================

window.undoDisegno = () => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return; 
    
    const layers = drawItems.getLayers();
    if (layers.length > 0) { 
        drawItems.removeLayer(layers[layers.length - 1]); 
        if (typeof socket !== 'undefined') socket.emit('salva_disegni', drawItems.toGeoJSON()); 
    }
};

window.pulisciDisegni = () => {
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return;
    
    if (confirm("Cancellare tutti i disegni a mano? (Non elimina le icone)")) { 
        drawItems.clearLayers(); 
        if (typeof socket !== 'undefined') socket.emit('pulisci_lavagna'); 
    }
};

function creaCerchioTattico(latlng) {
    if (typeof isUfficiale !== 'undefined' && !isUfficiale) return;
    let cerchio = L.circle(latlng, { radius: 100, color: '#ff4444', fillOpacity: 0.2 }).addTo(map);
    cerchio.on('contextmenu', () => { map.removeLayer(cerchio); });
}

window.toggleGriglia = () => { 
    if (typeof possiedoComando !== 'undefined' && !possiedoComando) return; 
    if (typeof socket !== 'undefined') socket.emit('toggle_griglia_globale', typeof grigliaAttiva !== 'undefined' ? !grigliaAttiva : true); 
};

function generaGrigliaTattica() {
    if (typeof grigliaLayer === 'undefined') return;
    grigliaLayer.clearLayers();
    
    const SETTORI_X = 10, SETTORI_Y = 6;
    const L_X = 1920 / SETTORI_X, L_Y = 1080 / SETTORI_Y;

    for (let x = 0; x <= 1920; x += L_X) L.polyline([[0, x], [1080, x]], { color: 'rgba(255,255,255,0.4)', weight: 2, interactive: false }).addTo(grigliaLayer); 
    for (let y = 0; y <= 1080; y += L_Y) L.polyline([[y, 0], [y, 1920]], { color: 'rgba(255,255,255,0.4)', weight: 2, interactive: false }).addTo(grigliaLayer); 

    let mostraDettagli = (typeof map !== 'undefined' && typeof baseZoom !== 'undefined') && (map.getZoom() >= (baseZoom + 1.5));

    if (mostraDettagli) {
        for (let x = 0; x <= 1920; x += L_X / 2) L.polyline([[0, x], [1080, x]], { color: 'rgba(255,255,255,0.15)', weight: 1, dashArray: '5, 5', interactive: false }).addTo(grigliaLayer); 
        for (let y = 0; y <= 1080; y += L_Y / 2) L.polyline([[y, 0], [y, 1920]], { color: 'rgba(255,255,255,0.15)', weight: 1, dashArray: '5, 5', interactive: false }).addTo(grigliaLayer); 
    }

    for (let r = 0; r < SETTORI_Y; r++) {
        for (let c = 0; c < SETTORI_X; c++) {
            const x0 = c * L_X, y0 = r * L_Y;
            const lettera = String.fromCharCode(65 + (SETTORI_Y - 1 - r)); 

            L.marker([y0 + L_Y / 2, x0 + L_X / 2], { icon: L.divIcon({ html: lettera + (c + 1), className: 'etichetta-coordinata', iconSize: [40, 20] }), interactive: false }).addTo(grigliaLayer);

            if (mostraDettagli) {
                const subs = [
                    { n: "1", pos: [y0 + (L_Y * 0.75), x0 + (L_X * 0.25)] }, { n: "2", pos: [y0 + (L_Y * 0.75), x0 + (L_X * 0.75)] },
                    { n: "3", pos: [y0 + (L_Y * 0.25), x0 + (L_X * 0.25)] }, { n: "4", pos: [y0 + (L_Y * 0.25), x0 + (L_X * 0.75)] }
                ];
                subs.forEach(s => L.marker(s.pos, { icon: L.divIcon({ html: s.n, className: 'etichetta-coordinata-sub', iconSize: [20, 20] }), interactive: false }).addTo(grigliaLayer));
            }
        }
    }
}