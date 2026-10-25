// Le icone che si possono schierare (cartella public/Icone). I percorsi sono senza ".png", come nelle missioni
// salvate dalla mappa di prima; la versione nemica di ogni icona sta nella cartella "nemiche" con "-enemy".

const BASE = 'Icone/icone star citizen/';

export const CATEGORIE = [
    {
        nome: 'Generali',
        tipo: 'poi',
        icone: [
            ['Alert', 'generali/ALERT'],
            ['Obiettivo', 'generali/OBIETTIVO'],
            ['Obiettivo VIP', 'generali/OBIETTIVO_VIP'],
            ['POI Mining', 'generali/POI_MINING'],
            ['POI Observe', 'generali/POI_OBSERVE'],
            ['Radioactive', 'generali/RADIOACTIVE'],
        ],
    },
    {
        nome: 'OP FPS',
        tipo: 'squadra',
        icone: [
            ['FPS General', 'icone amiche/OP_FPS/SQ_FPSterra'],
            ['FPS Sniper', 'icone amiche/OP_FPS/SQ_FPSsniper'],
            ['Medica', 'icone amiche/OP_FPS/SQ_MEDICA'],
            ['Veicoli', 'icone amiche/OP_FPS/SQ_VEICOLI'],
        ],
    },
    {
        nome: 'OP Industriali',
        tipo: 'squadra',
        icone: [
            ['Commercio', 'icone amiche/OP_INDUSTRIALI/SQ_COMMERCIO'],
            ['Mining', 'icone amiche/OP_INDUSTRIALI/SQ_MINING'],
            ['Salvage', 'icone amiche/OP_INDUSTRIALI/SQ_SALVAGE'],
            ['Carico/Scarico', 'icone amiche/OP_INDUSTRIALI/SQ_car_scar'],
        ],
    },
    {
        nome: 'OP Volo',
        tipo: 'squadra',
        icone: [
            ['Dropship', 'icone amiche/OP_VOLO/DROPSHIP'],
            ['Admiral', 'icone amiche/OP_VOLO/SQ_ADMIRAL'],
            ['Capital', 'icone amiche/OP_VOLO/SQ_CAPITAL'],
            ['Volo', 'icone amiche/OP_VOLO/SQ_VOLO'],
        ],
    },
    {
        nome: 'Tattica',
        tipo: 'squadra',
        icone: [
            ['Antiaerea', 'icone amiche/TATTICA/ANTIAEREA'],
            ['Commando', 'icone amiche/TATTICA/COMMANDO'],
            ['Comms', 'icone amiche/TATTICA/COMMS'],
            ['Destroy', 'icone amiche/TATTICA/DESTROY'],
            ['Esfiltrazione', 'icone amiche/TATTICA/ESFILTRAZIONE'],
            ['Health', 'icone amiche/TATTICA/HEALTH'],
            ['Parcheggio', 'icone amiche/TATTICA/PARCHEGGIO'],
            ['Protect', 'icone amiche/TATTICA/PROTECT'],
            ['Rifornimento', 'icone amiche/TATTICA/RIFORNIMENTO'],
            ['Riparazioni', 'icone amiche/TATTICA/RIPARAZIONI'],
            ['Scudo', 'icone amiche/TATTICA/SCUDO'],
            ['Supply', 'icone amiche/TATTICA/SUPPLY'],
        ],
    },
].map((c) => ({ ...c, icone: c.icone.map(([nome, file]) => ({ nome, percorso: BASE + file })) }));

// La stessa icona nella versione amica o nemica.
export function percorsoFazione(percorso, fazione) {
    const parti = percorso.split('/');
    const nemica = fazione === 'nemica';
    if (parti[2] === 'icone amiche' || parti[2] === 'icone nemiche') {
        parti[2] = nemica ? 'icone nemiche' : 'icone amiche';
        if (parti[3]) parti[3] = parti[3].replace(/_ENEMY$/, '') + (nemica ? '_ENEMY' : '');
    } else if (parti[2] === 'generali' || parti[2] === 'generali nemiche') {
        parti[2] = nemica ? 'generali nemiche' : 'generali';
    } else {
        return percorso;
    }
    const ultimo = parti.length - 1;
    parti[ultimo] = parti[ultimo].replace(/-enemy$/, '') + (nemica ? '-enemy' : '');
    return parti.join('/');
}

export const srcIcona = (percorso) => encodeURI(`${percorso}.png`);

// Il nome dell'icona (es. "Medica") dal suo percorso, amica o nemica.
export function nomeIcona(percorso) {
    const amica = percorsoFazione(percorso, 'amica');
    for (const c of CATEGORIE) {
        const trovata = c.icone.find((i) => i.percorso === amica);
        if (trovata) return trovata.nome;
    }
    return '';
}

export const COLORI_NOME = ['#ffffff', '#ff4444', '#00e5ff', '#00ff00', '#ffeb3b', '#ff8c00', '#9c27b0'];
export const coloreNome = (e) => e.colore || (e.tipo === 'squadra' ? '#00e5ff' : '#ffffff');
export const coloreFazione = (fazione) => (fazione === 'nemica' ? '#ff6b5a' : '#4cc9f0');
