// Il goniometro: si trascina dove serve e si ruota con il cursore. Lo vede solo chi lo accende.
import { emetti } from './stato.js';
import { mappa, centroVisibile } from './mappa.js';
import { $ } from './ui.js';

let marker = null;

function disegnoSvg() {
    let svg = '<svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">';
    svg += '<circle cx="150" cy="150" r="140" fill="rgba(0, 40, 0, 0.2)" stroke="rgba(0, 255, 204, 0.3)" stroke-width="1"/>';
    for (let i = 0; i < 360; i += 10) {
        const principale = i % 90 === 0;
        const colore = i === 0 ? 'rgba(255, 68, 68, 0.9)' : 'rgba(0, 255, 204, 0.7)';
        svg += `<line x1="150" y1="10" x2="150" y2="${principale ? 35 : 20}" stroke="${colore}" stroke-width="${principale ? 2.5 : 1}" transform="rotate(${i}, 150, 150)"/>`;
        if (principale) svg += `<text x="150" y="55" fill="${colore}" font-size="14" font-family="monospace" font-weight="bold" text-anchor="middle" transform="rotate(${i}, 150, 150)">${i}°</text>`;
    }
    svg += '<circle cx="150" cy="150" r="3" fill="#ff4444"/>';
    svg += '<line x1="140" y1="150" x2="160" y2="150" stroke="#ff4444" stroke-width="1.5"/>';
    svg += '<line x1="150" y1="140" x2="150" y2="160" stroke="#ff4444" stroke-width="1.5"/>';
    return `${svg}</svg>`;
}

function ruota(gradi) {
    marker?.getElement()?.querySelector('.goniometro')?.style.setProperty('--angolo', `${gradi}deg`);
    $('#goniometro-gradi').textContent = `${gradi}°`;
}

export function attivaGoniometro(acceso) {
    if (acceso && !marker) {
        const el = document.createElement('div');
        el.className = 'goniometro';
        el.innerHTML = disegnoSvg();
        marker = L.marker(centroVisibile(), {
            icon: L.divIcon({ html: el, className: 'goniometro-wrapper', iconSize: [300, 300], iconAnchor: [150, 150] }),
            draggable: true,
            keyboard: false,
            zIndexOffset: 2000,
        }).addTo(mappa);
        $('#goniometro-angolo').value = '0';
        ruota(0);
    } else if (!acceso && marker) {
        marker.remove();
        marker = null;
    }
    $('#goniometro-comandi').hidden = !marker;
    emetti('goniometro', Boolean(marker));
}

export function avviaGoniometro() {
    $('#goniometro-angolo').addEventListener('input', (e) => ruota(Number(e.target.value)));
    $('#goniometro-chiudi').addEventListener('click', () => attivaGoniometro(false));
}
