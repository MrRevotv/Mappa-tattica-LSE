// ============================================================================
// NETWORK CLIENT - Gestione connessione Socket.io, Login e Permessi
// ============================================================================

// Variabili globali di rete e utente
let user, socket;
let isUfficiale = false;
window.possiedoComando = false;

// ============================================================================
// 1. INIZIALIZZAZIONE APPLICATIVO
// ============================================================================
async function startC2() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            user = await res.json();
            window.mioRuolo = user.ruolo;
            isUfficiale = ['admin', 'responsabile'].includes(user.ruolo);
            // --- CONTROLLO RUOLI UI ---
            if (isUfficiale) {
                // Se è Alto Comando: mostra Console e nasconde il tasto richiedi
                const btnConsole = document.getElementById('btn-console');
                if (btnConsole) btnConsole.style.display = 'flex';

                const btnRichiedi = document.getElementById('btn-richiedi');
                if (btnRichiedi) btnRichiedi.style.display = 'none';
            } else {
                // Se è Operatore P-Lse: nasconde Console, mostra tasto richiedi
                const btnConsole = document.getElementById('btn-console');
                if (btnConsole) btnConsole.style.display = 'none';

                const btnRichiedi = document.getElementById('btn-richiedi');
                if (btnRichiedi) btnRichiedi.style.display = 'block';
            }

            // Nascondi overlay login e mostra interfaccia
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('pannello').style.display = 'flex';
            document.getElementById('sidebar').style.display = 'block';

            // Avvio connessione
            socket = io();

            // Richiama funzioni che saranno definite negli altri moduli
            initMap();
            setupSocket();

            socket.emit('richiedi_comando_iniziale');

            if (typeof caricaListaMappe === 'function') {
                caricaListaMappe();
            }
        }
    } catch (e) {
        console.error("Errore autenticazione:", e);
    }
}

// ============================================================================
// 2. GESTIONE EVENTI SOCKET (RICEZIONE DAL SERVER)
// ============================================================================
function setupSocket() {
    // --- Log Console ---
    socket.on('nuovo_log', (msg) => {
        const t = document.getElementById('terminal');
        t.innerHTML += `<div>${msg}</div>`;
        t.scrollTop = t.scrollHeight;
    });

    // 1. Quando il server concede il comando (all'ingresso o su richiesta)
    socket.on('comando_concesso', () => {
        window.possiedoComando = true; // SEMPRE con window.

        // Usiamo una funzione unica per aggiornare la UI
        if (typeof window.applicaPermessiMappe === 'function') {
            window.applicaPermessiMappe();
        }

        // --- AGGIORNAMENTO VISIVO DEL BOTTONE ---
        const btnRichiedi = document.getElementById('btn-richiedi');
        if (btnRichiedi) {
            btnRichiedi.innerText = "Comando Acquisito";
            btnRichiedi.style.background = "#28a745";
            setTimeout(() => { btnRichiedi.style.display = 'none'; }, 3000);
        }

        if (typeof MostraNotifica === 'function') {
            MostraNotifica("✅ Permessi di Comando Acquisiti");
        }
    });

    // 2. Quando l'ultimo ufficiale esce e i comandi diventano pubblici
    // Ricevuto quando l'ultimo ufficiale si disconnette
    socket.on('comandi_liberati', () => {
        console.log("[SISTEMA] Comandi liberati: Richiedo ufficialmente i permessi al server...");

        // LA CORREZIONE: Invece di sbloccare l'interfaccia di prepotenza,
        // diciamo al server che vogliamo prendere il posto vacante.
        // Il server ci registrerà e ci risponderà con 'comando_concesso'.
        if (typeof socket !== 'undefined') {
            socket.emit('richiedi_comando');
        }
    });

    // 3. Quando entra un altro ufficiale
    socket.on('ufficiale_online', () => {
        // Se io sono un Admin o Responsabile, NON devo perdere i comandi!
        if (window.mioRuolo === 'admin' || window.mioRuolo === 'responsabile') {
            console.log("[SISTEMA] Un altro ufficiale è online. Restiamo entrambi al comando.");
            window.possiedoComando = true;
            return;
        }

        // Se invece sono un operatore, mi blocco immediatamente
        window.possiedoComando = false;
        if (typeof window.applicaPermessiMappe === 'function') {
            window.applicaPermessiMappe();
        }

        // --- IL FIX: Facciamo riapparire il bottone per richiedere il comando! ---
        const btnRichiedi = document.getElementById('btn-richiedi');
        if (btnRichiedi) {
            btnRichiedi.innerText = "Richiedi Comando Mappa";
            btnRichiedi.style.background = "#ff8c00";
            btnRichiedi.style.display = 'block'; // Lo rendiamo di nuovo visibile
        }
    });
    socket.on('sync_stato_orbita', (data) => {
        const marker = markerSquadre[data.id] || markerPOI[data.id];
        if (!marker) return;

        if (data.inOrbita) {
            // Sparisce dalla mappa e appare in sidebar per tutti
            map.removeLayer(marker);
            if (marker.cerchioAssociato) map.removeLayer(marker.cerchioAssociato);
            window.aggiungiUnitaInOrbitaUI(data.id);
        } else {
            // Ritorna in mappa e sparisce dalla sidebar per tutti
            marker.addTo(map);
            marker.setLatLng([data.lat, data.lng]);

            const riga = document.getElementById(`parked-row-${data.id}`);
            if (riga) riga.remove();

            // Ping visivo di rientro
            const iconElement = marker.getElement()?.querySelector('.contenitore-icona');
            if (iconElement) {
                iconElement.classList.add('pulsazione-rientro');
                setTimeout(() => iconElement.classList.remove('pulsazione-rientro'), 3000);
            }
        }
    });

    socket.on('comando_revocato', () => {
        // 1. Se sei tu l'admin o responsabile, ignora il messaggio
        // Assicurati che 'mioRuolo' sia salvato globalmente
        if (window.mioRuolo === 'admin' || window.mioRuolo === 'responsabile') return;

        console.log("[SISTEMA] Comando revocato. Eseguo shutdown strumenti...");

        // 2. Blocca immediatamente i poteri (Variabile Globale)
        window.possiedoComando = false;

        // 3. Aggiorna i lucchetti dei menu e della toolbar
        if (typeof window.applicaPermessiMappe === 'function') {
            window.applicaPermessiMappe();
        }

        // 4. SPEGNIMENTO FORZATO DISGNO (Per evitare disegni locali)
        // Se usi Leaflet.draw, questo interrompe l'azione in corso
        if (window.map && window.drawControl) {
            // Disabilita tutti i possibili tool attivi (linea, poligono, etc)
            const toolbar = window.drawControl._toolbars.draw;
            if (toolbar) {
                // Questo comando stoppa qualsiasi disegno "a metà"
                toolbar.disable();
            }
        }

        // 5. --- RIPRISTINO VISIVO DEL BOTTONE ---
        const btnRichiedi = document.getElementById('btn-richiedi');
        if (btnRichiedi) {
            btnRichiedi.innerText = "Richiedi Comando Mappa";
            btnRichiedi.style.background = "#ff8c00";
            btnRichiedi.style.display = 'block';
        }

        if (typeof MostraNotifica === 'function') {
            MostraNotifica("⚠️ Attenzione: Permessi operativi revocati dall'Alto Comando.");
        }
    });

    // Ricezione della memoria permanente dal Server
    socket.on('sync_catalogo_mappe', (catalogoDalServer) => {
        window.catalogoMappeGlobale = catalogoDalServer;
        console.log(`[SISTEMA] Motore di Ricerca Allineato: ${catalogoDalServer.length} target operativi.`);
    });

    if (typeof socket !== 'undefined') {
    // Ascolta i cambi di nome degli altri
    socket.on('rinomina_entita', (data) => {
        let dati = datiSquadre[data.id] || datiPOI[data.id];
        if (dati) {
            dati.nome = data.nome; // Salva in memoria
            const etichetta = document.getElementById(`etichetta-${data.id}`);
            if (etichetta) {
                etichetta.innerText = data.nome; // Cambia la scritta a schermo
            }
        }
    });

    // Ascolta i cambi di colore degli altri
    socket.on('cambia_colore_entita', (data) => {
        let dati = datiSquadre[data.id] || datiPOI[data.id];
        if (dati) {
            dati.colore = data.colore; // Salva in memoria
            const etichetta = document.getElementById(`etichetta-${data.id}`);
            if (etichetta) {
                etichetta.style.color = data.colore; // Cambia il colore a schermo
            }
        }
    });
}

    socket.on('suono_richiesta_comando', () => {
        if (isUfficiale && audioCtx) {
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.setValueAtTime(0, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.5);
            } catch (e) { console.error("Errore audio:", e); }
        }
    });

    socket.on('aggiorna_richieste', (r) => {
        if (!isUfficiale) return;
        const t = document.getElementById('tendinaRichieste');
        if (!t) return;
        t.innerHTML = '<option value="">-- Richieste --</option>';
        for (let id in r) t.innerHTML += `<option value="${id}">${r[id]}</option>`;
    });

    socket.on('aggiorna_autorizzati', (r) => {
        if (!isUfficiale) return;
        const t = document.getElementById('tendinaAutorizzati');
        if (!t) return;
        t.innerHTML = '<option value="">-- Operatori attivi --</option>';
        for (let id in r) t.innerHTML += `<option value="${id}">${r[id]}</option>`;
    });

    // --- Sincronizzazione Mappa e Livelli ---
    socket.on('cambio_griglia_globale', (stato) => {
        grigliaAttiva = stato;
        if (stato) {
            generaGrigliaTattica();
            map.addLayer(grigliaLayer);
        } else {
            map.removeLayer(grigliaLayer);
        }
    });

    socket.on('aggiorna_stato_icona', (datiAggiornati) => {
        if (datiSquadre[datiAggiornati.id]) {
            datiSquadre[datiAggiornati.id] = datiAggiornati;
        }

        const marker = markerSquadre[datiAggiornati.id] || markerPOI[datiAggiornati.id];
        if (marker && marker.getElement()) {
            const elementoMarker = marker.getElement();

            // 1. AGGIORNA L'IMMAGINE (L'icona Amica/Nemica)
            const img = elementoMarker.querySelector('.immagine-custom');
            if (img) {
                let path = datiAggiornati.icona || datiAggiornati.percorsoIcona;
                let srcFinale = path.startsWith('Icone') ? `${path}.png` : `icone/${path}.png`;
                img.src = srcFinale; // Qui avviene il cambio visivo!
            }

            // 2. AGGIORNA IL NOME (Etichetta HUD)
            const etichetta = elementoMarker.querySelector('.etichetta-nome');
            if (etichetta) {
                etichetta.innerText = datiAggiornati.nome;
            }
        }

        // 3. Aggiorna i campi nel popup se è aperto
        const inputNome = document.getElementById(`nome-popup-${datiAggiornati.id}`);
        if (inputNome) inputNome.value = datiAggiornati.nome;

        // 4. Aggiorna la sidebar
        if (typeof aggiornaSidebar === 'function') aggiornaSidebar();
    });


    // Configurazione per il rendering vettoriale da GeoJSON (Matita e Testo)
    const opzioniRenderingDisegni = {
        pointToLayer: function (feature, latlng) {
            if (feature.properties && feature.properties.isText) {
                let m = L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'etichetta-testo-libero',
                        html: `<div style="color: ${feature.properties.color || '#ffffff'}; font-weight: bold; font-size: 18px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">${feature.properties.testo}</div>`,
                        iconSize: [200, 30], iconAnchor: [100, 15]
                    }),
                    draggable: typeof possiedoComando !== 'undefined' ? possiedoComando : false
                });

                m.on('dragend', function () {
                    if (possiedoComando) socket.emit('salva_disegni', drawItems.toGeoJSON());
                });

                return m;
            }
            return L.marker(latlng);
        },
        style: function (feature) {
            return { color: feature.properties.color || '#ff4444', weight: 4 };
        },
        onEachFeature: (f, l) => {
            drawItems.addLayer(l);
            if (typeof assegnaEventiDisegno === 'function') assegnaEventiDisegno(l);
        }
    };

    socket.on('aggiorna_disegni', (disegni) => {
        drawItems.clearLayers();
        if (disegni) L.geoJSON(disegni, opzioniRenderingDisegni);
    });

    // --- Caricamento Stato Totale ---
    socket.on('stato_iniziale', async (stato) => {
        console.log("[SISTEMA] Ricevuto stato iniziale:", stato);

        // 1. Carichiamo i dati del bounty se presenti
        if (stato.bounty && typeof applicaDatiBounty === 'function') {
            applicaDatiBounty(stato.bounty);
        }

        // 2. Carichiamo lo sfondo e la griglia
        if (typeof cambiaMappa === 'function') cambiaMappa(stato.sfondo);

        if (stato.grigliaAttiva && typeof generaGrigliaTattica === 'function') {
            grigliaAttiva = true;
            generaGrigliaTattica();
            if (typeof map !== 'undefined' && typeof grigliaLayer !== 'undefined') {
                map.addLayer(grigliaLayer);
            }
        }

        // ====================================================================
        // INIZIO LOGICA RIPRISTINO ICONE E DISEGNI (Recuperata dal vecchio codice)
        // ====================================================================

        // A. Pulizia della mappa prima di caricare le nuove icone
        if (typeof markerSquadre !== 'undefined') {
            for (let id in markerSquadre) map.removeLayer(markerSquadre[id]);
        }
        if (typeof markerPOI !== 'undefined') {
            for (let id in markerPOI) map.removeLayer(markerPOI[id]);
        }

        // Reset variabili locali
        markerSquadre = {}; markerPOI = {}; datiSquadre = {};
        if (typeof datiPOI !== 'undefined') datiPOI = {};
        if (typeof drawItems !== 'undefined') drawItems.clearLayers();

        // B. Ripristino Disegni (Linee e Aree)
        if (stato.disegni && typeof opzioniRenderingDisegni !== 'undefined') {
            L.geoJSON(stato.disegni, opzioniRenderingDisegni);
        }

        // C. Ripristino Squadre (Icone Amiche)
        if (stato.squadre) {
            for (let id in stato.squadre) {
                let dati = stato.squadre[id];
                if (typeof creaMarker === 'function') creaMarker(dati);
                if (dati.cerchioAttivo && typeof aggiornaCerchioMarker === 'function') {
                    aggiornaCerchioMarker(id, 'squadra', true);
                }
            }
        }

        // D. Ripristino POI (Icone Nemiche/Generiche)
        if (stato.poi) {
            for (let id in stato.poi) {
                let dati = stato.poi[id];
                if (typeof creaMarker === 'function') creaMarker(dati);
                if (dati.cerchioAttivo && typeof aggiornaCerchioMarker === 'function') {
                    aggiornaCerchioMarker(id, 'poi', true);
                }
            }
        }

        // Aggiorna la tendina laterale se presente
        if (typeof aggiornaSidebar === 'function') aggiornaSidebar();

        // ====================================================================
        // 3. RICOSTRUZIONE MENU E ICONE (Fissato per far apparire le icone)
        // ====================================================================
        if (stato.zonaOperativa) {

            // IL TRUCCO: Un minuscolo ritardo di 150ms permette al sistema di 
            // ricevere e attivare i "poteri di Admin" dal server PRIMA di disegnare fisicamente le icone.
            // Questo fa sì che le icone nascano già con il permesso di essere trascinate!
            setTimeout(async () => {
                window.stoRicevendoSync = true; // Blocchiamo l'invio di segnali mentre carichiamo
                const z = stato.zonaOperativa;

                if (z.gioco) {
                    const elGioco = document.getElementById('filtro-gioco');
                    if (elGioco) {
                        elGioco.value = z.gioco;
                        // Chiamiamo esplicitamente la tua funzione per garantire il caricamento
                        if (typeof window.gestisciGioco === 'function') window.gestisciGioco();
                        elGioco.dispatchEvent(new Event('change')); // Simula il click per la UI
                    }
                }

                if (z.sistema) {
                    const elSistema = document.getElementById('filtro-sistema');
                    if (elSistema) {
                        elSistema.value = z.sistema;
                        if (typeof window.gestisciSistema === 'function') window.gestisciSistema();
                        elSistema.dispatchEvent(new Event('change'));
                    }
                }

                if (z.pianeta) {
                    const elPianeta = document.getElementById('filtro-pianeta');
                    if (elPianeta) {
                        elPianeta.value = z.pianeta;
                        if (typeof window.gestisciPianeta === 'function') await window.gestisciPianeta();
                        elPianeta.dispatchEvent(new Event('change'));
                    }

                    // Aspettiamo un attimo che le mappe siano caricate nel menu
                    setTimeout(() => {
                        if (z.mappa) {
                            const elMappa = document.getElementById('tendinaMappe');
                            if (elMappa) {
                                elMappa.value = z.mappa;
                                if (typeof window.gestisciMappa === 'function') window.gestisciMappa(false);
                                elMappa.dispatchEvent(new Event('change'));
                            }
                        }

                        if (z.submappa) {
                            setTimeout(() => {
                                const elSub = document.getElementById('tendinaSubMappe');
                                if (elSub) {
                                    elSub.value = z.submappa;
                                    elSub.dispatchEvent(new Event('change'));
                                }
                            }, 500);
                        }

                        window.stoRicevendoSync = false; // Sblocchiamo tutto

                        // Riapplica i permessi visivi (così le icone appena caricate diventano visibili e trascinabili)
                        if (typeof window.applicaPermessiMappe === 'function') {
                            window.applicaPermessiMappe();
                        }

                    }, 800);
                } else {
                    window.stoRicevendoSync = false;
                }
            }, 150); // <--- IL RITARDO SALVAVITA (150ms)
        }

       // --- FORZATURA VISIVA DELLA MAPPA DA SERVER ---
        // Aspettiamo 1.5 secondi per assicurarci che i menu abbiano finito di muoversi.
        // Poi sovrascriviamo fisicamente la mappa con l'immagine e le misure salvate sul server.
        setTimeout(() => {
            if (stato.sfondo && stato.bounds) {
                console.log("[SISTEMA] Applico lo sfondo definitivo dal server:", stato.sfondo);
                
                // 1. Aggiorniamo le misure globali
                bounds = stato.bounds;
                
                // 2. Rimuoviamo la vecchia immagine (avvio.png)
                if (typeof livelloSfondo !== 'undefined' && map.hasLayer(livelloSfondo)) {
                    map.removeLayer(livelloSfondo);
                }
                
                // 3. Creiamo e aggiungiamo la nuova immagine direttamente
                livelloSfondo = L.imageOverlay(stato.sfondo, bounds).addTo(map);
                livelloSfondo.bringToBack();
                
                // 4. Centriamo la telecamera sulla nuova mappa (opzionale ma comodissimo)
                if (typeof map !== 'undefined') {
                    map.fitBounds(bounds);
                }
            } else if (stato.sfondo && typeof cambiaMappa === 'function') {
                // Se per caso mancano i bounds (es. mappa base), proviamo il metodo classico
                cambiaMappa(stato.sfondo);
            }
        }, 1500); 
        // ----------------------------------------------
        
    }); // <--- CHIUSURA CORRETTA DELLA FUNZIONE stato_iniziale

    // ---------------------------------------------------------
    // ASCOLTATORI INDIPENDENTI (Portato fuori dallo stato iniziale!)
    // ---------------------------------------------------------
    socket.on('sync_bounty', (dati) => {
        if (typeof window.applicaDatiBounty === 'function') {
            window.applicaDatiBounty(dati);
        }
    });

    socket.on('cambio_mappa', (data) => {
        if (typeof MostraNotifica === 'function') MostraNotifica("⏳ Acquisizione feed satellitare...");

        // 1. Creiamo il nuovo livello mappa ma lo teniamo INVISIBILE (opacity: 0)
        // Rimuoviamo il Date.now() così il browser scaricherà gli 8MB solo la primissima volta!
        let nuovoSfondo = L.imageOverlay(data.url, data.bounds, { opacity: 0 }).addTo(map);

        // 2. Mettiamoci in ascolto: scatta SOLO quando l'immagine è scaricata al 100%
        nuovoSfondo.on('load', () => {
            // Togliamo la mappa vecchia
            if (map.hasLayer(livelloSfondo)) map.removeLayer(livelloSfondo);

            // Rendiamo visibile quella nuova tutta in una volta
            nuovoSfondo.setOpacity(1);
            nuovoSfondo.bringToBack();

            // Aggiorniamo la variabile globale
            livelloSfondo = nuovoSfondo;

            // Aggiorniamo la variabile globale anche sul nostro tablet per coerenza
            bounds = data.bounds; 
            map.fitBounds(bounds); // (Opzionale) Centra la visuale sulla nuova mappa

            if (typeof MostraNotifica === 'function') MostraNotifica("✅ Mappa operativa.");
        });
    });

    // --- Entità e Markers ---
    socket.on('elemento_creato', (dati) => creaMarker(dati));
    socket.on('posizione_aggiornata', (dati) => {
        const m = dati.tipo === 'squadra' ? markerSquadre[dati.id] : markerPOI[dati.id];
        if (m) m.setLatLng([dati.lat, dati.lng]);
    });
    socket.on('aggiorna_cerchio', (dati) => {
        if (dati.tipo === 'squadra' && datiSquadre[dati.id]) {
            datiSquadre[dati.id].cerchioAttivo = dati.stato;
            // Salviamo il raggio anche nella memoria locale del client
            if (dati.raggio) datiSquadre[dati.id].raggio = dati.raggio;
        }

        // Passiamo il raggio come QUARTO parametro alla funzione che disegna!
        if (typeof aggiornaCerchioMarker === 'function') {
            aggiornaCerchioMarker(dati.id, dati.tipo, dati.stato, dati.raggio);
        } else if (typeof window.aggiornaCerchioMarker === 'function') {
            window.aggiornaCerchioMarker(dati.id, dati.tipo, dati.stato, dati.raggio);
        }
    });
    socket.on('roster_aggiornato', (dati) => {
        if (datiSquadre[dati.id]) {
            datiSquadre[dati.id].roster = dati.roster;

            // Aggiorna solo se NON stai scrivendo tu (Focus Check)
            const campi = [
                { el: document.getElementById(`capo-${dati.id}`), val: dati.roster.capo },
                { el: document.getElementById(`vice-${dati.id}`), val: dati.roster.vice },
                { el: document.getElementById(`membri-${dati.id}`), val: dati.roster.membri },
                { el: document.getElementById(`c_${dati.id}`), val: dati.roster.capo },
                { el: document.getElementById(`v_${dati.id}`), val: dati.roster.vice },
                { el: document.getElementById(`m_${dati.id}`), val: dati.roster.membri }
            ];

            campi.forEach(item => {
                // Se l'elemento esiste e NON è quello dove ho il cursore, aggiorno il valore
                if (item.el && document.activeElement !== item.el) {
                    item.el.value = item.val;
                }
            });
        }
        // MAI CHIAMARE aggiornaSidebar() qui!
    });
    socket.on('elemento_eliminato', (dati) => {
        if (dati.tipo === 'squadra' && markerSquadre[dati.id]) {
            map.removeLayer(markerSquadre[dati.id]);
            delete markerSquadre[dati.id];
            delete datiSquadre[dati.id];
            if (typeof aggiornaSidebar === 'function') aggiornaSidebar();
        } else if (markerPOI[dati.id]) {
            map.removeLayer(markerPOI[dati.id]);
            delete markerPOI[dati.id];
        }
    });

    // --- Ping ---
    socket.on('ricevi_ping', (dati) => {
        if (typeof eseguiSuonoPing === 'function') eseguiSuonoPing(dati.lat, dati.lng, dati.ruolo);
    });

    // --- Generazione Fisica del File di Salvataggio ---
    socket.on('ricevi_download_missione', (datiMappa) => {
        // Assicuriamoci di prendere gli ultimissimi disegni fatti a matita
        if (typeof drawItems !== 'undefined') {
            datiMappa.disegni = drawItems.toGeoJSON();
        }

        // Converte i dati in un file fisico scaricabile
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(datiMappa, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;

        // Genera un nome dinamico con data e ora (es. Missione_C2_2024-05-12_14-30.json)
        let date = new Date();
        let timestamp = date.toISOString().split('T')[0] + "_" + date.getHours() + "-" + date.getMinutes();
        a.download = `Missione_C2_${timestamp}.json`;

        // Simula il click per far partire il download sul dispositivo
        document.body.appendChild(a);
        a.click();
        a.remove();

        if (typeof MostraNotifica === 'function') MostraNotifica("💾 File Missione scaricato con successo!");
    });

    // --- In network_client.js ---

    socket.on('aggiorna_ruoli', (data) => {
        console.log("[RUOLI] Cambio gerarchia rilevato:", data);

        // 1. Aggiorna la variabile globale del comando
        // (Assicurati che 'comando' sia il nome del campo inviato dal tuo server)
        window.possiedoComando = data.comando;

        // 2. Sblocca o Blocca i menu ISTANTANEAMENTE
        if (typeof window.applicaPermessiMappe === 'function') {
            window.applicaPermessiMappe();
        }
    });

    socket.on('sync_zona_operativa', (data) => {
        // 1. BLOCCO DI SICUREZZA: Attiviamo l'interruttore per evitare loop
        window.stoRicevendoSync = true;

        const el = document.getElementById(data.id);
        if (!el) {
            console.warn(`[SYNC] Elemento non trovato: ${data.id}`);
            window.stoRicevendoSync = false;
            return;
        }

        console.log(`[SYNC-RECEIVE] Allineamento: ${data.id} -> ${data.value}`);

        // --- CASO 1: TENDINA MAPPE (Gestione lenta con caricamento dati) ---
        if (data.id === 'tendinaMappe') {
            let tentativi = 0;
            const attendiMappeData = setInterval(() => {
                tentativi++;

                // Verifichiamo se i dati della mappa sono pronti
                if (window.mappeData && window.mappeData[data.value]) {
                    clearInterval(attendiMappeData);
                    el.value = data.value;

                    if (typeof window.gestisciMappa === 'function') {
                        window.gestisciMappa(true);
                    }

                    // Sblocchiamo dopo mezzo secondo
                    setTimeout(() => { window.stoRicevendoSync = false; }, 500);
                }

                // Timeout di sicurezza dopo 3 secondi
                if (tentativi > 30) {
                    console.error("[SYNC] Timeout caricamento dati mappa per:", data.value);
                    clearInterval(attendiMappeData);
                    window.stoRicevendoSync = false;
                }
            }, 100);
        }

        // --- CASO 2: SOTTOMAPPE ---
        else if (data.id === 'tendinaSubMappe') {
            el.value = data.value;

            if (!data.value || data.value === "") {
                if (typeof window.gestisciMappa === 'function') window.gestisciMappa(true);
            } else {
                if (typeof window.cambiaMappa === 'function') window.cambiaMappa(data.value);
            }

            setTimeout(() => { window.stoRicevendoSync = false; }, 200);
        }

        // --- CASO 3: FILTRI OPERATIVI ---
        else {
            el.value = data.value;

            if (data.id === 'filtro-gioco' && typeof window.gestisciGioco === 'function') window.gestisciGioco();
            if (data.id === 'filtro-sistema' && typeof window.gestisciSistema === 'function') window.gestisciSistema();
            if (data.id === 'filtro-pianeta' && typeof window.gestisciPianeta === 'function') window.gestisciPianeta();

            setTimeout(() => { window.stoRicevendoSync = false; }, 200);
        }
    }); // <--- Fine del listener socket.on
}

// ============================================================================
// 3. FUNZIONI CHIAMABILI DALLA UI (PERMESSI)
// ============================================================================

window.richiediComando = () => {
    socket.emit('richiedi_comando');
    const btnRichiedi = document.getElementById('btn-richiedi');
    if (btnRichiedi) btnRichiedi.innerText = "⏳ In attesa...";
};

window.rilasciaComando = () => socket.emit('rilascia_comando');

window.approvaRichiesta = () => {
    const v = document.getElementById('tendinaRichieste').value;
    if (v) socket.emit('approva_richiesta', v);
};

window.revocaSingolo = () => {
    const v = document.getElementById('tendinaAutorizzati').value;
    if (v) socket.emit('revoca_comando', v);
};

// ============================================================================
// 4. FUNZIONE PER FARE IL LOGOUT
// ============================================================================
window.logout = () => {
    if (confirm("Sei sicuro di voler abbandonare la missione e tornare al login?")) {
        // 1. Notifichiamo il server se necessario (opzionale)
        if (typeof socket !== 'undefined' && socket.connected) {
            socket.emit('utente_disconnesso');
        }

        // 2. Reindirizziamo alla rotta di logout del server
        // Solitamente in Node.js/Express con Passport-Discord è '/logout' o '/auth/logout'
        window.location.href = '/logout';
    }
};

// Funzione per sincronizzare i menu a tendina
window.syncDropdownMaster = (elementId, value) => {
    // SE L'INTERRUTTORE È ATTIVO, ESCI SUBITO (Blocca il loop)
    if (window.stoRicevendoSync) return;

    if (typeof possiedoComando !== 'undefined' && possiedoComando) {
        if (typeof socket !== 'undefined') {
            console.log(`[MASTER-SEND] Invio sync per ${elementId}: ${value}`);
            socket.emit('sync_zona_operativa', { id: elementId, value: value });
        }
    }
};