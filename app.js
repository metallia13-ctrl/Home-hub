// ═══════════════════════════════════════════════════════════════════════════
//  CASA HUB — app.js (v1.0)
//  Impegni di casa (urgenza, categorie, ricorrenze, rinvii) + lista della spesa
// ═══════════════════════════════════════════════════════════════════════════

// ── Costanti ────────────────────────────────────────────────────────────────
// Tutte le chiavi hanno il prefisso casahub_: su GitHub Pages Study Hub e
// Casa Hub condividono lo stesso localStorage (stesso dominio).
const STORAGE_KEY = 'casahub_data_v1';
const UI_KEY = 'casahub_ui';
const THEME_KEY = 'casahub_theme';
const SYNC_KEY = 'casahub_sync_url';
const SYNC_STATUS_KEY = 'casahub_sync_status';
const CAT_COLORS = ['#9ad1ae','#7dd3fc','#c4b5fd','#f9a8d4','#fdba74','#a5b4fc','#99f6e4','#d6d3d1'];
const DOW_SHORT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const DOW_FULL = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const ISO_DOW_LABELS = { 1:'Lun', 2:'Mar', 3:'Mer', 4:'Gio', 5:'Ven', 6:'Sab', 7:'Dom' };
const URG_LABEL = { 1:'Normale', 2:'Importante', 3:'Urgente' };
const REC_UNITS = ['day','week','month','year'];
const COLLS = ['tasks','taskCats','shopCats','shopItems'];
const VIEWS = ['today','day','week','month','list'];
const DAY_MS = 864e5;

// ── Utility ─────────────────────────────────────────────────────────────────
function $(id){ return document.getElementById(id); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escHtml(s){
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Argomento sicuro per handler inline: onclick="fn(${jsArg(x)})"
function jsArg(v){ return escHtml(JSON.stringify(String(v))); }
function slug(s){
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function normName(s){ return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function localDateStr(dt){ return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function todayStr(){ return localDateStr(new Date()); }
function parseLocalDate(iso){ const p = iso.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function isIso(s){
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return localDateStr(parseLocalDate(s)) === s;
}
function fmtDate(iso){ return iso ? iso.split('-').reverse().join('/') : '—'; }
function shiftDate(s, d){
    const dt = (typeof s === 'string') ? parseLocalDate(s) : new Date(s);
    dt.setDate(dt.getDate() + d);
    return localDateStr(dt);
}
function mondayOf(d){
    const x = new Date(d); x.setHours(0,0,0,0);
    x.setDate(x.getDate() - (isoDow(x) - 1));
    return x;
}
function isoDow(dt){ return dt.getDay() === 0 ? 7 : dt.getDay(); }
function daysBetween(a, b){ return Math.round((parseLocalDate(b) - parseLocalDate(a)) / DAY_MS); }
// "oggi", "domani", "ieri", altrimenti "ven 6/11"
function fmtRel(iso){
    if (!iso) return 'senza data';
    const diff = daysBetween(todayStr(), iso);
    if (diff === 0) return 'oggi';
    if (diff === 1) return 'domani';
    if (diff === -1) return 'ieri';
    const d = parseLocalDate(iso);
    const base = `${DOW_SHORT[d.getDay()].toLowerCase()} ${d.getDate()}/${d.getMonth()+1}`;
    return d.getFullYear() === new Date().getFullYear() ? base : `${base}/${String(d.getFullYear()).slice(2)}`;
}
function parseTimeInput(str){
    const mt = String(str || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
    if (!mt) return null;
    const h = +mt[1], mi = +mt[2];
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
}

// ── Dati predefiniti (ID fissi: due dispositivi nuovi non creano doppioni) ──
const DEFAULT_TASK_CATS = [
    ['pulizie', 'Pulizie', ['Cucina','Bagno','Camere','Pavimenti','Vetri']],
    ['bucato', 'Bucato', ['Lavatrici','Stiro','Cambio lenzuola']],
    ['cucina', 'Cucina e pasti', ['Pasti','Frigo e dispensa']],
    ['pratiche', 'Bollette e pratiche', ['Bollette','Documenti','Appuntamenti']],
    ['manutenzione', 'Manutenzione', []],
    ['piante', 'Piante e animali', []],
    ['altro', 'Altro', []],
];
const DEFAULT_SHOP = [
    ['frutta', 'Frutta e verdura', ['Banane','Mele','Pere','Arance','Limoni','Insalata','Pomodori','Zucchine','Carote','Patate','Cipolle','Aglio']],
    ['pane', 'Pane, pasta e cereali', ['Pane','Pasta','Riso','Farina','Biscotti','Fette biscottate','Cereali']],
    ['latticini', 'Latticini e uova', ['Latte','Yogurt','Burro','Mozzarella','Parmigiano','Uova']],
    ['carne', 'Carne e pesce', ['Pollo','Carne macinata','Prosciutto cotto','Salmone']],
    ['dispensa', 'Dispensa', ["Olio d'oliva",'Passata di pomodoro','Legumi','Tonno in scatola','Sale','Zucchero','Caffè','Tè']],
    ['surgelati', 'Surgelati', ['Verdure surgelate','Pesce surgelato']],
    ['bevande', 'Bevande', ['Acqua','Succhi di frutta']],
    ['pulizia', 'Casa e pulizia', ['Detersivo piatti','Detersivo lavatrice','Carta igienica','Carta da cucina','Sacchi spazzatura','Spugne']],
    ['igiene', 'Igiene personale', ['Shampoo','Bagnoschiuma','Dentifricio','Deodorante']],
];
function emptyData(){ return { v:1, tasks:[], taskCats:[], shopCats:[], shopItems:[], deleted:{}, lastModified:0 }; }
function seedDefaults(d){
    d.taskCats = DEFAULT_TASK_CATS.map(([k, name, subs], i) => ({
        id:'d_tc_' + k, name, color:CAT_COLORS[i % CAT_COLORS.length], order:i,
        subs:subs.map(s => ({ id:`d_ts_${k}_${slug(s)}`, name:s })), _mod:1 }));
    d.shopCats = DEFAULT_SHOP.map(([k, name], i) => ({ id:'d_sc_' + k, name, order:i, _mod:1 }));
    d.shopItems = [];
    DEFAULT_SHOP.forEach(([k, , items]) => items.forEach(n => d.shopItems.push({
        id:`d_si_${k}_${slug(n)}`, catId:'d_sc_' + k, name:n, need:false, qty:'', _mod:1 })));
    return d;
}

// ── Caricamento e normalizzazione ───────────────────────────────────────────
function normRec(r){
    if (!r || typeof r !== 'object' || !REC_UNITS.includes(r.unit)) return null;
    const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b) : [];
    return { unit:r.unit, every:clamp(parseInt(r.every, 10) || 1, 1, 99),
        days:(r.unit === 'week' && !r.fromDone) ? days : [], fromDone:!!r.fromDone };
}
function normalizeData(d){
    const base = emptyData();
    if (!d || typeof d !== 'object') d = {};
    for (const k in base) if (d[k] === undefined) d[k] = base[k];
    if (!d.deleted || typeof d.deleted !== 'object') d.deleted = {};
    COLLS.forEach(c => {
        if (!Array.isArray(d[c])) d[c] = [];
        const seen = new Set();
        d[c] = d[c].filter(r => {
            if (!r || typeof r !== 'object') return false;
            if (!r.id) r.id = uid();
            r.id = String(r.id);
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            if (typeof r._mod !== 'number') r._mod = 0;
            return true;
        });
    });
    d.tasks.forEach(t => {
        t.title = String(t.title || '').trim() || 'Senza titolo';
        t.urg = [1, 2, 3].includes(+t.urg) ? +t.urg : 1;
        t.catId = t.catId ? String(t.catId) : null;
        t.subId = t.subId ? String(t.subId) : null;
        t.date = isIso(t.date) ? t.date : null;
        t.time = parseTimeInput(t.time);
        t.notes = typeof t.notes === 'string' ? t.notes : '';
        t.rec = normRec(t.rec);
        if (t.rec && !t.date) t.date = todayStr();
        t.sched = isIso(t.sched) ? t.sched : t.date;
        t.anchor = isIso(t.anchor) ? t.anchor : t.sched;
        t.postponed = Math.max(0, parseInt(t.postponed, 10) || 0);
        t.log = Array.isArray(t.log) ? t.log.filter(isIso).slice(0, 20) : [];
        t.done = !!t.done && !t.rec;
        t.doneAt = isIso(t.doneAt) ? t.doneAt : null;
    });
    d.taskCats.forEach((c, i) => {
        c.name = String(c.name || '').trim() || 'Categoria';
        if (!c.color) c.color = CAT_COLORS[i % CAT_COLORS.length];
        if (typeof c.order !== 'number') c.order = i;
        c.subs = Array.isArray(c.subs) ? c.subs.filter(s => s && s.name).map(s => ({ id:String(s.id || uid()), name:String(s.name) })) : [];
    });
    d.shopCats.forEach((c, i) => {
        c.name = String(c.name || '').trim() || 'Reparto';
        if (typeof c.order !== 'number') c.order = i;
    });
    d.shopItems.forEach(it => {
        it.name = String(it.name || '').trim() || 'Prodotto';
        it.need = !!it.need;
        it.qty = typeof it.qty === 'string' ? it.qty : '';
        it.catId = it.catId ? String(it.catId) : null;
    });
    return d;
}
let _loadError = false;
function loadData(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDefaults(emptyData());
    try { return JSON.parse(raw); }
    catch (e) {
        try { localStorage.setItem(STORAGE_KEY + '_corrupt_' + Date.now(), raw); } catch (_) {}
        _loadError = true;
        return emptyData();
    }
}
let data = normalizeData(loadData());

function loadUi(){
    let u = {};
    try { u = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (_) {}
    return {
        section: u.section === 'shop' ? 'shop' : 'tasks',
        view: VIEWS.includes(u.view) ? u.view : 'today',
        shopFilter: u.shopFilter === 'need' ? 'need' : 'all',
        collapsed: (u.collapsed && typeof u.collapsed === 'object') ? u.collapsed : {},
        showDone: !!u.showDone,
        lastShopCat: u.lastShopCat || null,
    };
}
let ui = loadUi();
function saveUi(){ try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_) {} }

let weekOffset = 0, selectedDayOffset = null, monthOffset = 0;

// ── Salvataggio: timestamp PER RECORD (base del merge di sync) ─────────────
// Ogni impegno, categoria, reparto e prodotto ha il suo _mod: in sync vince la
// versione più recente di ciascun elemento, non dell'intero database.
let _sig = {};
function recSig(r){ const { _mod, ...rest } = r; return JSON.stringify(rest); }
function snapshotSigs(){
    _sig = {};
    COLLS.forEach(c => data[c].forEach(r => { _sig[c + ':' + r.id] = recSig(r); }));
}
function persist(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { showToast('⚠ Memoria piena: esporta un backup'); }
}
function save(){
    const now = Date.now();
    let changed = false;
    const seen = new Set();
    COLLS.forEach(c => data[c].forEach(r => {
        const k = c + ':' + r.id, sg = recSig(r);
        seen.add(k);
        if (_sig[k] !== sg) { r._mod = now; _sig[k] = sg; changed = true; delete data.deleted[k]; }
    }));
    Object.keys(_sig).forEach(k => {
        if (!seen.has(k)) { delete _sig[k]; data.deleted[k] = now; changed = true; }
    });
    if (changed) { data.lastModified = now; scheduleAutoSync(); }
    persist();
    updateBadges();
}
snapshotSigs();

// ── Toast & modali ──────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, action){
    const x = $('toast');
    if (!x) return;
    x.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    x.appendChild(span);
    if (action) {
        const b = document.createElement('button');
        b.className = 'toast-action';
        b.textContent = action.label;
        b.onclick = () => { x.className = ''; clearTimeout(_toastTimer); action.fn(); };
        x.appendChild(b);
    }
    x.className = '';
    void x.offsetWidth; // riavvia l'animazione
    x.className = action ? 'show long' : 'show';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { x.className = ''; }, action ? 5300 : 3300);
}
function openModal(id){
    const m = $(id);
    m.classList.remove('hidden');
    const first = m.querySelector('input[type="text"]');
    if (first && window.matchMedia('(hover:hover)').matches) setTimeout(() => first.focus(), 30);
}
function closeModal(id){
    $(id).classList.add('hidden');
    flushPendingRender();
}
function anyModalOpen(){ return !!document.querySelector('.modal-overlay:not(.hidden)'); }
function confirmDialog(opts, onOk){
    const { title = 'Eliminare?', msg = 'Questa azione non è reversibile.', ok = 'Elimina', danger = true } = opts || {};
    const t = $('confirmTitle');
    t.textContent = title;
    t.style.color = danger ? 'var(--danger)' : 'var(--accent)';
    $('confirmMsg').textContent = msg;
    const btn = $('confirmOkBtn');
    btn.textContent = ok;
    btn.className = 'btn ' + (danger ? 'btn-danger-solid' : 'btn-primary');
    btn.onclick = () => { closeModal('modalConfirm'); onOk(); };
    openModal('modalConfirm');
}

// ── Render "sicuro": non distruggere ciò che l'utente sta scrivendo ─────────
let _pendingRender = false, _renderDay = todayStr();
function isTyping(){
    const a = document.activeElement;
    if (!a) return false;
    return a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox','file','button'].includes(a.type));
}
function renderWhenIdle(){
    if (isTyping() || anyModalOpen()) { _pendingRender = true; return; }
    render();
}
function flushPendingRender(){
    setTimeout(() => {
        if (_pendingRender && !isTyping() && !anyModalOpen()) { _pendingRender = false; render(); }
    }, 60);
}

// ── Tema ────────────────────────────────────────────────────────────────────
function applyThemeIcon(){
    const b = $('themeBtn');
    if (b) b.textContent = document.body.classList.contains('light') ? '◐' : '○';
}
function toggleTheme(){
    document.body.classList.toggle('light');
    localStorage.setItem(THEME_KEY, document.body.classList.contains('light') ? 'light' : 'dark');
    applyThemeIcon();
}

// ── Navigazione ─────────────────────────────────────────────────────────────
function setSection(s){
    ui.section = s; saveUi();
    window.scrollTo(0, 0);
    render();
}
function setView(v){
    ui.view = v; saveUi();
    weekOffset = 0; selectedDayOffset = null; monthOffset = 0;
    renderTasks($('appContent'));
}
function render(){
    _pendingRender = false;
    _renderDay = todayStr();
    $('tabTasks').classList.toggle('active', ui.section === 'tasks');
    $('tabShop').classList.toggle('active', ui.section === 'shop');
    $('fabAdd').classList.toggle('hidden', ui.section !== 'tasks');
    const app = $('appContent');
    if (ui.section === 'shop') renderShop(app); else renderTasks(app);
    updateBadges();
}
function updateBadges(){
    const today = todayStr();
    const open = openTasks();
    const late = open.filter(t => t.date && t.date < today).length;
    const due = open.filter(t => t.date && t.date <= today).length;
    const bt = $('badgeTasks'), bs = $('badgeShop');
    if (bt) { bt.textContent = due || ''; bt.classList.toggle('alert', late > 0); bt.title = late ? `${late} in ritardo` : ''; }
    if (bs) { const n = data.shopItems.filter(i => i.need).length; bs.textContent = n || ''; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPEGNI
// ═══════════════════════════════════════════════════════════════════════════
function sortedCats(){ return [...data.taskCats].sort((a, b) => a.order - b.order); }
function getCat(id){ return id ? data.taskCats.find(c => c.id === id) || null : null; }
function getSub(cat, sid){ return cat && sid ? cat.subs.find(s => s.id === sid) || null : null; }
function findTask(id){ return data.tasks.find(t => t.id === id) || null; }
function openTasks(){ return data.tasks.filter(t => !t.done); }
function taskColor(t){
    if (t.urg === 3) return 'var(--danger)';
    if (t.urg === 2) return 'var(--warning)';
    const c = getCat(t.catId);
    return c ? c.color : 'var(--accent)';
}
function cmpUrgTime(a, b){
    if (a.urg !== b.urg) return b.urg - a.urg;
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    return a.title.localeCompare(b.title, 'it');
}
function cmpDateUrg(a, b){
    if (a.date !== b.date) {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    }
    return cmpUrgTime(a, b);
}

// ── Ricorrenze ──────────────────────────────────────────────────────────────
function addMonthsClamped(iso, n, dom){
    const d = parseLocalDate(iso);
    const y = d.getFullYear(), m = d.getMonth() + n;
    const last = new Date(y, m + 1, 0).getDate();
    return localDateStr(new Date(y, m, Math.min(dom, last)));
}
// Prossima occorrenza dopo "from". "anchor" = data di partenza della regola
// (serve per il giorno del mese e per l'allineamento "ogni 2 settimane").
function nextOcc(rec, from, anchor){
    const N = clamp(rec.every | 0, 1, 99);
    const anc = (!rec.fromDone && anchor) ? anchor : from;
    switch (rec.unit) {
        case 'day': return shiftDate(from, N);
        case 'week': {
            if (rec.days.length && !rec.fromDone) {
                const aMon = mondayOf(parseLocalDate(anc));
                for (let i = 1; i <= 7 * N + 7; i++) {
                    const ds = shiftDate(from, i), dd = parseLocalDate(ds);
                    const wk = Math.round((mondayOf(dd) - aMon) / (7 * DAY_MS));
                    if (((wk % N) + N) % N === 0 && rec.days.includes(isoDow(dd))) return ds;
                }
            }
            return shiftDate(from, 7 * N);
        }
        case 'month': return addMonthsClamped(from, N, parseLocalDate(anc).getDate());
        case 'year': return addMonthsClamped(from, 12 * N, parseLocalDate(anc).getDate());
    }
    return shiftDate(from, 1);
}
function recLabel(rec){
    if (!rec) return '';
    const N = rec.every;
    const names = { day:['ogni giorno','giorni'], week:['ogni settimana','settimane'], month:['ogni mese','mesi'], year:['ogni anno','anni'] }[rec.unit];
    let s = N === 1 ? names[0] : `ogni ${N} ${names[1]}`;
    if (rec.unit === 'week' && rec.days.length) s += ` (${rec.days.map(d => ISO_DOW_LABELS[d].toLowerCase()).join(', ')})`;
    if (rec.fromDone) s += ' dal completamento';
    return s;
}

// ── Indice per data (impegni reali + prossime occorrenze previste) ─────────
function buildIndex(from, to){
    const map = new Map();
    const push = (d, item) => { if (!map.has(d)) map.set(d, []); map.get(d).push(item); };
    openTasks().forEach(t => {
        if (t.date && t.date >= from && t.date <= to) push(t.date, { t, ghost:false });
        // Le ricorrenze "dal completamento" non si possono prevedere: si mostra solo la prossima
        if (t.rec && !t.rec.fromDone && t.date) {
            let occ = t.sched || t.date, guard = 0;
            while (guard++ < 600) {
                occ = nextOcc(t.rec, occ, t.anchor);
                if (occ > to) break;
                if (occ >= from && occ !== t.date && occ > t.date) push(occ, { t, ghost:true, date:occ });
            }
        }
    });
    map.forEach(list => list.sort((a, b) => (a.ghost - b.ghost) || cmpUrgTime(a.t, b.t)));
    return map;
}

// ── Schede ──────────────────────────────────────────────────────────────────
function taskMetaHtml(t, opts = {}){
    const parts = [];
    const today = todayStr();
    if (opts.showDate && t.date) {
        const late = t.date < today;
        parts.push(`<span class="${late ? 'm-late' : ''}">${late ? 'scaduto ' : ''}${escHtml(fmtRel(t.date))}${t.time ? ' ' + t.time : ''}</span>`);
    }
    if (opts.showCat !== false) {
        const c = getCat(t.catId), s = getSub(c, t.subId);
        if (c) parts.push(`<span>${escHtml(c.name)}${s ? ' › ' + escHtml(s.name) : ''}</span>`);
    }
    if (t.rec) parts.push(`<span>↻ ${escHtml(recLabel(t.rec))}</span>`);
    if (t.postponed > 0) parts.push(`<span class="m-post">rimandato ${t.postponed}×</span>`);
    return parts.length ? `<span class="task-meta">${parts.join('')}</span>` : '';
}
function taskCardHtml(t, opts = {}){
    const color = taskColor(t);
    const ghost = !!opts.ghost;
    const urgTag = t.urg > 1 ? `<span class="urg-tag" style="color:${color}">${URG_LABEL[t.urg]}</span>` : '';
    const open = ghost ? `openTaskSheet(${jsArg(t.id)},${jsArg(opts.ghostDate)})` : `openTaskSheet(${jsArg(t.id)})`;
    const check = t.done
        ? `<button class="task-check checked" onclick="reopenTask(${jsArg(t.id)})" title="Riapri" aria-label="Riapri">✓</button>`
        : `<button class="task-check" onclick="completeTask(${jsArg(t.id)})" title="Segna come fatto" aria-label="Segna come fatto"></button>`;
    return `<div class="task-card${ghost ? ' ghost' : ''}${t.done ? ' done' : ''}" style="border-left-color:${color}">
        ${check}
        <div class="task-body" onclick="${open}">
            ${t.time && !opts.hideTime ? `<span class="task-time">${t.time}</span>` : ''}
            <span class="task-name">${escHtml(t.title)}${urgTag}</span>
            ${taskMetaHtml(t, opts)}
        </div>
    </div>`;
}
function itemsHtml(items, empty = 'Niente in programma'){
    if (!items || !items.length) return `<div class="empty-note">${empty}</div>`;
    return items.map(it => taskCardHtml(it.t, it.ghost ? { ghost:true, ghostDate:it.date } : {})).join('');
}

// ── Schermata Impegni ───────────────────────────────────────────────────────
function renderTasks(app){
    const v = ui.view;
    const vb = (id, label) => `<button class="view-btn${v === id ? ' active' : ''}" onclick="setView('${id}')">${label}</button>`;
    app.innerHTML = `<div class="view-toggle">${vb('today','Oggi')}${vb('day','Giorno')}${vb('week','Settimana')}${vb('month','Mese')}${vb('list','Elenco')}</div>
        <div id="tasksArea"></div>`;
    renderTasksArea();
}
function renderTasksArea(){
    const area = $('tasksArea');
    if (!area) return;
    if (ui.view === 'today') renderToday(area);
    else if (ui.view === 'day') renderDayView(area);
    else if (ui.view === 'week') renderWeekView(area);
    else if (ui.view === 'month') renderMonthView(area);
    else renderListView(area);
}

// ── Oggi ────────────────────────────────────────────────────────────────────
function renderToday(area){
    const today = todayStr(), tomorrow = shiftDate(today, 1), now = new Date();
    const open = openTasks();
    const late = open.filter(t => t.date && t.date < today).sort(cmpDateUrg);
    const todays = open.filter(t => t.date === today).sort(cmpUrgTime);
    const undated = open.filter(t => !t.date).sort(cmpUrgTime);
    const tomorrows = open.filter(t => t.date === tomorrow).sort(cmpUrgTime);
    const often = open.filter(t => t.postponed >= 3).sort((a, b) => b.postponed - a.postponed);
    const summary = [];
    summary.push(`<b>${todays.length}</b> ${todays.length === 1 ? 'impegno' : 'impegni'} oggi`);
    if (late.length) summary.push(`<span class="late"><b style="color:var(--danger)">${late.length}</b> in ritardo</span>`);
    area.innerHTML = `
        <div class="today-head">
            <div><div class="today-date">${now.getDate()} ${MONTHS_IT[now.getMonth()]}</div><div class="today-dow">${DOW_FULL[now.getDay()]}</div></div>
            <div class="today-summary">${summary.join('<br>')}</div>
        </div>
        ${late.length + todays.length ? `<button class="imprevisto-btn" onclick="openImprevisto()">Imprevisto: rimanda a domani</button>` : ''}
        ${late.length ? `<div class="block"><div class="block-title late"><span>In ritardo</span><span class="count">${late.length}</span></div>
            ${late.map(t => taskCardHtml(t, { showDate:true })).join('')}</div>` : ''}
        <div class="block"><div class="block-title"><span>Oggi</span><span class="count">${todays.length || ''}</span></div>
            ${todays.length ? todays.map(t => taskCardHtml(t)).join('') : `<div class="empty-note">Niente in programma per oggi. Tocca + per aggiungere un impegno.</div>`}</div>
        ${tomorrows.length ? `<div class="block"><div class="block-title"><span>Domani</span><span class="count">${tomorrows.length}</span></div>
            ${tomorrows.map(t => taskCardHtml(t)).join('')}</div>` : ''}
        ${undated.length ? `<div class="block"><div class="block-title"><span>Quando capita</span><span class="count">${undated.length}</span></div>
            ${undated.map(t => taskCardHtml(t)).join('')}</div>` : ''}
        ${often.length ? `<div class="block"><div class="block-title late"><span>Rimandati spesso</span><span class="count">${often.length}</span></div>
            ${often.map(t => taskCardHtml(t, { showDate:true })).join('')}</div>` : ''}`;
}

// ── Giorno (striscia settimanale) ───────────────────────────────────────────
function weekDays(){
    const monday = mondayOf(new Date()); monday.setDate(monday.getDate() + weekOffset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); days.push(d); }
    return days;
}
function selectedDayIso(){
    const days = weekDays(), todayISO = todayStr();
    let idx = selectedDayOffset;
    if (idx === null) idx = weekOffset === 0 ? days.findIndex(d => localDateStr(d) === todayISO) : 0;
    return localDateStr(days[clamp(idx, 0, 6)]);
}
function renderDayView(area){
    const days = weekDays(), todayISO = todayStr();
    const selStr = selectedDayIso(), selDay = parseLocalDate(selStr);
    const idx = buildIndex(localDateStr(days[0]), localDateStr(days[6]));
    area.innerHTML = `<div class="gcal-wrapper">
        <div class="gcal-nav">
            <button class="gcal-arrow" onclick="changeWeek(-1)" aria-label="Settimana precedente">❮</button>
            <div class="gcal-nav-label">${MONTHS_IT[selDay.getMonth()]} ${selDay.getFullYear()}</div>
            <button class="gcal-arrow" onclick="changeWeek(1)" aria-label="Settimana successiva">❯</button>
        </div>
        <div class="gcal-weekstrip">${days.map((d, i) => {
            const ds = localDateStr(d);
            const dots = (idx.get(ds) || []).slice(0, 4).map(it => `<div class="gcal-dot" style="background:${taskColor(it.t)};${it.ghost ? 'opacity:.4' : ''}"></div>`).join('');
            return `<button class="gcal-day-btn${ds === selStr ? ' selected' : ''}${ds === todayISO ? ' today-marker' : ''}" onclick="selectDay(${i})">
                <span class="dow">${DOW_SHORT[d.getDay()]}</span><div class="dom">${d.getDate()}</div><div class="dot-row">${dots}</div></button>`;
        }).join('')}</div>
        <div class="gcal-day-events">
            <div class="gcal-date-header">${selDay.getDate()} ${MONTHS_IT[selDay.getMonth()]}, ${DOW_FULL[selDay.getDay()]}</div>
            ${itemsHtml(idx.get(selStr))}
        </div>
    </div>`;
}
function changeWeek(dir){ weekOffset += dir; selectedDayOffset = null; renderTasksArea(); }
function selectDay(i){ selectedDayOffset = i; renderTasksArea(); }

// ── Settimana ───────────────────────────────────────────────────────────────
function renderWeekView(area){
    const days = weekDays(), todayISO = todayStr();
    const idx = buildIndex(localDateStr(days[0]), localDateStr(days[6]));
    area.innerHTML = `<div class="gcal-wrapper"><div class="gcal-nav">
        <button class="gcal-arrow" onclick="changeWeek(-1)" aria-label="Settimana precedente">❮</button>
        <div class="gcal-nav-label">Dal ${days[0].getDate()}/${days[0].getMonth() + 1}</div>
        <button class="gcal-arrow" onclick="changeWeek(1)" aria-label="Settimana successiva">❯</button>
    </div><div style="padding:12px 12px 2px;">${days.map(d => {
        const ds = localDateStr(d);
        return `<div class="day-section"><div class="day-title${ds === todayISO ? ' today' : ''}">
            <span>${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0, 3)}</span>
            <span style="font-size:.68rem;opacity:.5;">${DOW_FULL[d.getDay()]}</span></div>
            ${itemsHtml(idx.get(ds), 'Libero')}</div>`;
    }).join('')}</div></div>`;
}

// ── Mese ────────────────────────────────────────────────────────────────────
function renderMonthView(area){
    const today = new Date(); today.setHours(0,0,0,0);
    const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = base.getFullYear(), month = base.getMonth(), todayISO = localDateStr(today);
    const firstDow = isoDow(base), dim = new Date(year, month + 1, 0).getDate();
    const cellsDates = [];
    for (let i = 1; i < firstDow; i++) cellsDates.push([new Date(year, month, 1 - (firstDow - i)), true]);
    for (let d = 1; d <= dim; d++) cellsDates.push([new Date(year, month, d), false]);
    while (cellsDates.length % 7) { const last = cellsDates[cellsDates.length - 1][0]; const n = new Date(last); n.setDate(n.getDate() + 1); cellsDates.push([n, true]); }
    const idx = buildIndex(localDateStr(cellsDates[0][0]), localDateStr(cellsDates[cellsDates.length - 1][0]));
    const cells = cellsDates.map(([d, other]) => {
        const ds = localDateStr(d), items = idx.get(ds) || [];
        const pills = items.slice(0, 3).map(it => `<div class="month-event-pill${it.ghost ? ' ghost' : ''}" style="background:${taskColor(it.t)}">${escHtml(it.t.title)}</div>`).join('');
        const extra = items.length > 3 ? `<div class="month-more">+${items.length - 3}</div>` : '';
        return `<div class="month-cell${other ? ' other-month' : ''}${ds === todayISO ? ' today-cell' : ''}" onclick="openDayFromDate('${ds}')"><div class="month-cell-num">${d.getDate()}</div>${pills}${extra}</div>`;
    }).join('');
    area.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <button class="gcal-arrow" onclick="changeMonth(-1)" aria-label="Mese precedente">❮</button>
        <div class="gcal-nav-label">${MONTHS_IT[month]} ${year}</div>
        <button class="gcal-arrow" onclick="changeMonth(1)" aria-label="Mese successivo">❯</button>
    </div>
    <div class="month-dow-header">${['L','M','M','G','V','S','D'].map(d => `<div class="month-dow-label">${d}</div>`).join('')}</div>
    <div class="month-grid">${cells}</div></div>`;
}
function changeMonth(dir){ monthOffset += dir; renderTasksArea(); }
function openDayFromDate(ds){
    const target = parseLocalDate(ds);
    weekOffset = Math.round((mondayOf(target) - mondayOf(new Date())) / (7 * DAY_MS));
    selectedDayOffset = isoDow(target) - 1;
    ui.view = 'day'; saveUi();
    renderTasks($('appContent'));
}

// ── Elenco per categoria ────────────────────────────────────────────────────
function renderListView(area){
    const open = openTasks();
    const cats = sortedCats();
    const catIds = new Set(cats.map(c => c.id));
    let html = '';
    const groupHtml = (title, color, tasks, subs) => {
        if (!tasks.length) return '';
        let inner = '';
        const subIds = new Set(subs.map(s => s.id));
        const loose = tasks.filter(t => !t.subId || !subIds.has(t.subId)).sort(cmpDateUrg);
        inner += loose.map(t => taskCardHtml(t, { showDate:true, showCat:false })).join('');
        subs.forEach(s => {
            const st = tasks.filter(t => t.subId === s.id).sort(cmpDateUrg);
            if (st.length) inner += `<div class="sub-head">${escHtml(s.name)}</div>` + st.map(t => taskCardHtml(t, { showDate:true, showCat:false })).join('');
        });
        return `<div class="cat-block"><div class="cat-head"><span class="cat-swatch" style="background:${color}"></span>${escHtml(title)}<span class="count">${tasks.length}</span></div>${inner}</div>`;
    };
    cats.forEach(c => { html += groupHtml(c.name, c.color, open.filter(t => t.catId === c.id), c.subs); });
    html += groupHtml('Senza categoria', 'var(--text-dim)', open.filter(t => !t.catId || !catIds.has(t.catId)), []);
    if (!html) html = `<div class="empty-note">Nessun impegno aperto. Tocca + per aggiungerne uno.</div>`;

    const done = data.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const doneHtml = done.length ? `<div class="block" style="margin-top:8px;">
        <div class="block-title"><button class="link-btn" onclick="toggleShowDone()">${ui.showDone ? '▾' : '▸'} Completati (${done.length})</button>
            ${ui.showDone ? `<button class="link-btn danger" onclick="clearDoneTasks()">Svuota</button>` : ''}</div>
        ${ui.showDone ? done.map(t => taskCardHtml(t, { showCat:true })).join('') : ''}</div>` : '';

    area.innerHTML = html + doneHtml + `<button class="btn btn-secondary" onclick="openCatsModal()">Gestisci categorie</button>`;
}
function toggleShowDone(){ ui.showDone = !ui.showDone; saveUi(); renderTasksArea(); }
function clearDoneTasks(){
    const n = data.tasks.filter(t => t.done).length;
    confirmDialog({ title:'Svuotare?', msg:`Elimino ${n} ${n === 1 ? 'impegno completato' : 'impegni completati'}. Quelli ricorrenti non vengono toccati.`, ok:'Svuota' }, () => {
        data.tasks = data.tasks.filter(t => !t.done);
        save(); renderTasksArea();
    });
}

// ── Azioni sugli impegni ────────────────────────────────────────────────────
function cloneTask(t){ return JSON.parse(JSON.stringify(t)); }
function restoreTask(snapshot){
    const i = data.tasks.findIndex(x => x.id === snapshot.id);
    if (i >= 0) data.tasks[i] = snapshot; else data.tasks.push(snapshot);
    save(); render();
}
// Calcola la prossima data "a calendario", saltando le occorrenze già passate
function nextFutureOcc(t){
    const today = todayStr();
    let next = nextOcc(t.rec, t.sched || t.date, t.anchor), guard = 0;
    while (next <= today && guard++ < 2000) next = nextOcc(t.rec, next, t.anchor);
    return next;
}
function completeTask(id){
    const t = findTask(id);
    if (!t) return;
    const before = cloneTask(t), today = todayStr();
    if (t.rec) {
        t.log = [today, ...t.log].slice(0, 20);
        const next = t.rec.fromDone ? nextOcc(t.rec, today, null) : nextFutureOcc(t);
        t.date = t.sched = next;
        t.postponed = 0;
        save(); closeModal('modalSheet'); render();
        showToast(`✓ Fatto. Prossima volta: ${fmtRel(next)}`, { label:'Annulla', fn:() => restoreTask(before) });
    } else {
        t.done = true; t.doneAt = today;
        save(); closeModal('modalSheet'); render();
        showToast('✓ Fatto', { label:'Annulla', fn:() => restoreTask(before) });
    }
}
function reopenTask(id){
    const t = findTask(id);
    if (!t) return;
    t.done = false; t.doneAt = null;
    save(); closeModal('modalSheet'); render();
    showToast('Impegno riaperto');
}
function skipTask(id){
    const t = findTask(id);
    if (!t || !t.rec) return;
    const before = cloneTask(t);
    const next = t.rec.fromDone ? nextOcc(t.rec, todayStr(), null) : nextFutureOcc(t);
    t.date = t.sched = next;
    t.postponed = 0;
    save(); closeModal('modalSheet'); render();
    showToast(`Saltato. Prossima volta: ${fmtRel(next)}`, { label:'Annulla', fn:() => restoreTask(before) });
}
function postponeTo(id, iso){
    const t = findTask(id);
    if (!t || !isIso(iso)) return;
    const before = cloneTask(t);
    t.date = iso;
    t.postponed++;
    // la data "a calendario" (sched) resta invariata: la ricorrenza non slitta
    save(); closeModal('modalSheet'); render();
    showToast(`Rimandato a ${fmtRel(iso)}`, { label:'Annulla', fn:() => restoreTask(before) });
}
function postponeBy(id, days){
    const t = findTask(id);
    if (!t) return;
    const today = todayStr();
    const base = t.date && t.date > today ? t.date : today;
    postponeTo(id, shiftDate(base, days));
}
function postponePicked(id){
    const v = $('sheetDate') && $('sheetDate').value;
    if (!isIso(v)) { showToast('⚠ Scegli una data'); return; }
    if (v < todayStr()) { showToast('⚠ La data è già passata'); return; }
    postponeTo(id, v);
}

// ── Foglio azioni (tocco su un impegno) ─────────────────────────────────────
function openTaskSheet(id, ghostDate){
    const t = findTask(id);
    if (!t) return;
    const c = getCat(t.catId), s = getSub(c, t.subId), today = todayStr();
    const rows = [];
    rows.push(['Quando', t.date ? escHtml(`${fmtRel(t.date)} (${fmtDate(t.date)})${t.time ? ', ore ' + t.time : ''}`) : 'Senza data']);
    if (t.date && t.date < today && !t.done) rows.push(['Stato', '<span style="color:var(--danger)">In ritardo</span>']);
    rows.push(['Categoria', c ? escHtml(c.name + (s ? ' › ' + s.name : '')) : 'Nessuna']);
    rows.push(['Urgenza', `<span style="color:${taskColor(t)}">${URG_LABEL[t.urg]}</span>`]);
    if (t.rec) rows.push(['Si ripete', escHtml(recLabel(t.rec))]);
    if (t.log.length) rows.push(['Ultima volta', escHtml(fmtDate(t.log[0]))]);
    if (t.postponed) rows.push(['Rimandato', `<span style="color:var(--warning)">${t.postponed} ${t.postponed === 1 ? 'volta' : 'volte'}</span>`]);
    if (t.done && t.doneAt) rows.push(['Fatto il', escHtml(fmtDate(t.doneAt))]);
    const a = jsArg(t.id);
    $('sheetBody').innerHTML = `
        <div class="sheet-name">${escHtml(t.title)}</div>
        ${ghostDate ? `<div class="sheet-info">Il ${escHtml(fmtDate(ghostDate))} è un'occorrenza prevista. I comandi qui sotto valgono per la prossima, ${escHtml(fmtRel(t.date))}.</div>` : ''}
        <div class="sheet-rows">${rows.map(([k, v]) => `<div class="sheet-row"><span>${k}</span><span>${v}</span></div>`).join('')}</div>
        ${t.notes ? `<div class="sheet-note">${escHtml(t.notes)}</div>` : ''}
        ${t.done ? `<button class="btn btn-primary" onclick="reopenTask(${a})">Riapri</button>` : `
            <button class="btn btn-primary" onclick="completeTask(${a})">✓ Fatto</button>
            <div class="field-label">Rimanda</div>
            <div class="postpone-grid">
                <button class="btn btn-secondary" onclick="postponeBy(${a},1)">+1 giorno</button>
                <button class="btn btn-secondary" onclick="postponeBy(${a},3)">+3 giorni</button>
                <button class="btn btn-secondary" onclick="postponeBy(${a},7)">+1 settimana</button>
                <button class="btn btn-secondary" onclick="$('sheetPick').classList.toggle('hidden')">Scegli data</button>
            </div>
            <div id="sheetPick" class="hidden field-row" style="margin-top:8px;">
                <input type="date" id="sheetDate" min="${today}" value="${shiftDate(today, 1)}" style="margin-bottom:0;">
                <button class="add-btn" style="flex:0 0 auto;" onclick="postponePicked(${a})">Rimanda</button>
            </div>
            ${t.rec ? `<button class="btn btn-secondary" onclick="skipTask(${a})">Salta questa volta</button>` : ''}`}
        <div class="modal-btns" style="margin-top:9px;">
            <button class="btn btn-secondary" onclick="closeModal('modalSheet');openTaskModal(${a})">Modifica</button>
            <button class="btn btn-secondary" onclick="closeModal('modalSheet')">Chiudi</button>
        </div>`;
    openModal('modalSheet');
}

// ── Imprevisto ──────────────────────────────────────────────────────────────
function openImprevisto(){
    const today = todayStr();
    const due = openTasks().filter(t => t.date && t.date <= today);
    const soft = due.filter(t => t.urg < 3);
    $('imprevistoBody').innerHTML = `
        <div class="modal-title" style="color:var(--danger);">Imprevisto</div>
        <p class="confirm-msg">Sposto a domani gli impegni di oggi e quelli in ritardo. La loro ricorrenza non cambia.</p>
        <button class="btn btn-primary" onclick="applyImprevisto(false)">Tutti (${due.length})</button>
        <button class="btn btn-secondary" onclick="applyImprevisto(true)" ${soft.length && soft.length !== due.length ? '' : 'disabled'}>Solo i non urgenti (${soft.length})</button>
        <button class="btn btn-secondary" onclick="closeModal('modalImprevisto')">Annulla</button>`;
    openModal('modalImprevisto');
}
function applyImprevisto(onlySoft){
    const today = todayStr(), tomorrow = shiftDate(today, 1);
    const list = openTasks().filter(t => t.date && t.date <= today && (!onlySoft || t.urg < 3));
    if (!list.length) { closeModal('modalImprevisto'); return; }
    const before = list.map(cloneTask);
    list.forEach(t => { t.date = tomorrow; t.postponed++; });
    save(); closeModal('modalImprevisto'); render();
    showToast(`${list.length} ${list.length === 1 ? 'impegno spostato' : 'impegni spostati'} a domani`, {
        label:'Annulla', fn:() => { before.forEach(b => { const i = data.tasks.findIndex(x => x.id === b.id); if (i >= 0) data.tasks[i] = b; }); save(); render(); }
    });
}

// ── Modulo nuovo / modifica impegno ─────────────────────────────────────────
let editingTaskId = null, formUrg = 1, formDays = [];
function fillCatSelect(selected){
    $('tCat').innerHTML = `<option value="">Senza categoria</option>` +
        sortedCats().map(c => `<option value="${escHtml(c.id)}"${c.id === selected ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('');
}
function fillSubSelect(selected){
    const c = getCat($('tCat').value);
    const sel = $('tSub');
    if (!c || !c.subs.length) { sel.innerHTML = ''; sel.classList.add('hidden'); return; }
    sel.classList.remove('hidden');
    sel.innerHTML = `<option value="">Generale</option>` +
        c.subs.map(s => `<option value="${escHtml(s.id)}"${s.id === selected ? ' selected' : ''}>${escHtml(s.name)}</option>`).join('');
}
function renderFormUrg(){
    const colors = { 1:'var(--accent)', 2:'var(--warning)', 3:'var(--danger)' };
    $('tUrg').innerHTML = [1, 2, 3].map(n => `<div class="t-dot${formUrg === n ? ' active' : ''}" style="background:${colors[n]}" onclick="setFormUrg(${n})">${URG_LABEL[n]}</div>`).join('');
}
function setFormUrg(n){ formUrg = n; renderFormUrg(); }
function setTaskDateQuick(n){
    $('tDate').value = n === null ? '' : shiftDate(todayStr(), n);
    if (n === null && $('tRecUnit').value) showToast('Gli impegni ricorrenti hanno bisogno di una data');
    updateRecUI();
}
function toggleFormDay(d){
    formDays = formDays.includes(d) ? formDays.filter(x => x !== d) : [...formDays, d].sort((a, b) => a - b);
    updateRecUI();
}
function formRec(){
    const unit = $('tRecUnit').value;
    if (!unit) return null;
    const fromDone = $('tRecFromDone').checked;
    return normRec({ unit, every:$('tRecEvery').value, days:formDays, fromDone });
}
function updateRecUI(){
    const unit = $('tRecUnit').value, fromDone = $('tRecFromDone').checked;
    $('tRecEvery').classList.toggle('hidden', !unit);
    $('tRecFromDoneRow').classList.toggle('hidden', !unit);
    const daysBox = $('tRecDays');
    if (unit === 'week' && !fromDone) {
        daysBox.classList.remove('hidden');
        daysBox.innerHTML = [1,2,3,4,5,6,7].map(d => `<button type="button" class="chip${formDays.includes(d) ? ' on' : ''}" onclick="toggleFormDay(${d})">${ISO_DOW_LABELS[d]}</button>`).join('');
    } else { daysBox.classList.add('hidden'); daysBox.innerHTML = ''; }
    const rec = formRec();
    let hint = '';
    if (rec) {
        hint = 'Si ripete ' + recLabel(rec);
        if (!$('tDate').value) hint += ', a partire da oggi';
        if (rec.fromDone) hint += ': la prossima data si calcola quando lo segni come fatto.';
    }
    $('tRecHint').textContent = hint;
}
function openTaskModal(id){
    const t = id ? findTask(id) : null;
    editingTaskId = t ? t.id : null;
    $('taskModalTitle').textContent = t ? 'Modifica impegno' : 'Nuovo impegno';
    $('tTitle').value = t ? t.title : '';
    fillCatSelect(t ? t.catId : '');
    fillSubSelect(t ? t.subId : '');
    formUrg = t ? t.urg : 1;
    renderFormUrg();
    let defDate = todayStr();
    if (!t && ui.section === 'tasks' && ui.view === 'day') defDate = selectedDayIso();
    $('tDate').value = t ? (t.date || '') : defDate;
    $('tTime').value = t && t.time ? t.time : '';
    $('tRecUnit').value = t && t.rec ? t.rec.unit : '';
    $('tRecEvery').value = t && t.rec ? t.rec.every : 1;
    $('tRecFromDone').checked = !!(t && t.rec && t.rec.fromDone);
    formDays = t && t.rec ? [...t.rec.days] : [];
    $('tNotes').value = t ? t.notes : '';
    $('tDeleteBtn').classList.toggle('hidden', !t);
    updateRecUI();
    openModal('modalTask');
}
function saveTask(){
    const title = $('tTitle').value.trim();
    if (!title) { showToast('⚠ Scrivi cosa c\'è da fare'); $('tTitle').focus(); return; }
    const rec = formRec();
    let date = isIso($('tDate').value) ? $('tDate').value : null;
    if (rec && !date) date = todayStr();
    // Settimanale con giorni scelti: la prima data deve cadere in uno di quei giorni
    if (rec && rec.unit === 'week' && rec.days.length && !rec.days.includes(isoDow(parseLocalDate(date)))) {
        date = nextOcc(rec, shiftDate(date, -1), date);
    }
    const catId = $('tCat').value || null;
    const subId = catId && !$('tSub').classList.contains('hidden') ? ($('tSub').value || null) : null;
    const fields = { title, catId, subId, urg:formUrg, date, time:parseTimeInput($('tTime').value), notes:$('tNotes').value.trim(), rec };
    if (editingTaskId) {
        const t = findTask(editingTaskId);
        if (!t) { closeModal('modalTask'); return; }
        const schedChanged = t.date !== date || JSON.stringify(t.rec) !== JSON.stringify(rec);
        Object.assign(t, fields);
        if (schedChanged) { t.sched = date; t.anchor = date; }
        if (rec) { t.done = false; t.doneAt = null; }
    } else {
        data.tasks.push({ id:uid(), ...fields, sched:date, anchor:date, postponed:0, log:[], done:false, doneAt:null, created:Date.now() });
    }
    save(); closeModal('modalTask'); render();
    showToast(editingTaskId ? 'Impegno aggiornato' : 'Impegno aggiunto');
    editingTaskId = null;
}
function deleteTaskFromModal(){
    const t = findTask(editingTaskId);
    if (!t) return;
    confirmDialog({ title:'Eliminare?', msg:`“${t.title}” verrà eliminato${t.rec ? ', con tutte le sue ripetizioni' : ''}.` }, () => {
        const before = cloneTask(t);
        data.tasks = data.tasks.filter(x => x.id !== t.id);
        editingTaskId = null;
        save(); closeModal('modalTask'); render();
        showToast('Impegno eliminato', { label:'Annulla', fn:() => restoreTask(before) });
    });
}

// ── Gestione categorie ──────────────────────────────────────────────────────
function openCatsModal(){ renderCatsBody(); openModal('modalCats'); }
function renderCatsBody(){
    const cats = sortedCats();
    $('catsBody').innerHTML = cats.map((c, i) => {
        const a = jsArg(c.id);
        return `<div class="mg-cat">
            <div class="mg-row">
                <button class="mg-swatch" style="background:${c.color}" onclick="cycleCatColor(${a})" title="Cambia colore" aria-label="Cambia colore"></button>
                <input type="text" value="${escHtml(c.name)}" maxlength="40" onchange="renameCat(${a},this.value)" aria-label="Nome categoria">
                <button class="mg-btn" onclick="moveCat(${a},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">▲</button>
                <button class="mg-btn" onclick="moveCat(${a},1)" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">▼</button>
                <button class="mg-btn danger" onclick="deleteCat(${a})" aria-label="Elimina">✕</button>
            </div>
            <div class="mg-subs">
                ${c.subs.map(s => `<div class="mg-row">
                    <input type="text" value="${escHtml(s.name)}" maxlength="40" onchange="renameSub(${a},${jsArg(s.id)},this.value)" aria-label="Nome sottocategoria">
                    <button class="mg-btn danger" onclick="deleteSub(${a},${jsArg(s.id)})" aria-label="Elimina">✕</button></div>`).join('')}
                <div class="mg-row"><input type="text" id="newSub_${escHtml(c.id)}" placeholder="+ sottocategoria" maxlength="40" onkeydown="if(event.key==='Enter'){event.preventDefault();addSub(${a});}">
                    <button class="mg-btn" onclick="addSub(${a})" aria-label="Aggiungi sottocategoria">+</button></div>
            </div>
        </div>`;
    }).join('') + `<div class="mg-row" style="margin-top:14px;">
        <input type="text" id="newCatName" placeholder="Nuova categoria" maxlength="40" onkeydown="if(event.key==='Enter'){event.preventDefault();addCat();}">
        <button class="add-btn" onclick="addCat()">Aggiungi</button></div>`;
}
function catsChanged(){ save(); renderCatsBody(); _pendingRender = true; }
function addCat(){
    const name = $('newCatName').value.trim();
    if (!name) return;
    const maxO = data.taskCats.reduce((m, c) => Math.max(m, c.order), -1);
    data.taskCats.push({ id:uid(), name, color:CAT_COLORS[data.taskCats.length % CAT_COLORS.length], order:maxO + 1, subs:[] });
    catsChanged();
}
function renameCat(id, v){
    const c = getCat(id); v = String(v).trim();
    if (!c || !v) return;
    c.name = v; save(); _pendingRender = true;
}
function cycleCatColor(id){
    const c = getCat(id);
    if (!c) return;
    c.color = CAT_COLORS[(CAT_COLORS.indexOf(c.color) + 1) % CAT_COLORS.length];
    catsChanged();
}
function moveCat(id, dir){
    const cats = sortedCats(), i = cats.findIndex(c => c.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    cats.forEach((c, k) => { if (c.order !== k) c.order = k; });
    catsChanged();
}
function deleteCat(id){
    const c = getCat(id);
    if (!c) return;
    const n = data.tasks.filter(t => t.catId === id).length;
    confirmDialog({ title:'Eliminare?', msg:`La categoria “${c.name}” verrà eliminata.${n ? ` I suoi ${n} impegni restano, senza categoria.` : ''}` }, () => {
        data.tasks.forEach(t => { if (t.catId === id) { t.catId = null; t.subId = null; } });
        data.taskCats = data.taskCats.filter(x => x.id !== id);
        catsChanged();
    });
}
function addSub(catId){
    const c = getCat(catId), inp = $('newSub_' + catId);
    if (!c || !inp) return;
    const name = inp.value.trim();
    if (!name) return;
    c.subs.push({ id:uid(), name });
    catsChanged();
    const again = $('newSub_' + catId);
    if (again) again.focus();
}
function renameSub(catId, subId, v){
    const s = getSub(getCat(catId), subId); v = String(v).trim();
    if (!s || !v) return;
    s.name = v; save(); _pendingRender = true;
}
function deleteSub(catId, subId){
    const c = getCat(catId);
    if (!c) return;
    data.tasks.forEach(t => { if (t.catId === catId && t.subId === subId) t.subId = null; });
    c.subs = c.subs.filter(s => s.id !== subId);
    catsChanged();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SPESA
// ═══════════════════════════════════════════════════════════════════════════
function sortedShopCats(){ return [...data.shopCats].sort((a, b) => a.order - b.order); }
function getShopCat(id){ return id ? data.shopCats.find(c => c.id === id) || null : null; }
function itemsOf(catId){
    return data.shopItems.filter(i => i.catId === catId).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
function orphanItems(){
    const ids = new Set(data.shopCats.map(c => c.id));
    return data.shopItems.filter(i => !i.catId || !ids.has(i.catId)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
// Sezioni per stampa / Doc / messaggio: solo prodotti spuntati, nell'ordine dei reparti
function neededSections(){
    const out = [];
    sortedShopCats().forEach(c => {
        const items = itemsOf(c.id).filter(i => i.need);
        if (items.length) out.push({ name:c.name, items });
    });
    const orph = orphanItems().filter(i => i.need);
    if (orph.length) out.push({ name:'Altro', items:orph });
    return out;
}

function renderShop(app){
    const cats = sortedShopCats();
    const n = data.shopItems.filter(i => i.need).length;
    const lastCat = getShopCat(ui.lastShopCat) ? ui.lastShopCat : (cats[0] && cats[0].id);
    app.innerHTML = `
        <div class="shop-head"><span class="shop-count-num" id="shopCount">${n}</span><span class="shop-count-label">da comprare</span></div>
        <div class="shop-actions">
            <button class="btn btn-primary" onclick="printShopping()">Stampa / PDF</button>
            <button class="btn btn-secondary" id="docBtn" onclick="createShoppingDoc()">Google Doc</button>
            <button class="btn btn-secondary" onclick="shareShopping()">Invia</button>
        </div>
        <div class="shop-toolbar">
            <div class="seg">
                <button class="${ui.shopFilter === 'all' ? 'on' : ''}" onclick="setShopFilter('all')">Tutti</button>
                <button class="${ui.shopFilter === 'need' ? 'on' : ''}" onclick="setShopFilter('need')">Da comprare</button>
            </div>
            <button class="link-btn" onclick="clearShopping()">Spesa fatta</button>
        </div>
        <div class="shop-add">
            <input type="text" id="shopQuery" placeholder="Cerca o aggiungi un prodotto" maxlength="80" autocomplete="off"
                oninput="renderShopList()" onkeydown="if(event.key==='Enter'){event.preventDefault();quickAddShop();}">
            <select class="styled-select" id="shopAddCat" aria-label="Reparto" onchange="ui.lastShopCat=this.value;saveUi();">
                ${cats.map(c => `<option value="${escHtml(c.id)}"${c.id === lastCat ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('')}
            </select>
            <button class="add-btn" onclick="quickAddShop()">Aggiungi</button>
        </div>
        <div id="shopList"></div>
        <button class="btn btn-secondary" onclick="openShopCatsModal()">Gestisci reparti</button>`;
    renderShopList();
}
function shopItemHtml(i){
    return `<div class="shop-item${i.need ? ' on' : ''}" onclick="toggleNeed(${jsArg(i.id)})" role="checkbox" aria-checked="${i.need}">
        <span class="shop-box"></span>
        <span class="shop-name">${escHtml(i.name)}</span>
        ${i.qty ? `<span class="shop-qty">${escHtml(i.qty)}</span>` : ''}
        <button class="shop-edit" onclick="event.stopPropagation();openShopItem(${jsArg(i.id)})" aria-label="Modifica ${escHtml(i.name)}">⋯</button>
    </div>`;
}
function renderShopList(){
    const box = $('shopList');
    if (!box) return;
    const q = normName($('shopQuery') ? $('shopQuery').value : '');
    const onlyNeed = ui.shopFilter === 'need';
    const groups = sortedShopCats().map(c => ({ c, items:itemsOf(c.id) }));
    const orph = orphanItems();
    if (orph.length) groups.push({ c:{ id:'__orphan', name:'Altro' }, items:orph });
    let html = '';
    groups.forEach(({ c, items }) => {
        const total = items.length, needN = items.filter(i => i.need).length;
        let shown = items;
        if (onlyNeed) shown = shown.filter(i => i.need);
        if (q) shown = shown.filter(i => normName(i.name).includes(q));
        if (!shown.length && (q || onlyNeed)) return;
        const collapsed = !q && !!ui.collapsed[c.id];
        html += `<section class="shop-cat${collapsed ? ' collapsed' : ''}">
            <div class="shop-cat-head" onclick="toggleShopCat(${jsArg(c.id)})">
                <span class="chev">▾</span><span class="shop-cat-name">${escHtml(c.name)}</span>
                <span class="shop-cat-count">${needN ? `<b>${needN}</b> / ` : ''}${total}</span>
            </div>
            ${collapsed ? '' : (shown.length ? shown.map(shopItemHtml).join('') : `<div class="empty-note">Nessun prodotto in questo reparto.</div>`)}
        </section>`;
    });
    const raw = $('shopQuery') ? $('shopQuery').value.trim() : '';
    const exact = q && data.shopItems.some(i => normName(i.name) === q);
    if (raw && !exact) {
        const cat = getShopCat($('shopAddCat') && $('shopAddCat').value);
        html = `<div class="shop-new" onclick="quickAddShop()">+ Aggiungi “${escHtml(raw)}”${cat ? ` in ${escHtml(cat.name)}` : ''}</div>` + html;
    }
    if (!html) html = onlyNeed
        ? `<div class="empty-note">Non hai ancora spuntato niente. Passa a “Tutti” e tocca ciò che serve.</div>`
        : `<div class="empty-note">Il catalogo è vuoto. Scrivi un prodotto qui sopra per aggiungerlo.</div>`;
    box.innerHTML = html;
}
function refreshShopCounts(){
    const n = data.shopItems.filter(i => i.need).length;
    const el = $('shopCount');
    if (el) el.textContent = n;
}
function toggleNeed(id){
    const it = data.shopItems.find(i => i.id === id);
    if (!it) return;
    it.need = !it.need;
    save(); renderShopList(); refreshShopCounts();
}
function toggleShopCat(id){
    if (ui.collapsed[id]) delete ui.collapsed[id]; else ui.collapsed[id] = true;
    saveUi(); renderShopList();
}
function setShopFilter(f){ ui.shopFilter = f; saveUi(); renderShop($('appContent')); }
function quickAddShop(){
    const inp = $('shopQuery');
    const name = inp ? inp.value.trim() : '';
    if (!name) { if (inp) inp.focus(); return; }
    const existing = data.shopItems.find(i => normName(i.name) === normName(name));
    if (existing) {
        existing.need = true;
        showToast(`“${existing.name}” segnato da comprare`);
    } else {
        let catId = $('shopAddCat') ? $('shopAddCat').value : null;
        if (!getShopCat(catId)) catId = null;
        data.shopItems.push({ id:uid(), catId, name:name.charAt(0).toUpperCase() + name.slice(1), need:true, qty:'' });
        if (catId) delete ui.collapsed[catId];
        showToast(`“${name}” aggiunto`);
    }
    inp.value = '';
    save(); renderShopList(); refreshShopCounts();
}
function clearShopping(){
    const n = data.shopItems.filter(i => i.need).length;
    if (!n) { showToast('Non c\'è niente da azzerare'); return; }
    confirmDialog({ title:'Spesa fatta?', msg:`Tolgo la spunta e la quantità da ${n} ${n === 1 ? 'prodotto' : 'prodotti'}. Il catalogo resta com'è.`, ok:'Azzera', danger:false }, () => {
        const before = data.shopItems.filter(i => i.need).map(i => ({ id:i.id, qty:i.qty }));
        data.shopItems.forEach(i => { if (i.need) { i.need = false; i.qty = ''; } });
        save(); render();
        showToast('Lista azzerata', { label:'Annulla', fn:() => {
            before.forEach(b => { const it = data.shopItems.find(i => i.id === b.id); if (it) { it.need = true; it.qty = b.qty; } });
            save(); render();
        } });
    });
}

// ── Modifica prodotto ───────────────────────────────────────────────────────
let editingItemId = null;
function openShopItem(id){
    const it = data.shopItems.find(i => i.id === id);
    if (!it) return;
    editingItemId = id;
    $('siName').value = it.name;
    $('siQty').value = it.qty;
    $('siNeed').checked = it.need;
    $('siCat').innerHTML = sortedShopCats().map(c => `<option value="${escHtml(c.id)}"${c.id === it.catId ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('')
        + (getShopCat(it.catId) ? '' : `<option value="" selected>Altro (senza reparto)</option>`);
    openModal('modalShopItem');
}
function saveShopItem(){
    const it = data.shopItems.find(i => i.id === editingItemId);
    if (!it) { closeModal('modalShopItem'); return; }
    const name = $('siName').value.trim();
    if (!name) { showToast('⚠ Il nome non può essere vuoto'); return; }
    const dup = data.shopItems.find(i => i.id !== it.id && normName(i.name) === normName(name));
    if (dup) { showToast(`⚠ “${dup.name}” esiste già`); return; }
    const qty = $('siQty').value.trim();
    // Scrivere (o cambiare) una quantità significa che il prodotto serve
    it.need = $('siNeed').checked || (!!qty && qty !== it.qty);
    it.name = name;
    it.qty = qty;
    it.catId = $('siCat').value || null;
    save(); closeModal('modalShopItem'); render();
}
function deleteShopItem(){
    const it = data.shopItems.find(i => i.id === editingItemId);
    if (!it) return;
    confirmDialog({ title:'Eliminare?', msg:`“${it.name}” sparisce dal catalogo.` }, () => {
        data.shopItems = data.shopItems.filter(i => i.id !== it.id);
        save(); closeModal('modalShopItem'); render();
    });
}

// ── Gestione reparti ────────────────────────────────────────────────────────
function openShopCatsModal(){ renderShopCatsBody(); openModal('modalShopCats'); }
function renderShopCatsBody(){
    const cats = sortedShopCats();
    $('shopCatsBody').innerHTML = cats.map((c, i) => {
        const a = jsArg(c.id), n = data.shopItems.filter(x => x.catId === c.id).length;
        return `<div class="mg-cat"><div class="mg-row">
            <input type="text" value="${escHtml(c.name)}" maxlength="40" onchange="renameShopCat(${a},this.value)" aria-label="Nome reparto">
            <span style="font-size:.7rem;color:var(--text-dim);min-width:22px;text-align:right;">${n}</span>
            <button class="mg-btn" onclick="moveShopCat(${a},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">▲</button>
            <button class="mg-btn" onclick="moveShopCat(${a},1)" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">▼</button>
            <button class="mg-btn danger" onclick="deleteShopCat(${a})" aria-label="Elimina">✕</button>
        </div></div>`;
    }).join('') + `<div class="mg-row" style="margin-top:14px;">
        <input type="text" id="newShopCat" placeholder="Nuovo reparto" maxlength="40" onkeydown="if(event.key==='Enter'){event.preventDefault();addShopCat();}">
        <button class="add-btn" onclick="addShopCat()">Aggiungi</button></div>`;
}
function shopCatsChanged(){ save(); renderShopCatsBody(); _pendingRender = true; }
function addShopCat(){
    const name = $('newShopCat').value.trim();
    if (!name) return;
    const maxO = data.shopCats.reduce((m, c) => Math.max(m, c.order), -1);
    data.shopCats.push({ id:uid(), name, order:maxO + 1 });
    shopCatsChanged();
}
function renameShopCat(id, v){
    const c = getShopCat(id); v = String(v).trim();
    if (!c || !v) return;
    c.name = v; save(); _pendingRender = true;
}
function moveShopCat(id, dir){
    const cats = sortedShopCats(), i = cats.findIndex(c => c.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    cats.forEach((c, k) => { if (c.order !== k) c.order = k; });
    shopCatsChanged();
}
function deleteShopCat(id){
    const c = getShopCat(id);
    if (!c) return;
    const n = data.shopItems.filter(i => i.catId === id).length;
    confirmDialog({ title:'Eliminare?', msg:`Il reparto “${c.name}” verrà eliminato${n ? ` insieme ai suoi ${n} prodotti` : ''}.` }, () => {
        data.shopItems = data.shopItems.filter(i => i.catId !== id);
        data.shopCats = data.shopCats.filter(x => x.id !== id);
        if (ui.lastShopCat === id) { ui.lastShopCat = null; saveUi(); }
        shopCatsChanged();
    });
}

// ── Stampa / PDF ────────────────────────────────────────────────────────────
function listTitleDate(){
    const d = new Date();
    return `${DOW_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}
function countNeeded(sections){ return sections.reduce((n, s) => n + s.items.length, 0); }
function printShopping(){
    const sections = neededSections();
    if (!sections.length) { showToast('⚠ Spunta almeno un prodotto'); return; }
    const n = countNeeded(sections);
    $('printArea').innerHTML = `
        <div class="p-title">Lista della spesa</div>
        <div class="p-meta">${escHtml(listTitleDate())}, ${n} ${n === 1 ? 'prodotto' : 'prodotti'}</div>
        <div class="p-cols">${sections.map(s => `<div class="p-sec"><h2>${escHtml(s.name)}</h2><ul>
            ${s.items.map(i => `<li><span>${escHtml(i.name)}${i.qty ? ` <i>(${escHtml(i.qty)})</i>` : ''}</span></li>`).join('')}
        </ul></div>`).join('')}</div>`;
    // piccolo ritardo: lascia al browser il tempo di impaginare l'area di stampa
    setTimeout(() => window.print(), 80);
}

// ── Invia come messaggio (WhatsApp o altre app) ─────────────────────────────
function shoppingText(sections){
    const d = new Date();
    let txt = `🛒 *Lista della spesa* (${DOW_SHORT[d.getDay()].toLowerCase()} ${d.getDate()}/${d.getMonth() + 1})\n`;
    sections.forEach(s => {
        txt += `\n*${s.name}*\n` + s.items.map(i => `▢ ${i.name}${i.qty ? ` (${i.qty})` : ''}`).join('\n') + '\n';
    });
    return txt.trim();
}
function openWhatsApp(text){
    // niente 'noopener' tra le opzioni: farebbe restituire sempre null a window.open
    const w = window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    if (w) { try { w.opener = null; } catch (_) {} }
    else copyText(text, 'Testo copiato: incollalo su WhatsApp');
}
function copyText(text, okMsg){
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast(okMsg), () => showToast('⚠ Copia non riuscita'));
    } else showToast('⚠ Copia non disponibile su questo browser');
}
function shareShopping(){
    const sections = neededSections();
    if (!sections.length) { showToast('⚠ Spunta almeno un prodotto'); return; }
    const text = shoppingText(sections);
    // Sul telefono si apre il pannello di condivisione (WhatsApp, Telegram, email…)
    if (navigator.share) {
        navigator.share({ title:'Lista della spesa', text }).catch(err => { if (err && err.name !== 'AbortError') openWhatsApp(text); });
    } else openWhatsApp(text);
}

// ── Google Doc (tramite lo stesso Apps Script della sync) ──────────────────
let lastDocUrl = '', docBusy = false;
async function createShoppingDoc(){
    const sections = neededSections();
    if (!sections.length) { showToast('⚠ Spunta almeno un prodotto'); return; }
    if (!syncUrl) { showToast('Collega prima lo script Google'); openSyncModal(); return; }
    if (!navigator.onLine) { showToast('⚠ Sei offline: usa Stampa / PDF o Invia'); return; }
    if (docBusy) return;
    docBusy = true;
    const btn = $('docBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creo…'; }
    const d = new Date();
    const payload = {
        kind:'doc',
        title:`Lista spesa ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,
        subtitle:`${listTitleDate()}, ${countNeeded(sections)} prodotti`,
        sections:sections.map(s => ({ name:s.name, items:s.items.map(i => i.name + (i.qty ? ` (${i.qty})` : '')) })),
    };
    try {
        const res = await fetch(`${syncUrl}?action=doc`, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify(payload) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let j = null;
        try { j = await res.json(); } catch (_) { throw new Error('risposta non valida'); }
        if (!j || !j.ok || !j.url) throw new Error((j && j.error) || 'documento non creato (script aggiornato?)');
        lastDocUrl = j.url;
        $('docBody').innerHTML = `
            <div class="modal-title">Documento pronto</div>
            <p class="confirm-msg">È nel tuo Google Drive, nella cartella “Casa Hub - Liste spesa”. Le liste più vecchie di 60 giorni finiscono nel cestino da sole.</p>
            <a class="btn btn-primary" href="${escHtml(j.url)}" target="_blank" rel="noopener">Apri e stampa</a>
            <button class="btn btn-secondary" onclick="shareDocLink()">Invia il link</button>
            <button class="btn btn-secondary" onclick="closeModal('modalDoc')">Chiudi</button>`;
        openModal('modalDoc');
    } catch (e) {
        showToast('⚠ Google Doc: ' + (e.message || 'errore'));
    } finally {
        docBusy = false;
        const b = $('docBtn');
        if (b) { b.disabled = false; b.textContent = 'Google Doc'; }
    }
}
function shareDocLink(){
    if (!lastDocUrl) return;
    if (navigator.share) {
        navigator.share({ title:'Lista della spesa', url:lastDocUrl }).catch(err => { if (err && err.name !== 'AbortError') openWhatsApp(lastDocUrl); });
    } else openWhatsApp('Lista della spesa: ' + lastDocUrl);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SYNC, BACKUP, SCRIPT
// ═══════════════════════════════════════════════════════════════════════════
const APPS_SCRIPT_CODE = `// Casa Hub — Apps Script v1 (sync + liste della spesa in Google Docs)
// Crealo da un Foglio Google tutto suo: Estensioni → Apps Script.
const SHEET_NAME = 'CasaHub';
const CHUNK = 45000;
const FOLDER_NAME = 'Casa Hub - Liste spesa';
const KEEP_DAYS = 60; // le liste più vecchie finiscono nel cestino

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'read') {
    const sheet = getSheet();
    const last = sheet.getLastRow();
    if (last < 1) return out('{}');
    const txt = sheet.getRange(1, 1, last, 1).getValues()
      .map(function (r) { const v = String(r[0]); return v.charAt(0) === '~' ? v.slice(1) : v; })
      .join('');
    return out(txt || '{}');
  }
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  if (e && e.parameter && e.parameter.action === 'doc') return createShoppingDoc(e);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = e.postData.contents;
    const obj = JSON.parse(body);
    // protezione: scrive solo dati di Casa Hub, mai una richiesta di documento
    if (!obj || obj.kind === 'doc' || !Array.isArray(obj.tasks)) throw new Error('dati non validi');
    const sheet = getSheet();
    const rows = [];
    for (let i = 0; i < body.length; i += CHUNK) rows.push(['~' + body.substring(i, i + CHUNK)]);
    sheet.clearContents();
    const range = sheet.getRange(1, 1, rows.length, 1);
    range.setNumberFormat('@');
    range.setValues(rows);
    return out(JSON.stringify({ ok: true, chunks: rows.length }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  } finally {
    lock.releaseLock();
  }
}

function createShoppingDoc(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const doc = DocumentApp.create(p.title || 'Lista della spesa');
    const body = doc.getBody();
    body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);
    const first = body.getParagraphs()[0];
    first.setText(p.title || 'Lista della spesa');
    first.setHeading(DocumentApp.ParagraphHeading.TITLE);
    if (p.subtitle) body.appendParagraph(p.subtitle).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
    (p.sections || []).forEach(function (s) {
      body.appendParagraph(String(s.name)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      (s.items || []).forEach(function (it) {
        body.appendParagraph('☐  ' + it).setHeading(DocumentApp.ParagraphHeading.NORMAL).setSpacingBefore(0).setSpacingAfter(2);
      });
    });
    doc.saveAndClose();
    const file = DriveApp.getFileById(doc.getId());
    try { file.moveTo(getFolder()); } catch (err) {}
    // chi riceve il link (es. su WhatsApp) può aprirlo senza chiedere l'accesso
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
    cleanupOldLists();
    return out(JSON.stringify({ ok: true, url: doc.getUrl(), id: doc.getId() }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function cleanupOldLists() {
  try {
    const limit = Date.now() - KEEP_DAYS * 864e5;
    const files = getFolder().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.getDateCreated().getTime() < limit) f.setTrashed(true);
    }
  } catch (err) {}
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function out(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}`;

let syncUrl = localStorage.getItem(SYNC_KEY) || '', syncInProgress = false, lastSyncAt = 0, _autoSyncTimer = null;

function syncPayloadSig(d){ return JSON.stringify(COLLS.map(c => d[c]).concat([d.deleted])); }
function isDefaultKey(k){ return k.includes(':d_'); }
// Unione PER ELEMENTO: per ogni impegno/categoria/prodotto vince la versione
// modificata più di recente; le eliminazioni viaggiano come "lapidi".
function mergeData(local, remoteRaw){
    const remote = normalizeData(JSON.parse(JSON.stringify(remoteRaw || {})));
    const out = { ...local, deleted:{} };
    const tombs = { ...remote.deleted };
    Object.entries(local.deleted).forEach(([k, ts]) => { tombs[k] = Math.max(ts, tombs[k] || 0); });
    COLLS.forEach(c => {
        const L = new Map(local[c].map(r => [r.id, r]));
        const R = new Map(remote[c].map(r => [r.id, r]));
        const ids = [...L.keys(), ...[...R.keys()].filter(id => !L.has(id))];
        out[c] = [];
        ids.forEach(id => {
            const l = L.get(id), r = R.get(id);
            const pick = !l ? r : !r ? l : ((r._mod || 0) > (l._mod || 0) ? r : l);
            if (pick && (pick._mod || 0) > (tombs[c + ':' + id] || 0)) out[c].push(pick);
        });
    });
    // Le lapidi scadono dopo 90 giorni, tranne quelle degli elementi predefiniti
    // (altrimenti un dispositivo nuovo li farebbe ricomparire)
    const cutoff = Date.now() - 90 * DAY_MS;
    Object.entries(tombs).forEach(([k, ts]) => {
        const [c, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
        const alive = out[c] && out[c].some(r => r.id === id);
        if (!alive && (ts > cutoff || isDefaultKey(k))) out.deleted[k] = ts;
    });
    out.lastModified = Math.max(local.lastModified || 0, remote.lastModified || 0);
    return { merged: normalizeData(out), remote };
}

function getSyncStatus(){ return localStorage.getItem(SYNC_STATUS_KEY) || 'none'; }
function setSyncStatus(s){ localStorage.setItem(SYNC_STATUS_KEY, s); updateSyncBtn(s); }
function updateSyncBtn(status){
    const dot = $('syncDot'), lbl = $('syncLabel');
    if (!dot || !lbl) return;
    dot.className = 'sync-status-dot';
    if (!syncUrl) { lbl.textContent = 'Collega'; return; }
    if (status === 'syncing') lbl.textContent = '… Sync';
    else if (status === 'ok') { lbl.textContent = 'Sync'; dot.classList.add('connected'); }
    else if (status === 'error') { lbl.textContent = 'Sync'; dot.classList.add('error'); }
    else lbl.textContent = 'Sync';
}
function scheduleAutoSync(){
    if (!syncUrl) return;
    clearTimeout(_autoSyncTimer);
    _autoSyncTimer = setTimeout(() => { if (!syncInProgress) doSync(true); }, 20000);
}
async function doSync(silent){
    if (!syncUrl || syncInProgress) return;
    if (!navigator.onLine) { if (!silent) showToast('⚠ Offline: sync rimandata'); return; }
    syncInProgress = true; setSyncStatus('syncing');
    try {
        const res = await fetch(`${syncUrl}?action=read&t=${Date.now()}`, { method:'GET', cache:'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let remoteRaw;
        try { remoteRaw = await res.json(); }
        catch (_) { throw new Error('risposta non valida (accesso “Chiunque”?)'); }
        if (remoteRaw && remoteRaw.error) throw new Error(remoteRaw.error);

        const before = syncPayloadSig(data);
        const { merged, remote } = mergeData(data, remoteRaw);
        const changedLocally = syncPayloadSig(merged) !== before;
        data = merged;
        snapshotSigs();   // ciò che arriva dal remoto NON conta come modifica locale
        persist();
        updateBadges();
        if (changedLocally) renderWhenIdle();

        if (syncPayloadSig(merged) !== syncPayloadSig(remote)) {
            const wr = await fetch(syncUrl, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify(data) });
            if (!wr.ok) throw new Error('scrittura HTTP ' + wr.status);
            let ack = null;
            try { ack = await wr.json(); } catch (_) {}
            if (!ack || !ack.ok) throw new Error((ack && ack.error) || 'scrittura non confermata');
        }
        lastSyncAt = Date.now();
        setSyncStatus('ok');
        if (!silent) showToast(`✓ Sincronizzato alle ${new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}`);
    } catch (e) {
        setSyncStatus('error');
        if (!silent) showToast('⚠ Errore sync: ' + (e.message || 'controlla l\'URL'));
    } finally {
        syncInProgress = false;
    }
}
function openSyncModal(){
    const urlShort = syncUrl.length > 54 ? syncUrl.substring(0, 54) + '…' : syncUrl;
    $('syncModalBody').innerHTML = (syncUrl ? `
        <div class="sync-info-row"><span class="sync-status-dot ${getSyncStatus() === 'error' ? 'error' : 'connected'}"></span><span class="sync-info-text">${escHtml(urlShort)}</span></div>
        <p class="confirm-msg" style="font-size:.78rem;">Collegato. Ogni impegno e ogni prodotto si unisce singolarmente: vince la modifica più recente. Sync automatica 20 secondi dopo ogni modifica, ogni 5 minuti e quando torni nell'app.</p>
        <button class="btn btn-primary" onclick="closeModal('modalSync');doSync(false)">Sincronizza ora</button>
        <div class="modal-btns"><button class="btn btn-secondary" onclick="changeSyncUrl()">Cambia URL</button><button class="btn btn-secondary" onclick="disconnectSync()">Scollega</button></div>` : `
        <p class="confirm-msg" style="font-size:.78rem;">Incolla l'URL dell'Apps Script: serve per sincronizzare telefono e PC e per creare la lista della spesa come Google Doc.</p>
        <input type="text" id="inSyncUrl" placeholder="https://script.google.com/macros/s/…/exec" data-enter="saveSyncUrl">
        <button class="btn btn-primary" onclick="saveSyncUrl()">Collega</button>`) + `
        <div class="field-label" style="margin-top:20px;">Backup</div>
        <div class="modal-btns" style="margin-top:0;">
            <button class="btn btn-secondary" onclick="exportData()">Esporta</button>
            <button class="btn btn-secondary" onclick="$('importFileInput').click()">Importa</button>
        </div>
        <div class="field-label" style="margin-top:20px;">Script Google</div>
        <button class="btn btn-secondary" style="margin-top:0;" onclick="$('scriptBox').classList.toggle('hidden')">Mostra istruzioni e codice</button>
        <div id="scriptBox" class="hidden" style="margin-top:10px;">
            <div class="help"><ol>
                <li>Crea un nuovo Foglio Google (per esempio “Casa Hub”), separato da quello di Study Hub.</li>
                <li>Dal foglio: Estensioni → Apps Script. Cancella il contenuto, incolla il codice qui sotto e salva.</li>
                <li>Esegui il deployment → Nuovo deployment → tipo App web. Esegui come: Me. Chi ha accesso: Chiunque.</li>
                <li>Autorizza (Google chiede accesso a Fogli, Documenti e Drive: servono per sync e liste) e copia l'URL che finisce con /exec.</li>
            </ol>Se in futuro modifichi lo script: Gestisci deployment → Modifica → Nuova versione. L'URL resta lo stesso.</div>
            <button class="btn btn-secondary" style="margin:0 0 8px;" onclick="copyText(APPS_SCRIPT_CODE,'Codice copiato')">Copia il codice</button>
            <textarea readonly onclick="this.select()" class="mono" style="font-size:.62rem;min-height:160px;color:var(--text-dim);">${escHtml(APPS_SCRIPT_CODE)}</textarea>
        </div>
        <button class="btn btn-secondary" style="margin-top:14px;" onclick="closeModal('modalSync')">Chiudi</button>`;
    openModal('modalSync');
}
function changeSyncUrl(){
    $('syncModalBody').innerHTML = `<p class="confirm-msg" style="font-size:.78rem;">Nuovo URL:</p>
        <input type="text" id="inSyncUrl" placeholder="https://script.google.com/macros/s/…/exec" data-enter="saveSyncUrl" value="${escHtml(syncUrl)}">
        <div class="modal-btns"><button class="btn btn-primary" onclick="saveSyncUrl()">Salva</button><button class="btn btn-secondary" onclick="openSyncModal()">Indietro</button></div>`;
}
function saveSyncUrl(){
    const val = $('inSyncUrl').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(val)) { showToast('⚠ URL non valido (script.google.com)'); return; }
    syncUrl = val; localStorage.setItem(SYNC_KEY, syncUrl);
    closeModal('modalSync'); updateSyncBtn('none'); doSync(false);
}
function disconnectSync(){
    confirmDialog({ title:'Scollegare?', msg:'I dati restano su questo dispositivo, ma smettono di sincronizzarsi.', ok:'Scollega', danger:false }, () => {
        syncUrl = ''; localStorage.removeItem(SYNC_KEY); localStorage.removeItem(SYNC_STATUS_KEY);
        clearTimeout(_autoSyncTimer);
        closeModal('modalSync'); updateSyncBtn('none'); showToast('Scollegato');
    });
}

// ── Backup JSON ─────────────────────────────────────────────────────────────
function exportData(){
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `casahub_backup_${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('✓ Backup esportato');
}
function handleImport(event){
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    const r = new FileReader();
    r.onload = e => {
        let imp;
        try { imp = JSON.parse(e.target.result); if (!imp || !Array.isArray(imp.tasks)) throw 0; }
        catch (_) { showToast('⚠ File non valido'); return; }
        confirmDialog({ title:'Sostituire i dati?', msg:`Il backup contiene ${imp.tasks.length} impegni e ${Array.isArray(imp.shopItems) ? imp.shopItems.length : 0} prodotti e sostituirà tutti i dati attuali, anche sugli altri dispositivi dopo la sync.`, ok:'Importa' }, () => {
            Object.keys(_sig).forEach(k => { _sig[k] = '#'; }); // tutto ciò che arriva conta come modifica
            data = normalizeData(imp);
            save(); closeModal('modalSync'); render(); showToast('✓ Backup importato');
        });
    };
    r.readAsText(file);
}

// ── Eventi globali ──────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const open = [...document.querySelectorAll('.modal-overlay:not(.hidden)')].pop();
        if (open) closeModal(open.id);
        return;
    }
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.enter) {
        e.preventDefault();
        const fn = window[e.target.dataset.enter];
        if (typeof fn === 'function') fn();
    }
});
document.addEventListener('focusout', flushPendingRender);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (_renderDay !== todayStr()) renderWhenIdle(); // è passata la mezzanotte
    if (syncUrl && !syncInProgress && Date.now() - lastSyncAt > 60000) doSync(true);
});
window.addEventListener('online', () => { if (syncUrl) doSync(true); });
window.addEventListener('afterprint', () => { const p = $('printArea'); if (p) p.innerHTML = ''; });

// ── Avvio ───────────────────────────────────────────────────────────────────
function init(){
    if (localStorage.getItem(THEME_KEY) === 'light') document.body.classList.add('light');
    applyThemeIcon();
    // Chiudi i modali toccando lo sfondo (solo se anche il tocco è iniziato sullo sfondo)
    document.querySelectorAll('.modal-overlay').forEach(m => {
        let downOnBackdrop = false;
        m.addEventListener('pointerdown', e => { downOnBackdrop = e.target === m; });
        m.addEventListener('click', e => { if (e.target === m && downOnBackdrop) closeModal(m.id); });
    });
    render();
    updateSyncBtn(getSyncStatus());
    if (_loadError) showToast('⚠ Dati locali illeggibili: copia salvata, ripristina da sync o backup');
    if (syncUrl) setTimeout(() => doSync(true), 1500);
    setInterval(() => {
        if (syncUrl && !syncInProgress && document.visibilityState === 'visible') doSync(true);
        if (_renderDay !== todayStr()) renderWhenIdle();
    }, 5 * 60 * 1000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW non registrato:', err));
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
