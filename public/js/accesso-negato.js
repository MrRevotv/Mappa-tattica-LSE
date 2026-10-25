// Pagina "accesso dal sito LSE non riuscito": lo dice al sito che ospita la mappa.
if (window.parent !== window) window.parent.postMessage({ tipo: 'lse-strumento', stato: 'accesso-negato' }, '*');
