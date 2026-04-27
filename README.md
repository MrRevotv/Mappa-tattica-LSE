# C2 Tactical Map System

Una mappa tattica interattiva e collaborativa in tempo reale, progettata per il coordinamento di squadre e operazioni sul campo (ottimizzata per Star Citizen e simulazioni tattiche).

## 🚀 Caratteristiche Principali

- **Sincronizzazione Multi-Utente:** Grazie all'integrazione con **Socket.io**, ogni movimento, rinomina o cambio di stato è visibile istantaneamente a tutti gli operatori connessi.
- **Gestione Gerarchica:** Sistema di permessi integrato (Ufficiali e Operatori) per gestire chi può modificare la mappa e chi può solo visualizzarla.
- **Schieramento Entità:** Possibilità di posizionare icone per Squadre Alleate e POI (punti di interesse) nemici, con icone dinamiche che cambiano in base alla fazione.
- **Cerchi Tattici e Radar:** Ogni icona può attivare un raggio d'azione visivo per delimitare zone d'operazione o portate radar.
- **Strumenti di Disegno:** Lavagna tattica integrata per disegnare linee e aree direttamente sulla mappa.
- **Bounty Tracking:** Modulo dedicato per il monitoraggio in tempo reale degli obiettivi (Bounty) e dei loro dati.
- **Database Mappe Dinamico:** Supporto per diversi sistemi, pianeti e sottomappe con caricamento automatico delle coordinate e dei confini.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Real-time:** Socket.io
- **Mappe:** Leaflet.js (per la gestione di overlay di immagini ad alta risoluzione)
- **Autenticazione:** Integrazione con Discord (Passport.js)
