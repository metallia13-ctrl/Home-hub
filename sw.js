// Casa Hub — Service Worker
// "Network-first": quando pubblichi una nuova versione su GitHub Pages la ricevi
// subito; offline usa la copia in cache. Incrementa CACHE_VERSION a ogni rilascio
// e il numero ?v= in index.html (così il browser non mescola file vecchi e nuovi).
// IMPORTANTE: cancella solo le PROPRIE cache (prefisso casahub-). Study Hub vive
// sullo stesso dominio github.io e le cache sono condivise per dominio.
const CACHE_PREFIX = 'casahub-';
const CACHE_VERSION = CACHE_PREFIX + 'v1.4';
const APP_SHELL = ['./', './index.html', './style.css?v=1.4', './app.js?v=1.4', './manifest.webmanifest',
                   './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_VERSION)
        .then(c => c.addAll(APP_SHELL.map(u => new Request(u, { cache:'reload' }))))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Solo file della stessa origine: Apps Script, WhatsApp e Google Fonts passano diretti
    if (url.origin !== self.location.origin) return;
    // no-cache: chiede sempre al server se il file è cambiato (risposta leggera se è uguale),
    // invece di usare una copia vecchia della cache HTTP del browser
    e.respondWith(
        fetch(req.url, { cache:'no-cache', credentials:'same-origin' })
            .then(res => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then(c => c.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req).then(r => r || caches.match(req, { ignoreSearch:true }))
                .then(r => r || caches.match('./index.html')))
    );
});
