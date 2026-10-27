// Picline im Browser: erst die Browser-Brücke, dann dieselbe Oberfläche wie die App
import './api.js';
import '../renderer/js/app.js';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
