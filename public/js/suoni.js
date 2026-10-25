// Suoni del ping e delle richieste di comando. Su iPad e iPhone l'audio parte solo dopo un primo tocco.

let contesto = null;

function audio() {
    if (!contesto) {
        const Contesto = window.AudioContext || window.webkitAudioContext;
        if (!Contesto) return null;
        contesto = new Contesto();
    }
    if (contesto.state === 'suspended') contesto.resume();
    return contesto;
}

export function preparaAudio() {
    const sblocca = () => {
        const c = audio();
        if (!c) return;
        // Un suono muto: da qui in poi il browser lascia suonare anche i ping che arrivano dagli altri.
        const osc = c.createOscillator();
        const volume = c.createGain();
        volume.gain.value = 0;
        osc.connect(volume).connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.01);
    };
    document.addEventListener('pointerdown', sblocca, { once: true, capture: true });
    document.addEventListener('keydown', sblocca, { once: true, capture: true });
}

function bip(c, frequenza, inizio, durata, volumeMassimo) {
    const osc = c.createOscillator();
    const volume = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequenza, inizio);
    volume.gain.setValueAtTime(0, inizio);
    volume.gain.linearRampToValueAtTime(volumeMassimo, inizio + 0.08);
    volume.gain.linearRampToValueAtTime(0, inizio + durata);
    osc.connect(volume).connect(c.destination);
    osc.start(inizio);
    osc.stop(inizio + durata + 0.05);
}

// Tre bip in tre secondi, come nella mappa di prima.
export function suonoPing() {
    try {
        const c = audio();
        if (!c) return;
        for (let i = 0; i < 3; i++) bip(c, 700, c.currentTime + i, 0.8, 0.15);
    } catch (e) {
        console.warn('[mappa] audio non disponibile', e);
    }
}

export function suonoRichiesta() {
    try {
        const c = audio();
        if (!c) return;
        bip(c, 880, c.currentTime, 0.35, 0.12);
        bip(c, 1175, c.currentTime + 0.18, 0.35, 0.12);
    } catch (e) {
        console.warn('[mappa] audio non disponibile', e);
    }
}
