// ═══════════════════════════════════════════════════════════════════════════
//  CASA HUB — app.js (v1.4)
//  Impegni di casa (urgenza, categorie, ricorrenze, rinvii), energie con la
//  teoria dei cucchiaini, lista della spesa
// ═══════════════════════════════════════════════════════════════════════════

// ── Costanti ────────────────────────────────────────────────────────────────
// Tutte le chiavi hanno il prefisso casahub_: su GitHub Pages Study Hub e
// Casa Hub condividono lo stesso localStorage (stesso dominio).
const STORAGE_KEY = 'casahub_data_v1';
const UI_KEY = 'casahub_ui';
const THEME_KEY = 'casahub_theme';
const SYNC_KEY = 'casahub_sync_url';
const SYNC_STATUS_KEY = 'casahub_sync_status';
// Pastelli caldi: leggibili sia sul cacao (scuro) sia sul burro (chiaro)
const CAT_COLORS = ['#a7bf8f','#8fb4c9','#c3a4d4','#e3a0a8','#d8b98a','#9cbfae','#a9add8','#bba48f'];
const OLD_CAT_COLORS = ['#9ad1ae','#7dd3fc','#c4b5fd','#f9a8d4','#fdba74','#a5b4fc','#99f6e4','#d6d3d1']; // v1.0–1.1
const THEME_COLORS = { dark:'#1c1714', light:'#faf3e8' };
const DOW_SHORT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const DOW_FULL = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const ISO_DOW_LABELS = { 1:'Lun', 2:'Mar', 3:'Mer', 4:'Gio', 5:'Ven', 6:'Sab', 7:'Dom' };
const URG_LABEL = { 1:'Normale', 2:'Importante', 3:'Urgente' };
const REC_UNITS = ['day','week','month','year'];
const COLLS = ['tasks','taskCats','shopCats','shopItems','days','fixedCosts','settings','rooms','projects','tidy','photos'];
const SECTIONS = ['tasks','tidy','rooms','shop'];
const VIEWS = ['today','day','week','month','list','energy'];
const TASK_COST_MAX = 4, OTHER_COST_MAX = 8;
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
// Cucchiaini a quarti: 0, 0,25, 0,5 … arrotondati per evitare errori di virgola mobile
function qr(n){ return Math.round((+n || 0) * 4) / 4; }
function normCost(v, min, max){
    if (v === null || v === undefined || v === '') return null;
    const n = +v;
    return isFinite(n) ? clamp(qr(n), min, max) : null;
}
function fmtSp(n){ return String(qr(n)).replace('.', ','); }
function spWord(n){ return qr(n) === 1 ? 'cucchiaino' : 'cucchiaini'; }

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
// Costo predefinito in cucchiaini: per categoria e, dove cambia, per sottocategoria
const DEFAULT_CAT_COST = { d_tc_pulizie:2, d_tc_bucato:1, d_tc_cucina:2, d_tc_pratiche:1, d_tc_manutenzione:2, d_tc_piante:1, d_tc_altro:2 };
const DEFAULT_SUB_COST = { d_ts_pulizie_bagno:3, d_ts_pulizie_pavimenti:3, d_ts_pulizie_vetri:3, d_ts_bucato_stiro:2,
    d_ts_bucato_cambio_lenzuola:2, d_ts_pratiche_appuntamenti:2 };
// Spese fisse predefinite: [chiave, nome, cucchiaini, giorni ISO (vuoto = tutti)]
const DEFAULT_FIXED = [
    ['igiene', 'Igiene personale', 1, []],
    ['pasti', 'Preparare e mangiare i pasti', 1, []],
    ['lezioni', 'Lezioni', 3, [1,2,3,4,5]],
];
function defaultSettings(){ return { id:'main', max:12, reserve:1, debt:true, calib:true, tidyMin:15, tidyCost:1, tidyDaily:true, _mod:1 }; }
const DEFAULT_ROOMS = ['Cucina','Bagno','Soggiorno','Camera da letto','Ingresso'];
function defaultRooms(){ return DEFAULT_ROOMS.map((name, i) => ({ id:'d_rm_' + slug(name), name, order:i, _mod:1 })); }
function defaultFixed(){ return DEFAULT_FIXED.map(([k, name, cost, days]) => ({ id:'d_fx_' + k, name, cost, days:[...days], _mod:1 })); }
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
function emptyData(){ return { v:1, tasks:[], taskCats:[], shopCats:[], shopItems:[], days:[], fixedCosts:[], settings:[], rooms:[], projects:[], tidy:[], photos:[], deleted:{}, lastModified:0 }; }
function seedDefaults(d){
    d.taskCats = DEFAULT_TASK_CATS.map(([k, name, subs], i) => ({
        id:'d_tc_' + k, name, color:CAT_COLORS[i % CAT_COLORS.length], order:i,
        subs:subs.map(s => ({ id:`d_ts_${k}_${slug(s)}`, name:s })), _mod:1 }));
    d.shopCats = DEFAULT_SHOP.map(([k, name], i) => ({ id:'d_sc_' + k, name, order:i, _mod:1 }));
    d.shopItems = [];
    DEFAULT_SHOP.forEach(([k, , items]) => items.forEach(n => d.shopItems.push({
        id:`d_si_${k}_${slug(n)}`, catId:'d_sc_' + k, name:n, need:false, qty:'', _mod:1 })));
    d.fixedCosts = defaultFixed();
    d.settings = [defaultSettings()];
    d.rooms = defaultRooms();
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
    // Dati della v1.0 (senza energie): aggiunge le spese fisse predefinite una volta sola
    const migrateFixed = d.fixedCosts === undefined;
    const migrateRooms = d.rooms === undefined; // dati precedenti alla v1.3
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
        t.cost = normCost(t.cost, 0, TASK_COST_MAX); // null = predefinito della categoria; 0 = non costa energie
        t.projectId = t.projectId ? String(t.projectId) : null;
        t.roomId = t.roomId ? String(t.roomId) : null;
        t.order = typeof t.order === 'number' ? t.order : (t.created || 0);
    });
    d.taskCats.forEach((c, i) => {
        c.name = String(c.name || '').trim() || 'Categoria';
        if (!c.color) c.color = CAT_COLORS[i % CAT_COLORS.length];
        const oldIdx = OLD_CAT_COLORS.indexOf(String(c.color).toLowerCase());
        if (oldIdx >= 0) c.color = CAT_COLORS[oldIdx]; // nuova palette, stessa posizione
        if (typeof c.order !== 'number') c.order = i;
        const cc = normCost(c.cost, 0, TASK_COST_MAX);
        c.cost = cc === null ? (DEFAULT_CAT_COST[c.id] || 2) : cc;
        c.subs = Array.isArray(c.subs) ? c.subs.filter(s => s && s.name).map(s => {
            const id = String(s.id || uid());
            let cost = s.cost === undefined ? (DEFAULT_SUB_COST[id] || null) : s.cost;
            cost = normCost(cost, 0, TASK_COST_MAX); // null = come la categoria
            return { id, name:String(s.name), cost };
        }) : [];
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
    // ── Energie ──
    if (migrateFixed && !d.fixedCosts.length) d.fixedCosts = defaultFixed();
    d.fixedCosts.forEach(f => {
        f.name = String(f.name || '').trim() || 'Spesa fissa';
        f.cost = normCost(f.cost, 0.25, OTHER_COST_MAX) ?? 1;
        f.days = Array.isArray(f.days) ? [...new Set(f.days.map(Number).filter(n => n >= 1 && n <= 7))].sort((a, b) => a - b) : [];
    });
    if (!d.settings.some(s => s.id === 'main')) d.settings.push(defaultSettings());
    d.settings = d.settings.filter(s => s.id === 'main');
    const st = d.settings[0];
    st.max = clamp(parseInt(st.max, 10) || 12, 4, 40);
    st.reserve = clamp(parseInt(st.reserve, 10) || 0, 0, 10);
    st.debt = st.debt !== false;
    st.calib = st.calib !== false;
    st.tidyMin = clamp(parseInt(st.tidyMin, 10) || 15, 5, 60);
    st.tidyCost = normCost(st.tidyCost, 0, TASK_COST_MAX) ?? 1;
    st.tidyDaily = st.tidyDaily !== false;
    // ── Stanze, progetti, riordino ──
    if (migrateRooms && !d.rooms.length) d.rooms = defaultRooms();
    // v1.4: i Progetti diventano liste delle Stanze. ID fissi e _mod:1, così ogni
    // dispositivo fa la stessa conversione senza creare doppioni in sync.
    d.tasks.forEach(t => {
        if (!t.projectId || t.roomId) return;
        const pj = d.projects.find(x => x.id === t.projectId);
        if (pj && pj.roomId && d.rooms.some(r => r.id === pj.roomId)) t.roomId = pj.roomId;
        else if (pj) {
            const rid = 'pr_' + pj.id;
            if (!d.rooms.some(r => r.id === rid)) d.rooms.push({ id:rid, name:pj.name, order:d.rooms.length, notes:pj.goal || '', _mod:1 });
            t.roomId = rid;
        }
        t.projectId = null;
    });
    d.projects.forEach(pj => {
        const r = pj.roomId && d.rooms.find(x => x.id === pj.roomId);
        if (r && pj.goal && !r.notes && !pj.goalMoved) { r.notes = pj.goal; pj.goalMoved = true; }
    });
    d.rooms.forEach((r, i) => {
        r.name = String(r.name || '').trim() || 'Stanza';
        if (typeof r.order !== 'number') r.order = i;
        r.notes = typeof r.notes === 'string' ? r.notes : '';
    });
    const roomIds = new Set(d.rooms.map(r => r.id));
    d.photos = d.photos.filter(ph => ph.roomId && roomIds.has(String(ph.roomId)));
    const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffd54a';
    const num = (v, def) => { const n = +v; return isFinite(n) ? n : def; };
    d.photos.forEach(ph => {
        ph.roomId = String(ph.roomId);
        ph.kind = ['now','goal','idea'].includes(ph.kind) ? ph.kind : 'now';
        ph.caption = String(ph.caption || '').slice(0, 120);
        ph.w = clamp(parseInt(ph.w, 10) || 1200, 1, 5000);
        ph.h = clamp(parseInt(ph.h, 10) || 900, 1, 5000);
        ph.driveId = ph.driveId ? String(ph.driveId) : null;
        ph.created = num(ph.created, 0);
        ph.strokes = Array.isArray(ph.strokes) ? ph.strokes.filter(x => x && Array.isArray(x.pts) && x.pts.length)
            .map(x => ({ c:hex(x.c), w:clamp(num(x.w, 4), 0.2, 200), pts:x.pts.filter(q => Array.isArray(q) && q.length >= 2).map(q => [num(q[0], 0), num(q[1], 0)]) }))
            .filter(x => x.pts.length) : [];
        ph.texts = Array.isArray(ph.texts) ? ph.texts.filter(x => x && x.t).map(x => ({ x:num(x.x, 0), y:num(x.y, 0), t:String(x.t).slice(0, 80), c:hex(x.c), fs:clamp(num(x.fs, 40), 2, 600) })) : [];
    });
    d.projects.forEach((p, i) => {
        p.name = String(p.name || '').trim() || 'Progetto';
        p.roomId = p.roomId ? String(p.roomId) : null;
        p.goal = typeof p.goal === 'string' ? p.goal : '';
        p.status = ['active','paused','done'].includes(p.status) ? p.status : 'active';
        if (typeof p.order !== 'number') p.order = i;
        p.doneAt = isIso(p.doneAt) ? p.doneAt : null;
    });
    d.tidy = d.tidy.filter(x => isIso(x.date));
    d.tidy.forEach(x => {
        x.roomId = x.roomId ? String(x.roomId) : null;
        x.roomName = String(x.roomName || '');
        x.minutes = clamp(parseInt(x.minutes, 10) || 1, 1, 180);
        x.cost = normCost(x.cost, 0, OTHER_COST_MAX) ?? 0;
    });
    d.days = d.days.filter(x => isIso(x.id));
    const lvl = v => (v === null || v === undefined || v === '') ? null : clamp(parseInt(v, 10) || 0, 0, 3);
    d.days.forEach(x => {
        x.sleep = lvl(x.sleep); x.body = lvl(x.body); x.mind = lvl(x.mind);
        x.spoons = (typeof x.spoons === 'number' && x.spoons >= 0) ? Math.round(x.spoons) : null;
        x.debt = Math.max(0, parseInt(x.debt, 10) || 0);
        x.extras = Array.isArray(x.extras) ? x.extras.filter(e => e && e.name).map(e => ({ id:String(e.id || uid()), name:String(e.name), cost:normCost(e.cost, 0.25, OTHER_COST_MAX) ?? 1 })) : [];
        x.done = Array.isArray(x.done) ? x.done.filter(e => e && e.title).map(e => ({ ts:Number(e.ts) || 0, taskId:String(e.taskId || ''), title:String(e.title), cost:normCost(e.cost, 0, OTHER_COST_MAX) ?? 0 })) : [];
        x.skipFixed = Array.isArray(x.skipFixed) ? x.skipFixed.map(String) : [];
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
        section: u.section === 'projects' ? 'rooms' : SECTIONS.includes(u.section) ? u.section : 'tasks',
        view: VIEWS.includes(u.view) ? u.view : 'today',
        shopFilter: u.shopFilter === 'need' ? 'need' : 'all',
        collapsed: (u.collapsed && typeof u.collapsed === 'object') ? u.collapsed : {},
        showDone: !!u.showDone,
        lastShopCat: u.lastShopCat || null,
        checkinSkip: u.checkinSkip || null,
        roomId: u.roomId || null,
        photoFilter: ['all','now','goal','idea'].includes(u.photoFilter) ? u.photoFilter : 'all',
        tourSeen: !!u.tourSeen,
        penColor: u.penColor || null, penSize: [1, 2, 4].includes(u.penSize) ? u.penSize : 2, penOnly: !!u.penOnly,
        showDoneProjects: !!u.showDoneProjects,
        tidyRoom: u.tidyRoom || null,
        timer: (u.timer && typeof u.timer === 'object' && u.timer.total) ? u.timer : null,
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
function anyModalOpen(){ return !!document.querySelector('.modal-overlay:not(.hidden)') || (typeof vw !== 'undefined' && !!vw); }
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
    const light = document.body.classList.contains('light');
    const b = $('themeBtn');
    if (b) { b.textContent = light ? '☀' : '☾'; b.title = light ? 'Passa al tema sera' : 'Passa al tema giorno'; }
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', light ? THEME_COLORS.light : THEME_COLORS.dark);
}
function toggleTheme(){
    document.body.classList.toggle('light');
    localStorage.setItem(THEME_KEY, document.body.classList.contains('light') ? 'light' : 'dark');
    applyThemeIcon();
}

// ── Navigazione ─────────────────────────────────────────────────────────────
function setSection(s){
    if (s === 'rooms' && ui.section === 'rooms') ui.roomId = null; // secondo tocco: torna all'elenco
    ui.section = s; saveUi();
    window.scrollTo(0, 0);
    render();
}
function setView(v){
    const fromOtherSection = ui.section !== 'tasks';
    ui.view = v; ui.section = 'tasks'; saveUi();
    weekOffset = 0; selectedDayOffset = null; monthOffset = 0;
    if (fromOtherSection) render(); else renderTasks($('appContent'));
}
function render(){
    _pendingRender = false;
    _renderDay = todayStr();
    SECTIONS.forEach(sec => { const b = $('nav_' + sec); if (b) b.classList.toggle('active', ui.section === sec); });
    $('fabAdd').classList.toggle('hidden', ui.section !== 'tasks');
    const app = $('appContent');
    if (ui.section === 'shop') renderShop(app);
    else if (ui.section === 'rooms') renderRooms(app);
    else if (ui.section === 'tidy') renderTidy(app);
    else renderTasks(app);
    updateBadges();
}
function updateBadges(){
    const today = todayStr();
    const open = openTasks();
    const late = open.filter(t => t.date && t.date < today).length;
    const due = open.filter(t => t.date && t.date <= today).length;
    const bt = $('badgeTasks'), bs = $('badgeShop'), bd = $('badgeTidy');
    if (bt) { bt.textContent = due || ''; bt.classList.toggle('alert', late > 0); bt.title = late ? `${late} in ritardo` : ''; }
    if (bs) { const n = data.shopItems.filter(i => i.need).length; bs.textContent = n || ''; }
    if (bd) { bd.textContent = tidyBadgeText(); bd.classList.toggle('ok', !!tidyOn(today).length && !ui.timer); }
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
    parts.push(`<span class="m-spoon" title="Cucchiaini">🥄${fmtSp(effectiveCost(t))}</span>`);
    const rm = t.roomId ? getRoom(t.roomId) : null;
    if (rm) parts.push(`<span>⌂ ${escHtml(rm.name)}</span>`);
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
    return `<div class="task-card${ghost ? ' ghost' : ''}${t.done ? ' done' : ''}" style="--c:${color}">
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
    app.innerHTML = `<div class="view-toggle">${vb('today','Oggi')}${vb('day','Giorno')}${vb('week','Settimana')}${vb('month','Mese')}${vb('list','Elenco')}${vb('energy','Energia')}${helpBtn(ui.view === 'energy' ? 'energy' : 'tasks')}</div>
        <div id="tasksArea"></div>`;
    const tg = app.querySelector('.view-toggle'), act = tg && tg.querySelector('.view-btn.active');
    if (act) tg.scrollLeft = Math.max(0, act.offsetLeft - tg.offsetLeft - 24);
    renderTasksArea();
}
function renderTasksArea(){
    const area = $('tasksArea');
    if (!area) return;
    if (ui.view === 'today') renderToday(area);
    else if (ui.view === 'day') renderDayView(area);
    else if (ui.view === 'week') renderWeekView(area);
    else if (ui.view === 'month') renderMonthView(area);
    else if (ui.view === 'energy') renderEnergyView(area);
    else renderListView(area);
}

// ── Oggi ────────────────────────────────────────────────────────────────────
function greeting(){
    const h = new Date().getHours();
    return h >= 5 && h < 13 ? 'Buongiorno' : h >= 13 && h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}
function renderToday(area){
    const today = todayStr(), tomorrow = shiftDate(today, 1), now = new Date();
    const open = openTasks();
    const late = open.filter(t => t.date && t.date < today).sort(cmpDateUrg);
    const todays = open.filter(t => t.date === today).sort(cmpUrgTime);
    const undated = open.filter(t => !t.date && !t.roomId).sort(cmpUrgTime);
    const tomorrows = open.filter(t => t.date === tomorrow).sort(cmpUrgTime);
    const often = open.filter(t => t.postponed >= 3).sort((a, b) => b.postponed - a.postponed);
    const summary = [];
    summary.push(`<b>${todays.length}</b> ${todays.length === 1 ? 'impegno' : 'impegni'} oggi`);
    if (late.length) summary.push(`<span class="late"><b style="color:var(--danger)">${late.length}</b> in ritardo</span>`);
    area.innerHTML = `
        <div class="today-head">
            <div><div class="today-greet">${greeting()}</div><div class="today-date">${DOW_FULL[now.getDay()]} ${now.getDate()} ${MONTHS_IT[now.getMonth()].toLowerCase()}</div></div>
            <div class="today-summary">${summary.join('<br>')}</div>
        </div>
        ${energyCardHtml()}
        ${late.length + todays.length ? `<button class="imprevisto-btn" onclick="openImprevisto()">Imprevisto: rimanda a domani</button>` : ''}
        ${late.length ? `<div class="block"><div class="block-title late"><span>In ritardo</span><span class="count">${late.length}</span></div>
            ${late.map(t => taskCardHtml(t, { showDate:true })).join('')}</div>` : ''}
        <div class="block"><div class="block-title"><span>Oggi</span><span class="count">${todays.length || ''}</span></div>
            ${todays.length ? todays.map(t => taskCardHtml(t)).join('') : `<div class="empty-note">Niente in programma per oggi. Se ti viene in mente qualcosa, tocca +.</div>`}</div>
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
            ${dayLoadLine(selStr, idx)}
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
            <span>${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0, 3)} <span style="font-size:.68rem;opacity:.5;">${DOW_FULL[d.getDay()]}</span></span>
            ${loadTagHtml(ds, idx)}</div>
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
    const open = openTasks().filter(t => t.date || !t.roomId);
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

    const done = data.tasks.filter(t => t.done && !t.roomId).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    const doneHtml = done.length ? `<div class="block" style="margin-top:8px;">
        <div class="block-title"><button class="link-btn" onclick="toggleShowDone()">${ui.showDone ? '▾' : '▸'} Completati (${done.length})</button>
            ${ui.showDone ? `<button class="link-btn danger" onclick="clearDoneTasks()">Svuota</button>` : ''}</div>
        ${ui.showDone ? done.map(t => taskCardHtml(t, { showCat:true })).join('') : ''}</div>` : '';

    area.innerHTML = html + doneHtml + `<button class="btn btn-secondary" onclick="openCatsModal()">Gestisci categorie</button>`;
}
function toggleShowDone(){ ui.showDone = !ui.showDone; saveUi(); renderTasksArea(); }
function clearDoneTasks(){
    // Le cose fatte delle Stanze restano lì: servono per l'avanzamento della stanza
    const n = data.tasks.filter(t => t.done && !t.roomId).length;
    confirmDialog({ title:'Svuotare?', msg:`Elimino ${n} ${n === 1 ? 'impegno completato' : 'impegni completati'}. Quelli ricorrenti e le liste delle stanze non vengono toccati.`, ok:'Svuota' }, () => {
        data.tasks = data.tasks.filter(t => !t.done || t.roomId);
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
function snapDay(iso){ const d = dayRec(iso); return d ? JSON.parse(JSON.stringify(d)) : null; }
function restoreDay(iso, snap){
    data.days = data.days.filter(x => x.id !== iso);
    if (snap) data.days.push(snap);
}
function completeTask(id){
    const t = findTask(id);
    if (!t) return;
    const today = todayStr();
    const before = cloneTask(t), dayBefore = snapDay(today);
    // i cucchiaini spesi restano registrati sul giorno in cui lo fai
    const expected = effectiveCost(t);
    const entry = { ts:Date.now(), taskId:t.id, title:t.title, cost:expected };
    ensureDay(today).done.push(entry);
    let msg;
    if (t.rec) {
        t.log = [today, ...t.log].slice(0, 20);
        const next = t.rec.fromDone ? nextOcc(t.rec, today, null) : nextFutureOcc(t);
        t.date = t.sched = next;
        t.postponed = 0;
        msg = `✓ Fatto. Prossima volta: ${fmtRel(next)}`;
    } else {
        t.done = true; t.doneAt = today;
        msg = '✓ Fatto';
    }
    save(); closeModal('modalSheet'); render();
    showToast(msg, { label:'Annulla', fn:() => {
        closeModal('modalCalib');
        restoreDay(today, dayBefore);
        restoreTask(before);
    } });
    if (settings().calib) openCalib(t.id, entry.ts, expected);
}
function reopenTask(id){
    const t = findTask(id);
    if (!t) return;
    const d = t.doneAt ? dayRec(t.doneAt) : null;
    if (d) d.done = d.done.filter(e => e.taskId !== t.id);
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
// Dare una data a un impegno che non l'aveva non è un rinvio
function planTo(id, iso){
    const t = findTask(id);
    if (!t || !isIso(iso)) return;
    const before = cloneTask(t);
    t.date = iso;
    if (t.rec) { t.sched = iso; t.anchor = iso; }
    save(); closeModal('modalSheet'); render();
    const over = loadOn(iso) - budgetOn(iso);
    showToast(over > 0 ? `In programma ${fmtRel(iso)}, ma sfori di ${fmtSp(over)} 🥄` : `In programma ${fmtRel(iso)}`, { label:'Annulla', fn:() => restoreTask(before) });
}
function planTask(id, days){ planTo(id, shiftDate(todayStr(), days)); }
function planPicked(id){
    const v = $('sheetDate') && $('sheetDate').value;
    if (!isIso(v) || v < todayStr()) { showToast('⚠ Scegli una data da oggi in poi'); return; }
    planTo(id, v);
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
    rows.push(['Cucchiaini', `🥄 ${fmtSp(effectiveCost(t))}${t.cost !== null ? '' : ' <span style="color:var(--text-dim)">(predefinito)</span>'}`]);
    const rm = t.roomId ? getRoom(t.roomId) : null;
    if (rm) rows.push(['Stanza', escHtml(rm.name)]);
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
            ${t.date ? `<div class="field-label">Rimanda</div>
            <div class="postpone-grid">
                <button class="btn btn-secondary" onclick="postponeBy(${a},1)">+1 giorno</button>
                <button class="btn btn-secondary" onclick="postponeBy(${a},3)">+3 giorni</button>
                <button class="btn btn-secondary" onclick="postponeBy(${a},7)">+1 settimana</button>
                <button class="btn btn-secondary" onclick="$('sheetPick').classList.toggle('hidden')">Scegli data</button>
            </div>` : `<div class="field-label">Pianifica</div>
            <div class="postpone-grid">
                <button class="btn btn-secondary" onclick="planTask(${a},0)">Oggi</button>
                <button class="btn btn-secondary" onclick="planTask(${a},1)">Domani</button>
                <button class="btn btn-secondary" onclick="planTask(${a},7)">Tra una settimana</button>
                <button class="btn btn-secondary" onclick="$('sheetPick').classList.toggle('hidden')">Scegli data</button>
            </div>`}
            <div id="sheetPick" class="hidden field-row" style="margin-top:8px;">
                <input type="date" id="sheetDate" min="${today}" value="${shiftDate(today, 1)}" style="margin-bottom:0;">
                <button class="add-btn" style="flex:0 0 auto;" onclick="${t.date ? `postponePicked(${a})` : `planPicked(${a})`}">${t.date ? 'Rimanda' : 'Pianifica'}</button>
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
let editingTaskId = null, formUrg = 1, formDays = [], formCost = null;
function fillCatSelect(selected){
    $('tCat').innerHTML = `<option value="">Senza categoria</option>` +
        sortedCats().map(c => `<option value="${escHtml(c.id)}"${c.id === selected ? ' selected' : ''}>${escHtml(c.name)}</option>`).join('');
}
function fillSubSelect(selected){
    const c = getCat($('tCat').value);
    const sel = $('tSub');
    if (!c || !c.subs.length) { sel.innerHTML = ''; sel.classList.add('hidden'); renderFormCost(); return; }
    sel.classList.remove('hidden');
    sel.innerHTML = `<option value="">Generale</option>` +
        c.subs.map(s => `<option value="${escHtml(s.id)}"${s.id === selected ? ' selected' : ''}>${escHtml(s.name)}</option>`).join('');
    renderFormCost();
}
// Costo in cucchiaini: "predefinito" segue la (sotto)categoria scelta nel modulo
function formDefaultCost(){
    const c = getCat($('tCat').value);
    const s = c && !$('tSub').classList.contains('hidden') ? getSub(c, $('tSub').value) : null;
    if (s && s.cost !== null && s.cost !== undefined) return s.cost;
    return c ? c.cost : 2;
}
function renderFormCost(){
    const box = $('tCost');
    if (!box) return;
    const def = formDefaultCost();
    const cur = formCost === null ? def : formCost;
    const custom = formCost !== null && formCost !== 0;
    box.innerHTML = `<button type="button" class="chip${formCost === null ? ' on' : ''}" onclick="setFormCost(null)">Predefinito · ${fmtSp(def)}</button>
        <button type="button" class="chip${formCost === 0 ? ' on' : ''}" onclick="setFormCost(0)">Zero</button>
        <div class="sp-stepper${custom ? ' on' : ''}">
            <button type="button" onclick="stepFormCost(-1)" aria-label="Un quarto in meno">−</button>
            <span>🥄 ${fmtSp(cur)}</span>
            <button type="button" onclick="stepFormCost(1)" aria-label="Un quarto in più">+</button>
        </div>`;
    $('tCostHint').textContent = costHint(cur);
}
function setFormCost(n){ formCost = n; renderFormCost(); }
// ± un quarto di cucchiaino partendo dal valore mostrato
function stepFormCost(dir){
    const base = formCost === null ? formDefaultCost() : formCost;
    formCost = clamp(qr(base + dir * 0.25), 0, TASK_COST_MAX);
    renderFormCost();
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
    formCost = t ? t.cost : null;
    fillRoomSelect(t ? t.roomId : (ui.section === 'rooms' ? ui.roomId : null));
    fillCatSelect(t ? t.catId : '');
    fillSubSelect(t ? t.subId : '');
    formUrg = t ? t.urg : 1;
    renderFormUrg();
    let defDate = todayStr();
    if (!t && ui.section === 'tasks' && ui.view === 'day') defDate = selectedDayIso();
    if (!t && ui.section === 'rooms' && ui.roomId) defDate = ''; // le cose di una stanza nascono senza data
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
    const roomId = $('tRoom').value || null;
    const fields = { title, catId, subId, urg:formUrg, cost:formCost, roomId, date, time:parseTimeInput($('tTime').value), notes:$('tNotes').value.trim(), rec };
    if (editingTaskId) {
        const t = findTask(editingTaskId);
        if (!t) { closeModal('modalTask'); return; }
        const schedChanged = t.date !== date || JSON.stringify(t.rec) !== JSON.stringify(rec);
        Object.assign(t, fields);
        if (schedChanged) { t.sched = date; t.anchor = date; }
        if (rec) { t.done = false; t.doneAt = null; }
    } else {
        data.tasks.push({ id:uid(), ...fields, sched:date, anchor:date, postponed:0, log:[], done:false, doneAt:null, created:Date.now(), order:Date.now() });
    }
    save(); closeModal('modalTask'); render();
    // Avvisa subito se quel giorno supera le energie disponibili
    const over = date && date >= todayStr() ? loadOn(date) - budgetOn(date) : 0;
    if (over > 0) showToast(`${editingTaskId ? 'Aggiornato' : 'Aggiunto'}, ma ${fmtRel(date)} sfori di ${fmtSp(over)} 🥄`);
    else showToast(editingTaskId ? 'Impegno aggiornato' : 'Impegno aggiunto');
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
    const costOpts = (sel, withInherit, inh) => (withInherit ? `<option value=""${sel === null ? ' selected' : ''}>= ${fmtSp(inh)}</option>` : '') +
        COST_STEPS.map(n => `<option value="${n}"${sel === n ? ' selected' : ''}>🥄${fmtSp(n)}</option>`).join('');
    $('catsBody').innerHTML = `<p class="confirm-msg" style="font-size:.76rem;margin-bottom:4px;">🥄 = cucchiaini che un impegno di quella categoria costa di solito. “=” vuol dire: come la categoria.</p>` + cats.map((c, i) => {
        const a = jsArg(c.id);
        return `<div class="mg-cat">
            <div class="mg-row">
                <button class="mg-swatch" style="background:${c.color}" onclick="cycleCatColor(${a})" title="Cambia colore" aria-label="Cambia colore"></button>
                <input type="text" value="${escHtml(c.name)}" maxlength="40" onchange="renameCat(${a},this.value)" aria-label="Nome categoria">
                <select class="mg-cost" onchange="setCatCost(${a},null,this.value)" aria-label="Cucchiaini predefiniti">
                    ${costOpts(c.cost, false)}</select>
                <button class="mg-btn" onclick="moveCat(${a},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">▲</button>
                <button class="mg-btn" onclick="moveCat(${a},1)" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">▼</button>
                <button class="mg-btn danger" onclick="deleteCat(${a})" aria-label="Elimina">✕</button>
            </div>
            <div class="mg-subs">
                ${c.subs.map(s => `<div class="mg-row">
                    <input type="text" value="${escHtml(s.name)}" maxlength="40" onchange="renameSub(${a},${jsArg(s.id)},this.value)" aria-label="Nome sottocategoria">
                    <select class="mg-cost" onchange="setCatCost(${a},${jsArg(s.id)},this.value)" aria-label="Cucchiaini">
                        ${costOpts(s.cost, true, c.cost)}</select>
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
function setCatCost(catId, subId, v){
    const c = getCat(catId);
    if (!c) return;
    const n = normCost(v, 0, TASK_COST_MAX);
    if (subId) { const s = getSub(c, subId); if (s) s.cost = n; }
    else if (n !== null) c.cost = n;
    catsChanged();
}
function addCat(){
    const name = $('newCatName').value.trim();
    if (!name) return;
    const maxO = data.taskCats.reduce((m, c) => Math.max(m, c.order), -1);
    data.taskCats.push({ id:uid(), name, color:CAT_COLORS[data.taskCats.length % CAT_COLORS.length], order:maxO + 1, cost:2, subs:[] });
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
    c.subs.push({ id:uid(), name, cost:null });
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
//  ENERGIE (teoria dei cucchiaini)
// ═══════════════════════════════════════════════════════════════════════════
const COST_STEPS = Array.from({ length:TASK_COST_MAX * 4 + 1 }, (_, i) => i / 4);       // 0 … 4 a quarti
const OTHER_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8];   // spese fisse ed extra
function costHint(v){
    if (v === 0) return 'Zero: non pesa sulle energie (es. cambiare la pellicola al telefono).';
    if (v < 1) return 'Quasi niente: pochi minuti, poca fatica.';
    if (v < 2) return 'Leggero: si fa senza pensarci (pagare online, innaffiare).';
    if (v < 3) return 'Medio: richiede un po’ di impegno (una lavatrice da stendere, la cucina).';
    if (v < 4) return 'Pesante: fatica fisica o tempo lungo (bagno a fondo, pavimenti).';
    return 'Molto pesante: ti lascia stanca (cambio di stagione, pulizie grandi).';
}
const CHECKIN_QS = [
    { key:'sleep', label:'Come hai dormito?', opts:['Bene','Così così','Poco o male','Malissimo'] },
    { key:'body', label:'Come sta il corpo?', opts:['In forma','Un po’ di stanchezza','Dolori o fatica','Molto provato'] },
    { key:'mind', label:'E la testa?', opts:['Lucida','Un po’ carica','Sotto stress','Annebbiata'] },
];
function settings(){ return data.settings[0]; }
// Un cucchiaino disegnato: coppa ovale + manico
const SPOON_SVG = '<svg viewBox="0 0 12 34" aria-hidden="true"><path class="sp-fill" d="M6 1.2c2.9 0 4.8 2.6 4.8 6.1 0 3-1.6 5.3-3.6 5.9v18.3c0 .7-.5 1.3-1.2 1.3s-1.2-.6-1.2-1.3V13.2C2.8 12.6 1.2 10.3 1.2 7.3 1.2 3.8 3.1 1.2 6 1.2z"/></svg>';
function effectiveCost(t){
    if (t.cost !== null && t.cost !== undefined) return t.cost;
    const c = getCat(t.catId), s = getSub(c, t.subId);
    if (s && s.cost !== null && s.cost !== undefined) return s.cost;
    return c ? c.cost : 2;
}
function dayRec(iso){ return data.days.find(d => d.id === iso) || null; }
function ensureDay(iso){
    let d = dayRec(iso);
    if (!d) { d = { id:iso, sleep:null, body:null, mind:null, spoons:null, debt:0, extras:[], done:[], skipFixed:[] }; data.days.push(d); }
    return d;
}
function hasCheckin(iso){ const d = dayRec(iso); return !!(d && typeof d.spoons === 'number'); }
function fixedFor(iso){
    const dow = isoDow(parseLocalDate(iso)), d = dayRec(iso), skip = d ? d.skipFixed : [];
    return data.fixedCosts.filter(f => !f.days.length || f.days.includes(dow)).map(f => ({ f, skipped:skip.includes(f.id) }));
}
function fixedSum(iso){ return qr(fixedFor(iso).reduce((n, x) => n + (x.skipped ? 0 : x.f.cost), 0)); }
function extrasSum(iso){ const d = dayRec(iso); return d ? qr(d.extras.reduce((n, e) => n + e.cost, 0)) : 0; }
function doneSum(iso){ const d = dayRec(iso); return d ? qr(d.done.reduce((n, e) => n + e.cost, 0)) : 0; }
function spentOn(iso){ return qr(fixedSum(iso) + extrasSum(iso) + doneSum(iso) + tidySum(iso)); }
// Energia "tipica": media degli ultimi 14 check-in (servono almeno 3), altrimenti il massimo
function typicalSpoons(){
    const today = todayStr();
    const recs = data.days.filter(d => typeof d.spoons === 'number' && d.id < today).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 14);
    if (recs.length < 3) return settings().max;
    return Math.round(recs.reduce((n, d) => n + d.spoons, 0) / recs.length);
}
function availableOn(iso){ return hasCheckin(iso) ? dayRec(iso).spoons : typicalSpoons(); }
function budgetOn(iso){ return Math.max(0, availableOn(iso) - settings().reserve); }
function openLoadToday(){
    const today = todayStr();
    return qr(openTasks().filter(t => t.date && t.date <= today).reduce((n, t) => n + effectiveCost(t), 0) + tidyPlannedOn(today));
}
// Carico di un giorno. Oggi: già speso + in programma (compresi i ritardi).
// Giorni futuri: spese fisse + impegni + ricorrenze previste. Passati: speso.
function loadOn(iso, idx){
    const today = todayStr();
    if (iso < today) return spentOn(iso);
    if (iso === today) return spentOn(iso) + openLoadToday();
    const items = (idx && idx.has(iso)) ? idx.get(iso) : (buildIndex(iso, iso).get(iso) || []);
    return qr(spentOn(iso) + items.reduce((n, it) => n + effectiveCost(it.t), 0) + tidyPlannedOn(iso));
}
function loadTagHtml(iso, idx){
    const today = todayStr();
    if (iso < today && !hasCheckin(iso)) return '';
    const load = loadOn(iso, idx);
    if (iso < today) {
        const av = dayRec(iso).spoons;
        return `<span class="load-tag${load > av ? ' over' : ''}" title="Spesi su disponibili">🥄 ${fmtSp(load)}/${av}</span>`;
    }
    const bud = budgetOn(iso);
    const est = iso === today && hasCheckin(iso) ? '' : '≈';
    return `<span class="load-tag${load > bud ? ' over' : ''}" title="Carico previsto su energie (riserva esclusa)">🥄 ${fmtSp(load)}/${est}${fmtSp(bud)}</span>`;
}
function dayLoadLine(iso, idx){
    const today = todayStr();
    if (iso < today) {
        if (!hasCheckin(iso)) return '';
        const av = dayRec(iso).spoons, sp = spentOn(iso);
        return `<div class="day-load${sp > av ? ' over' : ''}">Spesi ${fmtSp(sp)} cucchiaini su ${av}</div>`;
    }
    const load = loadOn(iso, idx), bud = budgetOn(iso);
    const what = iso === today && hasCheckin(iso) ? 'disponibili oggi' : 'tipici';
    const over = load - bud;
    return `<div class="day-load${over > 0 ? ' over' : ''}">Carico ${fmtSp(load)} cucchiaini su ${fmtSp(bud)} ${what} (riserva esclusa)${over > 0 ? `: sfori di ${fmtSp(over)}` : ''}</div>`;
}

// ── Check-in del mattino ────────────────────────────────────────────────────
function debtFor(iso){
    if (!settings().debt) return 0;
    const y = shiftDate(iso, -1);
    if (!hasCheckin(y)) return 0;
    const over = Math.round(spentOn(y) - dayRec(y).spoons);
    return clamp(over, 0, Math.ceil(settings().max * 0.25));
}
// Ogni risposta toglie una parte del massimo: tutto "bene" = massimo, tutto "male" = un quarto
function proposeSpoons(ans, debt){
    const max = settings().max;
    const sum = CHECKIN_QS.reduce((n, q) => n + (ans[q.key] || 0), 0);
    const raw = Math.round(max * (1 - (sum / 9) * 0.75));
    return { max, penalty:max - raw, result:Math.max(1, raw - debt) };
}
let ci = null;
function isFirstCheckin(){ return !data.days.some(d => typeof d.spoons === 'number'); }
function maybeCheckin(){
    const today = todayStr();
    if (hasCheckin(today) || ui.checkinSkip === today || anyModalOpen()) return;
    openCheckin();
}
function openCheckin(){
    const today = todayStr(), d = dayRec(today);
    const redo = hasCheckin(today);
    ci = { ans:{ sleep:d ? d.sleep : null, body:d ? d.body : null, mind:d ? d.mind : null },
        debt:redo ? d.debt : debtFor(today), manual:redo ? d.spoons : null, first:isFirstCheckin() };
    renderCheckin();
    openModal('modalCheckin');
}
function renderCheckin(){
    const p = proposeSpoons(ci.ans, ci.debt);
    const value = ci.manual !== null ? ci.manual : p.result;
    const answered = CHECKIN_QS.every(q => ci.ans[q.key] !== null);
    const parts = [`massimo ${p.max}`];
    if (p.penalty) parts.push(`−${p.penalty} per come stai`);
    if (ci.debt) parts.push(`−${ci.debt} per ieri`);
    if (ci.manual !== null && ci.manual !== p.result) parts.push(`${ci.manual > p.result ? '+' : '−'}${Math.abs(ci.manual - p.result)} correzione tua`);
    $('checkinBody').innerHTML = `
        <div class="modal-title">Come va oggi? ${helpBtn('checkin')}</div>
        ${ci.first ? `<div class="ci-first">
            <p>Prima volta: quanti cucchiaini hai in una giornata <b>buona</b>? Di solito si parte da 12. Puoi cambiarlo quando vuoi in Energia.</p>
            <div class="stepper"><button onclick="stepSetting('max',-1,true)" aria-label="Meno">−</button><span>${settings().max}</span><button onclick="stepSetting('max',1,true)" aria-label="Più">+</button></div>
        </div>` : ''}
        ${CHECKIN_QS.map(q => `<div class="ci-q"><div class="field-label">${q.label}</div>
            <div class="ci-opts">${q.opts.map((o, i) => `<button type="button" class="chip${ci.ans[q.key] === i ? ' on' : ''}" onclick="setCiAns('${q.key}',${i})">${o}</button>`).join('')}</div></div>`).join('')}
        <div class="ci-result${answered ? '' : ' dim'}">
            <button class="ci-step" onclick="stepCi(-1)" aria-label="Meno">−</button>
            <div><div class="ci-num">${value}</div><div class="ci-unit">cucchiaini oggi</div></div>
            <button class="ci-step" onclick="stepCi(1)" aria-label="Più">+</button>
        </div>
        <div class="ci-break">${parts.join(', ')}</div>
        ${ci.debt ? `<div class="sheet-info" style="text-align:center;">Ieri hai sforato: parti con ${ci.debt} in meno. Oggi vacci piano.</div>` : ''}
        <button class="btn btn-primary" onclick="saveCheckin()">${hasCheckin(todayStr()) ? 'Aggiorna' : 'Inizia la giornata'}</button>
        <button class="btn btn-secondary" onclick="skipCheckin()">${hasCheckin(todayStr()) ? 'Annulla' : 'Salta per oggi'}</button>`;
}
function setCiAns(k, i){ ci.ans[k] = i; ci.manual = null; renderCheckin(); }
function stepCi(dir){
    const p = proposeSpoons(ci.ans, ci.debt);
    const cur = ci.manual !== null ? ci.manual : p.result;
    ci.manual = clamp(cur + dir, 0, settings().max + 5);
    renderCheckin();
}
function saveCheckin(){
    const today = todayStr(), d = ensureDay(today);
    const p = proposeSpoons(ci.ans, ci.debt);
    d.sleep = ci.ans.sleep; d.body = ci.ans.body; d.mind = ci.ans.mind;
    d.debt = ci.debt;
    d.spoons = ci.manual !== null ? ci.manual : p.result;
    save(); closeModal('modalCheckin'); render();
    const over = loadOn(today) - budgetOn(today);
    showToast(over > 0 ? `${d.spoons} cucchiaini. Oggi sfori di ${fmtSp(over)}: guarda i consigli` : `${d.spoons} cucchiaini per oggi`);
}
function skipCheckin(){
    if (!hasCheckin(todayStr())) { ui.checkinSkip = todayStr(); saveUi(); }
    closeModal('modalCheckin');
}

// ── Scheda energie in "Oggi" e consigli ─────────────────────────────────────
// Sceglie cosa spostare: mai gli urgenti; prima i meno urgenti; tra questi il
// compito più piccolo che basta a rientrare, altrimenti il più pesante.
function suggestMoves(){
    const today = todayStr();
    if (!hasCheckin(today)) return { excess:0, moves:[] };
    let excess = loadOn(today) - budgetOn(today);
    if (excess <= 0) return { excess:0, moves:[] };
    const pool = openTasks().filter(t => t.date && t.date <= today && t.urg < 3 && effectiveCost(t) > 0);
    const idx = buildIndex(shiftDate(today, 1), shiftDate(today, 21));
    const added = new Map(), moves = [];
    while (excess > 0 && pool.length) {
        const minUrg = Math.min(...pool.map(t => t.urg));
        const group = pool.filter(t => t.urg === minUrg);
        const enough = group.filter(t => effectiveCost(t) >= excess).sort((a, b) => effectiveCost(a) - effectiveCost(b));
        const pick = enough[0] || group.sort((a, b) => effectiveCost(b) - effectiveCost(a))[0];
        pool.splice(pool.indexOf(pick), 1);
        const c = effectiveCost(pick);
        let target = null, best = null, bestFree = -Infinity;
        for (let i = 1; i <= 21; i++) {
            const d = shiftDate(today, i);
            const free = budgetOn(d) - loadOn(d, idx) - (added.get(d) || 0);
            if (free >= c) { target = d; break; }
            if (free > bestFree) { bestFree = free; best = d; }
        }
        target = target || best;
        added.set(target, (added.get(target) || 0) + c);
        moves.push({ t:pick, target, cost:c });
        excess = qr(excess - c);
    }
    return { excess:Math.max(0, excess), moves };
}
function energyCardHtml(){
    const today = todayStr(), st = settings();
    if (!hasCheckin(today)) return `<div class="energy-card"><div class="energy-empty">
        <span>Fai il check-in per sapere quanti cucchiaini hai oggi.</span>
        <button class="add-btn" onclick="openCheckin()">Check-in</button></div></div>`;
    const S = dayRec(today).spoons, R = Math.min(st.reserve, S);
    const used = spentOn(today), planned = openLoadToday(), total = used + planned;
    const n = Math.max(S, Math.ceil(total - 0.001));
    // Ogni cucchiaino si riempie dal basso: grigio = speso, miele = in programma
    // (albicocca se tocca la riserva, lampone oltre il totale), vuoto = libero.
    const cells = Array.from({ length:n }, (_, i) => {
        const a = clamp(used - i, 0, 1) * 100, b = clamp(total - i, 0, 1) * 100;
        const kind = i >= S ? 'over' : i >= S - R ? 'reserve' : 'norm';
        return `<span class="spoon ${kind}" style="--a:${a}%;--b:${b}%"></span>`;
    }).join('');
    const left = S - used, freeBeyond = S - R - total;
    const { excess, moves } = suggestMoves();
    let status;
    if (moves.length || excess > 0) {
        const tot = total - (S - R);
        status = `<div class="energy-over"><div class="eo-title">Oggi sfori di ${fmtSp(tot)} ${spWord(tot)}${R ? ', riserva compresa' : ''}</div>
            ${moves.length ? `<div class="eo-sub">Ti suggerisco di spostare:</div>
            ${moves.map(m => `<div class="eo-row"><span class="eo-name">${escHtml(m.t.title)} <span class="m-spoon">🥄${fmtSp(m.cost)}</span></span>
                <button class="add-btn" onclick="applyMove(${jsArg(m.t.id)},${jsArg(m.target)})">${escHtml(fmtRel(m.target))}</button></div>`).join('')}
            ${moves.length > 1 ? `<button class="btn btn-secondary" style="margin-top:8px;" onclick="applyAllMoves()">Sposta tutti</button>` : ''}` : ''}
            ${excess > 0 ? `<div class="eo-note">${moves.length ? 'Anche così resti oltre di ' + fmtSp(excess) + ': il resto è urgente.' : 'Quello che resta è urgente.'} Fai solo l’indispensabile e, se puoi, chiedi una mano.</div>` : ''}
        </div>`;
    } else if (freeBeyond >= 0) {
        status = `<div class="energy-ok">${freeBeyond ? `Hai ancora ${fmtSp(freeBeyond)} ${qr(freeBeyond) === 1 ? 'cucchiaino libero' : 'cucchiaini liberi'} oltre la riserva.` : 'Giornata piena ma sostenibile: la riserva è intatta.'}</div>`;
    } else status = '';
    return `<div class="energy-card">
        <div class="energy-top">
            <div><span class="energy-num">${fmtSp(Math.max(0, left))}</span><span class="energy-of">${qr(left) === 1 ? 'cucchiaino rimasto' : 'cucchiaini rimasti'} su ${S}</span></div>
            <span class="energy-acts">${helpBtn('energy')}<button class="link-btn" onclick="setView('energy')">Dettagli</button></span>
        </div>
        <div class="spoon-bar" aria-label="Spesi ${fmtSp(used)}, in programma ${fmtSp(planned)}, disponibili ${S}">${cells}</div>
        <div class="energy-legend"><span><i class="lg spent"></i>Spesi ${fmtSp(used)}</span><span><i class="lg planned"></i>In programma ${fmtSp(planned)}</span><span><i class="lg free"></i>Liberi</span>${R ? `<span><i class="lg reserve"></i>Riserva ${R}</span>` : ''}</div>
        ${status}
        <button class="link-btn" onclick="openExtraQuick()">+ Altro che ti ha stancato oggi</button>
    </div>`;
}
function applyMove(id, iso){
    const t = findTask(id);
    if (!t || !isIso(iso)) return;
    const before = cloneTask(t);
    t.date = iso; t.postponed++;
    save(); render();
    showToast(`Spostato a ${fmtRel(iso)}`, { label:'Annulla', fn:() => restoreTask(before) });
}
function applyAllMoves(){
    const { moves } = suggestMoves();
    if (!moves.length) return;
    const before = moves.map(m => cloneTask(m.t));
    moves.forEach(m => { m.t.date = m.target; m.t.postponed++; });
    save(); render();
    showToast(`${moves.length} impegni spostati`, { label:'Annulla', fn:() => {
        before.forEach(b => { const i = data.tasks.findIndex(x => x.id === b.id); if (i >= 0) data.tasks[i] = b; });
        save(); render();
    } });
}

// ── Calibrazione dei costi ──────────────────────────────────────────────────
function openCalib(taskId, ts, expected){
    const t = findTask(taskId);
    if (!t) return;
    $('calibBody').innerHTML = `
        <div class="modal-title">Quanto ti è costato?</div>
        <p class="confirm-msg" style="margin-bottom:12px;">${escHtml(t.title)}: avevo previsto ${fmtSp(expected)} ${spWord(expected)}.</p>
        <div class="calib-grid">${[0, 0.5, 1, 1.5, 2, 2.5, 3, 4].map(n => `<button class="btn ${n === expected ? 'btn-primary' : 'btn-secondary'}" onclick="calibrate(${jsArg(taskId)},${ts},${n},${expected})">${fmtSp(n)}</button>`).join('')}</div>
        <div class="calib-fine"><span>Altro valore</span>
            <div class="sp-stepper on"><button type="button" onclick="stepCalib(-1)" aria-label="Meno">−</button><span id="calibVal">🥄 ${fmtSp(expected)}</span><button type="button" onclick="stepCalib(1)" aria-label="Più">+</button></div>
            <button class="add-btn" onclick="calibrate(${jsArg(taskId)},${ts},calibVal,${expected})">Salva</button></div>
        <button class="btn btn-secondary" onclick="closeModal('modalCalib')">Come previsto</button>`;
    calibVal = expected;
    openModal('modalCalib');
}
let calibVal = 0;
function stepCalib(dir){ calibVal = clamp(qr(calibVal + dir * 0.25), 0, OTHER_COST_MAX); $('calibVal').textContent = '🥄 ' + fmtSp(calibVal); }
function calibrate(taskId, ts, n, expected){
    n = qr(n);
    const today = todayStr(), d = dayRec(today);
    const entry = d && d.done.find(e => e.ts === ts);
    closeModal('modalCalib');
    if (!entry || n === expected) return;
    entry.cost = n;
    const t = findTask(taskId);
    // Gli impegni che si ripetono imparano il costo vero per la prossima volta
    if (t && t.rec) t.cost = clamp(n, 0, TASK_COST_MAX);
    save(); render();
    showToast(t && t.rec ? `Segnato ${fmtSp(n)}. La prossima volta lo conto ${fmtSp(clamp(n, 0, TASK_COST_MAX))}` : `Segnato: ${fmtSp(n)} ${spWord(n)}`);
}

// ── Vista Energia ───────────────────────────────────────────────────────────
function costOptions(sel){ return OTHER_STEPS.map(n => `<option value="${n}"${n === sel ? ' selected' : ''}>🥄 ${fmtSp(n)}</option>`).join(''); }
function renderEnergyView(area){
    const today = todayStr(), st = settings(), d = dayRec(today), checked = hasCheckin(today);
    const ans = checked ? CHECKIN_QS.filter(q => d[q.key] !== null).map(q => `${q.label.replace('?', '')}: ${q.opts[d[q.key]].toLowerCase()}`) : [];
    const fixed = fixedFor(today);
    const extras = d ? d.extras : [], done = d ? d.done : [];
    area.innerHTML = `
        <div class="block card">
            <div class="block-title"><span>Oggi</span><span class="count">${checked ? `${spentOn(today)} spesi su ${d.spoons}` : ''}</span></div>
            ${checked ? `<div class="e-summary">${ans.length ? escHtml(ans.join('. ')) + '.' : ''}${d.debt ? ` Debito da ieri: −${d.debt}.` : ''}</div>
                <button class="btn btn-secondary" style="margin-top:0;" onclick="openCheckin()">Rifai il check-in</button>`
                : `<button class="btn btn-primary" style="margin-top:0;" onclick="openCheckin()">Fai il check-in</button>`}
            <div class="field-label">Spese fisse di oggi</div>
            ${fixed.length ? fixed.map(x => `<div class="e-row${x.skipped ? ' off' : ''}" onclick="toggleFixedToday(${jsArg(x.f.id)})" role="checkbox" aria-checked="${!x.skipped}">
                <span class="shop-box"></span><span class="e-name">${escHtml(x.f.name)}</span><span class="m-spoon">🥄${fmtSp(x.f.cost)}</span></div>`).join('')
                + `<div class="e-hint">Togli la spunta a quello che oggi non fai (es. niente lezioni).</div>`
                : `<div class="empty-note">Nessuna spesa fissa per oggi.</div>`}
            <div class="field-label">Altro che ti ha stancato oggi</div>
            ${extras.map(e => `<div class="e-row static"><span class="e-name">${escHtml(e.name)}</span><span class="m-spoon">🥄${fmtSp(e.cost)}</span>
                <button class="shop-edit" onclick="removeExtra(${jsArg(e.id)})" aria-label="Elimina">✕</button></div>`).join('')}
            <div class="e-add">
                <input type="text" id="exName" placeholder="Visita, viaggio, esame…" maxlength="50" onkeydown="if(event.key==='Enter'){event.preventDefault();addExtra();}">
                <select class="styled-select" id="exCost" aria-label="Cucchiaini">${costOptions(1)}</select>
                <button class="add-btn" onclick="addExtra()">Aggiungi</button>
            </div>
            ${done.length ? `<div class="field-label">Fatti oggi</div>${done.map(e => `<div class="e-row static"><span class="e-name">${escHtml(e.title)}</span><span class="m-spoon">🥄${fmtSp(e.cost)}</span></div>`).join('')}` : ''}
        </div>
        <div class="block card"><div class="block-title"><span>Andamento</span><span class="count">14 giorni</span></div>${energyChartHtml()}</div>
        <div class="block card"><div class="block-title"><span>Spese fisse</span></div>
            ${data.fixedCosts.map(f => `<div class="e-row" onclick="openFixedModal(${jsArg(f.id)})"><span class="e-name">${escHtml(f.name)}
                <span class="e-days">${f.days.length ? f.days.map(n => ISO_DOW_LABELS[n].toLowerCase()).join(', ') : 'ogni giorno'}</span></span><span class="m-spoon">🥄${fmtSp(f.cost)}</span></div>`).join('')
                || `<div class="empty-note">Nessuna spesa fissa. Aggiungi le cose che fai quasi ogni giorno: igiene, lezioni, lavoro.</div>`}
            <button class="btn btn-secondary" onclick="openFixedModal()">+ Spesa fissa</button>
        </div>
        <div class="block card"><div class="block-title"><span>Impostazioni</span></div>
            <div class="set-row"><div><div class="set-name">Giornata buona</div><div class="set-desc">Cucchiaini quando stai bene</div></div>
                <div class="stepper"><button onclick="stepSetting('max',-1)" aria-label="Meno">−</button><span>${st.max}</span><button onclick="stepSetting('max',1)" aria-label="Più">+</button></div></div>
            <div class="set-row"><div><div class="set-name">Riserva</div><div class="set-desc">Cucchiaini da non pianificare mai</div></div>
                <div class="stepper"><button onclick="stepSetting('reserve',-1)" aria-label="Meno">−</button><span>${st.reserve}</span><button onclick="stepSetting('reserve',1)" aria-label="Più">+</button></div></div>
            <label class="check-row set-check"><input type="checkbox" ${st.debt ? 'checked' : ''} onchange="setSettingFlag('debt',this.checked)">
                <span><b>Debito</b>: se sfori, il giorno dopo parti con qualche cucchiaino in meno (al massimo un quarto)</span></label>
            <label class="check-row set-check"><input type="checkbox" ${st.calib ? 'checked' : ''} onchange="setSettingFlag('calib',this.checked)">
                <span><b>Calibrazione</b>: dopo ogni impegno fatto, chiedimi quanto mi è costato davvero</span></label>
        </div>`;
}
function energyChartHtml(){
    const today = todayStr(), st = settings();
    const days = Array.from({ length:14 }, (_, i) => shiftDate(today, i - 13));
    const recs = days.map(iso => ({ iso, av:hasCheckin(iso) ? dayRec(iso).spoons : null, sp:spentOn(iso) }));
    const withData = recs.filter(r => r.av !== null);
    if (withData.length < 2) return `<div class="empty-note">Il grafico compare dopo qualche giorno di check-in.</div>`;
    const top = Math.max(st.max, ...withData.map(r => Math.max(r.av, r.sp)), 1);
    const bars = recs.map(r => {
        const dt = parseLocalDate(r.iso);
        const lbl = `<span class="ch-lbl${r.iso === today ? ' today' : ''}">${dt.getDate()}</span>`;
        if (r.av === null) return `<div class="ch-col">${'<div class="ch-area"></div>'}${lbl}</div>`;
        const over = r.sp > r.av;
        return `<div class="ch-col" title="${fmtDate(r.iso)}: spesi ${r.sp} su ${r.av}"><div class="ch-area">
            <div class="ch-av" style="height:${r.av / top * 100}%"></div>
            <div class="ch-sp${over ? ' over' : ''}" style="height:${Math.min(r.sp, top) / top * 100}%"></div></div>${lbl}</div>`;
    }).join('');
    const avg = withData.reduce((n, r) => n + r.av, 0) / withData.length;
    const overDays = withData.filter(r => r.sp > r.av).length;
    // Giorno della settimana più faticoso (ultime 8 settimane, servono dati sufficienti)
    let pattern = '';
    const since = shiftDate(today, -56);
    const byDow = {};
    data.days.filter(d => typeof d.spoons === 'number' && d.id >= since).forEach(d => {
        const w = isoDow(parseLocalDate(d.id));
        (byDow[w] = byDow[w] || []).push(d.spoons);
    });
    const dows = Object.keys(byDow).filter(k => byDow[k].length >= 2);
    if (dows.length >= 4) {
        const avgOf = k => byDow[k].reduce((a, b) => a + b, 0) / byDow[k].length;
        const worst = dows.reduce((a, b) => avgOf(a) <= avgOf(b) ? a : b);
        const all = dows.reduce((n, k) => n + avgOf(k), 0) / dows.length;
        if (all - avgOf(worst) >= 1) pattern = `<div class="e-hint">Di solito il giorno con meno energie è ${+worst === 7 ? 'la' : 'il'} ${DOW_FULL[worst % 7].toLowerCase()} (in media ${avgOf(worst).toFixed(1).replace('.', ',')}). Tienilo leggero.</div>`;
    }
    return `<div class="chart">${bars}</div>
        <div class="energy-legend"><span><i class="lg avail"></i>Disponibili</span><span><i class="lg spent-fill"></i>Spesi</span><span><i class="lg over"></i>Sforato</span></div>
        <div class="e-hint">Media disponibili: ${avg.toFixed(1).replace('.', ',')}. Giorni sforati: ${overDays} su ${withData.length}.</div>${pattern}`;
}
function stepSetting(key, dir, inCheckin){
    const st = settings();
    if (key === 'max') st.max = clamp(st.max + dir, 4, 40);
    else st.reserve = clamp(st.reserve + dir, 0, Math.min(10, st.max - 1));
    save();
    if (inCheckin) { ci.manual = null; renderCheckin(); _pendingRender = true; }
    else render();
}
function setSettingFlag(key, val){ settings()[key] = !!val; save(); }
function toggleFixedToday(id){
    const d = ensureDay(todayStr());
    d.skipFixed = d.skipFixed.includes(id) ? d.skipFixed.filter(x => x !== id) : [...d.skipFixed, id];
    save(); render();
}
function addExtra(){
    const name = $('exName').value.trim();
    if (!name) { $('exName').focus(); return; }
    ensureDay(todayStr()).extras.push({ id:uid(), name, cost:normCost($('exCost').value, 0.25, OTHER_COST_MAX) ?? 1 });
    save(); render();
    showToast(`${name} aggiunto`);
}
function removeExtra(id){
    const d = dayRec(todayStr());
    if (!d) return;
    d.extras = d.extras.filter(e => e.id !== id);
    save(); render();
}
function openExtraQuick(){ setView('energy'); setTimeout(() => { const i = $('exName'); if (i) { i.scrollIntoView({ block:'center' }); i.focus(); } }, 50); }

// ── Spese fisse ─────────────────────────────────────────────────────────────
let editingFixedId = null, fxDays = [], fxCost = 1;
function openFixedModal(id){
    const f = id ? data.fixedCosts.find(x => x.id === id) : null;
    editingFixedId = f ? f.id : null;
    fxDays = f ? [...f.days] : [];
    fxCost = f ? f.cost : 1;
    $('fxTitle').textContent = f ? 'Spesa fissa' : 'Nuova spesa fissa';
    $('fxName').value = f ? f.name : '';
    $('fxDelete').classList.toggle('hidden', !f);
    renderFixedForm();
    openModal('modalFixed');
}
function renderFixedForm(){
    $('fxCost').innerHTML = [0.5, 1, 2, 3].map(n => `<button type="button" class="chip${fxCost === n ? ' on' : ''}" onclick="fxCost=${n};renderFixedForm()">${fmtSp(n)}</button>`).join('') +
        `<div class="sp-stepper on"><button type="button" onclick="fxCost=clamp(qr(fxCost-0.25),0.25,OTHER_COST_MAX);renderFixedForm()" aria-label="Meno">−</button><span>🥄 ${fmtSp(fxCost)}</span><button type="button" onclick="fxCost=clamp(qr(fxCost+0.25),0.25,OTHER_COST_MAX);renderFixedForm()" aria-label="Più">+</button></div>`;
    $('fxDays').innerHTML = [1,2,3,4,5,6,7].map(d => `<button type="button" class="chip${fxDays.includes(d) ? ' on' : ''}" onclick="toggleFxDay(${d})">${ISO_DOW_LABELS[d]}</button>`).join('');
    $('fxHint').textContent = fxDays.length ? '' : 'Nessun giorno scelto: vale tutti i giorni.';
}
function toggleFxDay(d){ fxDays = fxDays.includes(d) ? fxDays.filter(x => x !== d) : [...fxDays, d].sort((a, b) => a - b); renderFixedForm(); }
function saveFixed(){
    const name = $('fxName').value.trim();
    if (!name) { showToast('⚠ Dai un nome alla spesa fissa'); return; }
    if (editingFixedId) {
        const f = data.fixedCosts.find(x => x.id === editingFixedId);
        if (f) Object.assign(f, { name, cost:fxCost, days:[...fxDays] });
    } else data.fixedCosts.push({ id:uid(), name, cost:fxCost, days:[...fxDays] });
    save(); closeModal('modalFixed'); render();
}
function deleteFixed(){
    const f = data.fixedCosts.find(x => x.id === editingFixedId);
    if (!f) return;
    confirmDialog({ title:'Eliminare?', msg:`“${f.name}” non verrà più conteggiata.` }, () => {
        data.fixedCosts = data.fixedCosts.filter(x => x.id !== f.id);
        save(); closeModal('modalFixed'); render();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  STANZE (condivise tra Progetti e Riordino)
// ═══════════════════════════════════════════════════════════════════════════
function sortedRooms(){ return [...data.rooms].sort((a, b) => a.order - b.order); }
function getRoom(id){ return id ? data.rooms.find(r => r.id === id) || null : null; }
function openRoomsModal(){ renderRoomsBody(); openModal('modalRooms'); }
function renderRoomsBody(){
    const rooms = sortedRooms();
    $('roomsBody').innerHTML = rooms.map((r, i) => {
        const a = jsArg(r.id);
        return `<div class="mg-cat"><div class="mg-row">
            <input type="text" value="${escHtml(r.name)}" maxlength="40" onchange="renameRoom(${a},this.value)" aria-label="Nome stanza">
            <button class="mg-btn" onclick="moveRoom(${a},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">▲</button>
            <button class="mg-btn" onclick="moveRoom(${a},1)" ${i === rooms.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">▼</button>
            <button class="mg-btn danger" onclick="deleteRoom(${a})" aria-label="Elimina">✕</button>
        </div></div>`;
    }).join('') + `<div class="mg-row" style="margin-top:14px;">
        <input type="text" id="newRoom" placeholder="Nuova stanza (es. balcone, cameretta)" maxlength="40" onkeydown="if(event.key==='Enter'){event.preventDefault();addRoom();}">
        <button class="add-btn" onclick="addRoom()">Aggiungi</button></div>`;
}
function roomsChanged(){ save(); renderRoomsBody(); _pendingRender = true; }
function addRoom(){
    const name = $('newRoom').value.trim();
    if (!name) return;
    const maxO = data.rooms.reduce((m, r) => Math.max(m, r.order), -1);
    data.rooms.push({ id:uid(), name, order:maxO + 1, notes:'' });
    roomsChanged();
}
function renameRoom(id, v){ const r = getRoom(id); v = String(v).trim(); if (r && v) { r.name = v; save(); _pendingRender = true; } }
function moveRoom(id, dir){
    const rooms = sortedRooms(), i = rooms.findIndex(r => r.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= rooms.length) return;
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    rooms.forEach((r, k) => { if (r.order !== k) r.order = k; });
    roomsChanged();
}
function deleteRoom(id){
    const r = getRoom(id);
    if (!r) return;
    const nt = data.tasks.filter(t => t.roomId === id).length, np = data.photos.filter(p => p.roomId === id).length;
    const what = [nt ? `${nt} ${nt === 1 ? 'cosa da fare' : 'cose da fare'}` : '', np ? `${np} foto` : ''].filter(Boolean).join(' e ');
    confirmDialog({ title:'Eliminare?', msg:`La stanza “${r.name}” verrà eliminata${what ? `, con ${what}` : ''}. Lo storico del riordino resta.` }, () => {
        data.projects.forEach(p => { if (p.roomId === id) p.roomId = null; });
        data.tasks = data.tasks.filter(t => t.roomId !== id);
        data.photos.filter(p => p.roomId === id).forEach(p => { idbDel('blobs', p.id); idbDel('thumbs', p.id); deleteDrivePhoto(p.driveId); });
        data.photos = data.photos.filter(p => p.roomId !== id);
        if (ui.roomId === id) { ui.roomId = null; saveUi(); }
        data.rooms = data.rooms.filter(x => x.id !== id);
        if (ui.tidyRoom === id) { ui.tidyRoom = null; saveUi(); }
        roomsChanged();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  STANZE: cose da fare, foto, disegni e scritte sopra le foto
// ═══════════════════════════════════════════════════════════════════════════
const PHOTO_KINDS = { now:'Adesso', goal:'Obiettivo', idea:'Idea' };
const PEN_COLORS = ['#ffffff','#ffd54a','#ff5a5f','#7ed957','#4aa8ff','#111111'];
const PEN_SIZES = { 1:'Fine', 2:'Medio', 4:'Grosso' };
function roomTasks(id){ return data.tasks.filter(t => t.roomId === id).sort((a, b) => (a.order - b.order) || ((a.created || 0) - (b.created || 0))); }
function roomPhotos(id){ return data.photos.filter(p => p.roomId === id).sort((a, b) => b.created - a.created); }
function roomCover(id){ const ph = roomPhotos(id); return ph.find(p => p.kind === 'goal') || ph.find(p => p.kind === 'idea') || ph[0] || null; }
function roomStats(id){
    const ts = roomTasks(id), open = ts.filter(t => !t.done);
    return { total:ts.length, open:open.length, done:ts.length - open.length, left:qr(open.reduce((n, t) => n + effectiveCost(t), 0)) };
}
function getPhoto(id){ return data.photos.find(p => p.id === id) || null; }
function fillRoomSelect(selected){
    const sel = $('tRoom');
    sel.innerHTML = `<option value="">Nessuna stanza</option>` + sortedRooms().map(r => `<option value="${escHtml(r.id)}"${r.id === selected ? ' selected' : ''}>${escHtml(r.name)}</option>`).join('');
}
function openRoom(id){ ui.roomId = id; saveUi(); window.scrollTo(0, 0); render(); }
function closeRoom(){ ui.roomId = null; saveUi(); render(); }

function renderRooms(app){
    const r = getRoom(ui.roomId);
    if (r) { renderRoomDetail(app, r); return; }
    if (ui.roomId) { ui.roomId = null; saveUi(); }
    const rooms = sortedRooms();
    app.innerHTML = `
        <div class="sec-head"><div><div class="sec-title">Stanze ${helpBtn('rooms')}</div><div class="sec-sub">Cosa fare in ogni stanza, con le foto di com’è e di come la vorresti</div></div>
            <button class="add-btn" onclick="openRoomsModal()">Modifica</button></div>
        <div class="room-list">${rooms.map(x => {
            const st = roomStats(x.id), cover = roomCover(x.id), nph = roomPhotos(x.id).length;
            const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
            return `<div class="room-tile" onclick="openRoom(${jsArg(x.id)})">
                <div class="room-cover">${cover ? photoMediaHtml(cover, 'thumb') : `<span class="room-cover-empty">${escHtml(x.name.charAt(0).toUpperCase())}</span>`}</div>
                <div class="room-info"><div class="room-tname">${escHtml(x.name)}</div>
                    <div class="room-tmeta">${st.open ? `${st.open} da fare` : st.total ? 'tutto fatto ✓' : 'niente in lista'}${nph ? ` · ${nph} foto` : ''}</div>
                    ${st.total ? `<div class="progress"><span style="width:${pct}%"></span></div>` : ''}</div></div>`;
        }).join('') || `<div class="empty-note">Nessuna stanza. Tocca “Modifica” per aggiungerne.</div>`}</div>`;
    hydratePhotos(app);
}
// Foto + disegni sovrapposti (stessa resa nelle miniature e nel visore)
function photoMediaHtml(p, size){
    return `<img data-photo="${escHtml(p.id)}" data-size="${size}" alt="">
        <svg class="annot" viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${annotInner(p)}</svg>`;
}
function photoTileHtml(p){
    const drawn = p.strokes.length || p.texts.length;
    return `<div class="photo-tile" onclick="openViewer(${jsArg(p.id)})">${photoMediaHtml(p, 'thumb')}
        <span class="photo-kind k-${p.kind}">${PHOTO_KINDS[p.kind]}</span>${drawn ? '<span class="photo-drawn">✎</span>' : ''}
        ${p.caption ? `<span class="photo-cap">${escHtml(p.caption)}</span>` : ''}</div>`;
}
function stepRowHtml(t, i, n){
    const a = jsArg(t.id);
    const meta = [`🥄${fmtSp(effectiveCost(t))}`];
    if (t.date) meta.push(fmtRel(t.date) + (t.time ? ' ' + t.time : ''));
    if (t.rec) meta.push('↻ ' + recLabel(t.rec));
    return `<div class="step-row${t.done ? ' done' : ''}">
        <button class="task-check${t.done ? ' checked' : ''}" style="--c:var(--accent)" onclick="${t.done ? `reopenTask(${a})` : `completeTask(${a})`}" aria-label="${t.done ? 'Riapri' : 'Fatto'}">${t.done ? '✓' : ''}</button>
        <div class="step-body" onclick="openTaskSheet(${a})"><div class="step-title">${escHtml(t.title)}</div><div class="task-meta">${meta.map(m => `<span>${escHtml(m)}</span>`).join('')}</div></div>
        ${t.done ? '' : `<div class="step-move"><button onclick="moveStep(${a},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">▲</button><button onclick="moveStep(${a},1)" ${i === n - 1 ? 'disabled' : ''} aria-label="Sposta giù">▼</button></div>`}
    </div>`;
}
let stepCost = 1;
function renderRoomDetail(app, r){
    const a = jsArg(r.id);
    const tasks = roomTasks(r.id), open = tasks.filter(t => !t.done), done = tasks.filter(t => t.done);
    const photos = roomPhotos(r.id), filt = ui.photoFilter || 'all';
    const shown = filt === 'all' ? photos : photos.filter(p => p.kind === filt);
    const st = roomStats(r.id);
    const cnt = k => k === 'all' ? photos.length : photos.filter(p => p.kind === k).length;
    app.innerHTML = `
        <button class="link-btn back" onclick="closeRoom()">‹ Stanze</button>
        <div class="sec-head" style="margin-top:4px;"><div><div class="sec-title">${escHtml(r.name)} ${helpBtn('room')}</div>
            <div class="sec-sub">${st.total ? `${st.done} di ${st.total} fatte${st.left ? ` · mancano ${fmtSp(st.left)} cucchiaini` : ''}` : 'Aggiungi foto e cose da fare'}</div></div></div>
        <div class="block card">
            <div class="block-title"><span>Foto</span><button class="add-btn" onclick="pickPhoto()">+ Foto</button></div>
            ${photos.length ? `<div class="chip-row">${['all','now','goal','idea'].map(k => `<button class="chip${filt === k ? ' on' : ''}" onclick="ui.photoFilter='${k}';saveUi();render()">${k === 'all' ? 'Tutte' : PHOTO_KINDS[k]} · ${cnt(k)}</button>`).join('')}</div>
                <div class="photo-grid">${shown.map(photoTileHtml).join('') || `<div class="empty-note">Nessuna foto di questo tipo.</div>`}</div>`
                : `<div class="empty-note">Fotografa com’è adesso e aggiungi immagini di come la vorresti. Sopra puoi scrivere e disegnare, anche con la pennina.</div>`}
        </div>
        <div class="block card">
            <div class="block-title"><span>Da fare</span><span class="count">${open.length || ''}</span></div>
            ${open.map((t, i) => stepRowHtml(t, i, open.length)).join('') || `<div class="empty-note">Niente in lista.</div>`}
            <div class="step-add">
                <input type="text" id="stepTitle" placeholder="Cosa c’è da fare? (es. montare il Kallax)" maxlength="140" onkeydown="if(event.key==='Enter'){event.preventDefault();addRoomTask();}">
                <div class="sp-stepper on"><button type="button" onclick="stepCost=clamp(qr(stepCost-0.25),0,TASK_COST_MAX);$('stepCostVal').textContent='🥄 '+fmtSp(stepCost)" aria-label="Meno">−</button><span id="stepCostVal">🥄 ${fmtSp(stepCost)}</span><button type="button" onclick="stepCost=clamp(qr(stepCost+0.25),0,TASK_COST_MAX);$('stepCostVal').textContent='🥄 '+fmtSp(stepCost)" aria-label="Più">+</button></div>
                <button class="add-btn" onclick="addRoomTask()">Aggiungi</button>
            </div>
            <div class="e-hint">Le cose senza data restano qui. Toccane una e scegli un giorno: finirà negli impegni e nelle energie.</div>
        </div>
        ${done.length ? `<div class="block card"><div class="block-title"><span>Fatte</span><button class="link-btn danger" onclick="clearRoomDone(${a})">Svuota</button></div>${done.map((t, i) => stepRowHtml(t, i, done.length)).join('')}</div>` : ''}
        <div class="block card"><div class="block-title"><span>Note</span></div>
            <textarea id="roomNotes" placeholder="Come la vorresti? Misure, colori, idee…" onchange="saveRoomNotes(${a},this.value)">${escHtml(r.notes)}</textarea></div>`;
    hydratePhotos(app);
}
function addRoomTask(){
    const inp = $('stepTitle'), title = inp ? inp.value.trim() : '';
    if (!title) { if (inp) inp.focus(); return; }
    const r = getRoom(ui.roomId);
    if (!r) return;
    const now = Date.now();
    data.tasks.push({ id:uid(), title, catId:null, subId:null, urg:1, cost:stepCost, roomId:r.id, projectId:null, date:null, time:null, notes:'',
        rec:null, sched:null, anchor:null, postponed:0, log:[], done:false, doneAt:null, created:now, order:now });
    save(); render();
    const again = $('stepTitle'); if (again) again.focus();
}
function moveStep(id, dir){
    const t = findTask(id);
    if (!t || !t.roomId) return;
    const open = roomTasks(t.roomId).filter(x => !x.done);
    const i = open.findIndex(x => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= open.length) return;
    [open[i], open[j]] = [open[j], open[i]];
    open.forEach((x, k) => { x.order = k; });
    save(); render();
}
function clearRoomDone(roomId){
    const n = roomTasks(roomId).filter(t => t.done).length;
    confirmDialog({ title:'Svuotare?', msg:`Tolgo ${n} ${n === 1 ? 'cosa fatta' : 'cose fatte'} dalla lista di questa stanza.`, ok:'Svuota' }, () => {
        data.tasks = data.tasks.filter(t => !(t.roomId === roomId && t.done));
        save(); render();
    });
}
function saveRoomNotes(id, v){ const r = getRoom(id); if (r) { r.notes = String(v); save(); } }

// ── Archivio immagini (IndexedDB: regge molte più foto del localStorage) ────
let _idbP = null;
function idb(){
    return _idbP = _idbP || new Promise((res, rej) => {
        const rq = indexedDB.open('casahub-img', 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore('blobs'); rq.result.createObjectStore('thumbs'); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    });
}
function idbReq(store, mode, fn){
    return idb().then(db => new Promise((res, rej) => {
        const tx = db.transaction(store, mode), q = fn(tx.objectStore(store));
        tx.oncomplete = () => res(q && 'result' in q ? q.result : undefined);
        tx.onerror = () => rej(tx.error);
    }));
}
const idbGet = (s, k) => idbReq(s, 'readonly', st => st.get(k)).then(v => v || null).catch(() => null);
const idbPut = (s, k, v) => idbReq(s, 'readwrite', st => st.put(v, k));
const idbDel = (s, k) => idbReq(s, 'readwrite', st => st.delete(k)).catch(() => {});
const idbKeys = s => idbReq(s, 'readonly', st => st.getAllKeys()).catch(() => []);
function loadImage(src){ return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
async function resizeBlob(src, maxSide, quality){
    const url = URL.createObjectURL(src);
    try {
        const im = await loadImage(url);
        const sc = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(1, Math.round(im.naturalWidth * sc)), h = Math.max(1, Math.round(im.naturalHeight * sc));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
        return { blob, w, h };
    } finally { URL.revokeObjectURL(url); }
}
function blobToB64(blob){ return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); }); }
function b64ToBlob(b64, mime){ const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type:mime || 'image/jpeg' }); }
const _urls = new Map(), _downloads = new Map();
async function getPhotoUrl(id, size){
    const key = id + '|' + size;
    if (_urls.has(key)) return _urls.get(key);
    let blob = await idbGet(size === 'thumb' ? 'thumbs' : 'blobs', id);
    if (!blob && size === 'thumb') {
        const full = await idbGet('blobs', id);
        if (full) { blob = (await resizeBlob(full, 480, 0.72)).blob; idbPut('thumbs', id, blob).catch(() => {}); }
    }
    if (!blob) {
        const full = await downloadPhoto(id);
        if (!full) return null;
        blob = size === 'thumb' ? (await idbGet('thumbs', id)) || full : full;
    }
    const url = URL.createObjectURL(blob);
    _urls.set(key, url);
    return url;
}
function hydratePhotos(root){
    root.querySelectorAll('img[data-photo]').forEach(async img => {
        if (img.dataset.done) return;
        img.dataset.done = '1';
        const url = await getPhotoUrl(img.dataset.photo, img.dataset.size || 'thumb');
        if (url) img.src = url;
        else { const box = img.closest('.photo-tile,.room-cover'); if (box) box.classList.add('missing'); }
    });
}
// Foto creata su un altro dispositivo: la scarica da Drive tramite lo script, una volta sola
function downloadPhoto(id){
    const p = getPhoto(id);
    if (!p || !p.driveId || !syncUrl || !navigator.onLine) return Promise.resolve(null);
    if (_downloads.has(id)) return _downloads.get(id);
    const job = (async () => {
        try {
            const res = await fetch(`${syncUrl}?action=imgget&id=${encodeURIComponent(p.driveId)}&t=${Date.now()}`, { cache:'no-store' });
            const j = await res.json();
            if (!j || !j.ok || !j.data) return null;
            const blob = b64ToBlob(j.data, j.mime);
            await idbPut('blobs', id, blob);
            const thumb = (await resizeBlob(blob, 480, 0.72)).blob;
            await idbPut('thumbs', id, thumb);
            return blob;
        } catch (_) { return null; }
        finally { _downloads.delete(id); }
    })();
    _downloads.set(id, job);
    return job;
}
let _uploading = false, _photoSyncError = '';
async function uploadPending(){
    if (_uploading || !syncUrl || !navigator.onLine) return;
    _uploading = true;
    try {
        for (const p of data.photos.filter(x => !x.driveId)) {
            const blob = await idbGet('blobs', p.id);
            if (!blob) continue;
            const res = await fetch(`${syncUrl}?action=imgput`, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
                body:JSON.stringify({ kind:'img', id:p.id, mime:blob.type || 'image/jpeg', data:await blobToB64(blob) }) });
            let j = null;
            try { j = await res.json(); } catch (_) {}
            if (!j || !j.ok || !j.fileId) {
                const old = !j || /dati non validi|unknown/i.test(j.error || '');
                _photoSyncError = old ? 'Per salvare le foto su Drive aggiorna lo script Google (Sync → Script Google).' : 'Foto non caricate: ' + (j.error || 'errore');
                break;
            }
            _photoSyncError = '';
            const cur = getPhoto(p.id);
            if (cur) { cur.driveId = j.fileId; save(); }
            else deleteDrivePhoto(j.fileId); // eliminata nel frattempo
        }
    } catch (e) { _photoSyncError = 'Foto non caricate: ' + (e.message || 'errore di rete'); }
    finally { _uploading = false; }
}
function deleteDrivePhoto(fileId){
    if (!fileId || !syncUrl) return;
    fetch(`${syncUrl}?action=imgdel`, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify({ kind:'imgdel', fileId }) }).catch(() => {});
}
// Pulizia: immagini locali di foto che non esistono più (eliminate anche da un altro dispositivo)
async function gcPhotos(){
    const ids = new Set(data.photos.map(p => p.id));
    for (const s of ['blobs', 'thumbs']) for (const k of await idbKeys(s)) if (!ids.has(k)) idbDel(s, k);
}

// ── Aggiunta di una foto ────────────────────────────────────────────────────
let _newPhoto = null;
function pickPhoto(){ const i = $('photoInput'); i.value = ''; i.click(); }
async function handlePhotoPick(ev){
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    showToast('Preparo la foto…');
    try {
        const full = await resizeBlob(file, 1600, 0.82);
        const thumb = await resizeBlob(full.blob, 480, 0.72);
        _newPhoto = { blob:full.blob, thumb:thumb.blob, w:full.w, h:full.h, kind:'now' };
        $('npPreview').src = URL.createObjectURL(thumb.blob);
        $('npCaption').value = '';
        renderNewPhotoKinds();
        openModal('modalNewPhoto');
    } catch (e) { showToast('⚠ Immagine non leggibile'); }
}
function renderNewPhotoKinds(){
    $('npKinds').innerHTML = Object.entries(PHOTO_KINDS).map(([k, v]) => `<button type="button" class="chip${_newPhoto.kind === k ? ' on' : ''}" onclick="_newPhoto.kind='${k}';renderNewPhotoKinds()">${v}</button>`).join('');
}
async function saveNewPhoto(){
    if (!_newPhoto || !getRoom(ui.roomId)) { closeModal('modalNewPhoto'); return; }
    const id = uid();
    try {
        await idbPut('blobs', id, _newPhoto.blob);
        await idbPut('thumbs', id, _newPhoto.thumb);
    } catch (e) { showToast('⚠ Spazio insufficiente per salvare la foto'); return; }
    data.photos.push({ id, roomId:ui.roomId, kind:_newPhoto.kind, caption:$('npCaption').value.trim(), w:_newPhoto.w, h:_newPhoto.h,
        driveId:null, strokes:[], texts:[], created:Date.now() });
    URL.revokeObjectURL($('npPreview').src);
    _newPhoto = null;
    // chiede al browser di non cancellare mai l'archivio delle foto per liberare spazio
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}
    save(); closeModal('modalNewPhoto'); render();
    showToast('Foto aggiunta: toccala per scriverci sopra');
    uploadPending();
}

// ── Disegni: tratti e scritte in coordinate della foto ─────────────────────
const isHex = c => /^#[0-9a-f]{6}$/i.test(c);
function haloFor(c){
    const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (r * 0.299 + g * 0.587 + b * 0.114) > 140 ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.85)';
}
function strokePath(pts){
    if (!pts.length) return '';
    const f = v => Math.round(v * 10) / 10;
    if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}l0.1 0`;
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
    }
    const l = pts[pts.length - 1];
    return d + `L${f(l[0])} ${f(l[1])}`;
}
function annotInner(p){
    return p.strokes.map(s => `<path d="${strokePath(s.pts)}" stroke="${s.c}" stroke-width="${s.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('') +
        p.texts.map(t => `<text x="${t.x}" y="${t.y}" font-size="${t.fs}" fill="${t.c}" stroke="${haloFor(t.c)}" stroke-width="${t.fs * 0.16}" paint-order="stroke" stroke-linejoin="round" font-family="Nunito, Segoe UI, sans-serif" font-weight="800">${escHtml(t.t)}</text>`).join('');
}

// ── Visore / editor a schermo intero ────────────────────────────────────────
let vw = null;
function viewerOpen(){ return !!vw; }
function openViewer(id){
    const p = getPhoto(id);
    if (!p) return;
    vw = { id, editing:false, tool:'pen', color:ui.penColor || '#ffd54a', size:ui.penSize || 2, penOnly:!!ui.penOnly,
        s:1, tx:0, ty:0, fit:1, pointers:new Map(), drawing:null, pinch:null, pan:null, erase:null, tap:null, history:[] };
    $('vwCaption').value = p.caption;
    $('vwKind').innerHTML = Object.entries(PHOTO_KINDS).map(([k, v]) => `<option value="${k}"${p.kind === k ? ' selected' : ''}>${v}</option>`).join('');
    const cv = $('vwCanvas'), img = $('vwImg'), svg = $('vwSvg');
    cv.style.width = p.w + 'px'; cv.style.height = p.h + 'px';
    img.removeAttribute('src'); img.style.width = p.w + 'px'; img.style.height = p.h + 'px';
    svg.setAttribute('viewBox', `0 0 ${p.w} ${p.h}`); svg.setAttribute('width', p.w); svg.setAttribute('height', p.h);
    $('vwMissing').classList.add('hidden');
    $('photoViewer').classList.remove('hidden');
    document.body.classList.add('no-scroll');
    renderViewerBar(); renderAnnot(); requestAnimationFrame(fitView);
    getPhotoUrl(id, 'full').then(url => { if (!vw || vw.id !== id) return; if (url) img.src = url; else $('vwMissing').classList.remove('hidden'); });
    try { history.pushState({ casahubViewer:1 }, ''); } catch (_) {}
}
function closeViewer(fromPop){
    if (!vw) return;
    const p = getPhoto(vw.id);
    if (p) {
        const cap = $('vwCaption').value.trim(), kind = $('vwKind').value;
        if (cap !== p.caption || (PHOTO_KINDS[kind] && kind !== p.kind)) { p.caption = cap; if (PHOTO_KINDS[kind]) p.kind = kind; save(); }
    }
    vw = null;
    $('photoViewer').classList.add('hidden');
    document.body.classList.remove('no-scroll');
    if (!fromPop) { try { if (history.state && history.state.casahubViewer) history.back(); } catch (_) {} }
    render();
}
window.addEventListener('popstate', () => { if (vw) closeViewer(true); });
function fitView(){
    if (!vw) return;
    const p = getPhoto(vw.id), st = $('vwStage').getBoundingClientRect();
    const s = Math.min(st.width / p.w, st.height / p.h);
    vw.fit = vw.s = s; vw.tx = (st.width - p.w * s) / 2; vw.ty = (st.height - p.h * s) / 2;
    applyView();
}
function applyView(){ $('vwCanvas').style.transform = `translate(${vw.tx}px,${vw.ty}px) scale(${vw.s})`; }
function renderAnnot(){ const p = getPhoto(vw.id); if (p) $('vwSvg').innerHTML = annotInner(p); }
function renderViewerBar(){
    const bar = $('vwBar');
    if (!vw.editing) {
        bar.innerHTML = `<div class="vw-row">
            <button class="vw-btn primary" onclick="setEditing(true)">✎ Scrivi e disegna</button>
            <button class="vw-btn" onclick="exportPhoto()">Condividi</button>
            <button class="vw-btn danger" onclick="deletePhoto()">Elimina</button></div>
            <div class="vw-hint">Due dita per ingrandire · ${'⤢'} per tornare a tutta foto</div>`;
        return;
    }
    const tool = (k, label) => `<button class="vw-btn${vw.tool === k ? ' on' : ''}" onclick="vw.tool='${k}';renderViewerBar()">${label}</button>`;
    bar.innerHTML = `<div class="vw-row">${tool('pen', '✎ Penna')}${tool('text', 'T Testo')}${tool('eraser', '⌫ Gomma')}
            <button class="vw-btn" onclick="undoAnnot()" ${vw.history.length ? '' : 'disabled'} aria-label="Annulla">↶</button></div>
        <div class="vw-row">${PEN_COLORS.map(c => `<button class="swatch${vw.color === c ? ' on' : ''}" style="background:${c}" onclick="setPen('color','${c}')" aria-label="Colore"></button>`).join('')}
            <span class="vw-sep"></span>${Object.entries(PEN_SIZES).map(([n, l]) => `<button class="size-dot${vw.size === +n ? ' on' : ''}" onclick="setPen('size',${n})" aria-label="${l}"><i style="width:${4 + n * 3}px;height:${4 + n * 3}px"></i></button>`).join('')}</div>
        <div class="vw-row">
            <label class="vw-check"><input type="checkbox" ${vw.penOnly ? 'checked' : ''} onchange="setPen('penOnly',this.checked)"> Solo pennina</label>
            <button class="vw-btn" onclick="clearAnnot()">Cancella tutto</button>
            <button class="vw-btn primary" onclick="setEditing(false)">Fatto</button></div>
        <div class="vw-hint">${vw.penOnly ? 'Scrivi con la pennina; con le dita sposti e ingrandisci.' : 'Un dito disegna; due dita spostano e ingrandiscono.'}</div>`;
}
function setEditing(on){ vw.editing = on; renderViewerBar(); }
function setPen(k, v){
    vw[k] = v;
    if (k === 'color') ui.penColor = v; else if (k === 'size') ui.penSize = v; else ui.penOnly = v;
    saveUi(); renderViewerBar();
}
function annotSnapshot(){ const p = getPhoto(vw.id); return JSON.stringify({ s:p.strokes, t:p.texts }); }
function pushHistory(){ vw.history.push(annotSnapshot()); if (vw.history.length > 40) vw.history.shift(); }
function undoAnnot(){
    const snap = vw.history.pop(), p = getPhoto(vw.id);
    if (!snap || !p) return;
    const o = JSON.parse(snap); p.strokes = o.s; p.texts = o.t;
    save(); renderAnnot(); renderViewerBar();
}
function clearAnnot(){
    const p = getPhoto(vw.id);
    if (!p || (!p.strokes.length && !p.texts.length)) return;
    pushHistory(); p.strokes = []; p.texts = [];
    save(); renderAnnot(); renderViewerBar();
    showToast('Disegni cancellati', { label:'Annulla', fn:undoAnnot });
}
function toImg(e){
    const r = $('vwStage').getBoundingClientRect();
    return [(e.clientX - r.left - vw.tx) / vw.s, (e.clientY - r.top - vw.ty) / vw.s];
}
// spessore e testo pensati "a schermo": se sei ingrandita, il tratto resta fine
function zoomK(){ return vw.fit / vw.s; }
function initViewerGestures(){
    const stage = $('vwStage');
    stage.addEventListener('pointerdown', e => {
        if (!vw) return;
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
        vw.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
        if (vw.pointers.size === 2) { cancelStroke(); vw.erase = null; vw.tap = null; startPinch(); return; }
        if (vw.pointers.size > 2) return;
        const canDraw = vw.editing && (!vw.penOnly || e.pointerType === 'pen' || e.pointerType === 'mouse');
        if (!canDraw) { vw.pan = { id:e.pointerId, x:e.clientX, y:e.clientY, tx:vw.tx, ty:vw.ty }; return; }
        const pt = toImg(e), p = getPhoto(vw.id);
        if (vw.tool === 'pen') {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const w = Math.max(0.5, p.w * 0.0035 * vw.size * zoomK());
            el.setAttribute('stroke', vw.color); el.setAttribute('stroke-width', w); el.setAttribute('fill', 'none');
            el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
            $('vwSvg').appendChild(el);
            vw.drawing = { id:e.pointerId, pts:[pt], w, el };
            el.setAttribute('d', strokePath(vw.drawing.pts));
        } else if (vw.tool === 'eraser') { vw.erase = { snap:annotSnapshot(), hit:false }; eraseAt(pt); }
        else vw.tap = { id:e.pointerId, x:e.clientX, y:e.clientY, pt };
    });
    stage.addEventListener('pointermove', e => {
        if (!vw || !vw.pointers.has(e.pointerId)) return;
        vw.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
        if (vw.pinch) { updatePinch(); return; }
        if (vw.drawing && vw.drawing.id === e.pointerId) {
            const pt = toImg(e), last = vw.drawing.pts[vw.drawing.pts.length - 1];
            if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) * vw.s < 1.5) return;
            vw.drawing.pts.push(pt);
            vw.drawing.el.setAttribute('d', strokePath(vw.drawing.pts));
        } else if (vw.erase) eraseAt(toImg(e));
        else if (vw.pan && vw.pan.id === e.pointerId) { vw.tx = vw.pan.tx + e.clientX - vw.pan.x; vw.ty = vw.pan.ty + e.clientY - vw.pan.y; applyView(); }
        else if (vw.tap && Math.hypot(e.clientX - vw.tap.x, e.clientY - vw.tap.y) > 10) vw.tap = null;
    });
    const end = e => {
        if (!vw || !vw.pointers.has(e.pointerId)) return;
        vw.pointers.delete(e.pointerId);
        if (vw.drawing && vw.drawing.id === e.pointerId) endStroke();
        if (vw.erase && !vw.pointers.size) {
            if (vw.erase.hit) { vw.history.push(vw.erase.snap); save(); renderViewerBar(); }
            vw.erase = null;
        }
        if (vw.tap && vw.tap.id === e.pointerId && e.type === 'pointerup') textTap(vw.tap.pt);
        vw.tap = null;
        if (vw.pointers.size < 2) vw.pinch = null;
        if (vw.pointers.size === 1) { const [id, q] = [...vw.pointers.entries()][0]; vw.pan = { id, x:q.x, y:q.y, tx:vw.tx, ty:vw.ty }; }
        if (!vw.pointers.size) vw.pan = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', e => {
        if (!vw) return;
        e.preventDefault();
        const r = stage.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
        zoomAround(cx, cy, vw.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    }, { passive:false });
    window.addEventListener('resize', () => { if (vw) fitView(); });
}
function zoomAround(cx, cy, ns){
    ns = clamp(ns, vw.fit * 0.8, vw.fit * 10);
    const ix = (cx - vw.tx) / vw.s, iy = (cy - vw.ty) / vw.s;
    vw.s = ns; vw.tx = cx - ix * ns; vw.ty = cy - iy * ns;
    applyView();
}
function startPinch(){
    const [a, b] = [...vw.pointers.values()], r = $('vwStage').getBoundingClientRect();
    vw.pan = null;
    vw.pinch = { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, cx:(a.x + b.x) / 2 - r.left, cy:(a.y + b.y) / 2 - r.top, s:vw.s, tx:vw.tx, ty:vw.ty };
}
function updatePinch(){
    const [a, b] = [...vw.pointers.values()], r = $('vwStage').getBoundingClientRect(), pc = vw.pinch;
    const ns = clamp(pc.s * Math.hypot(a.x - b.x, a.y - b.y) / pc.d, vw.fit * 0.8, vw.fit * 10);
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    const ix = (pc.cx - pc.tx) / pc.s, iy = (pc.cy - pc.ty) / pc.s;
    vw.s = ns; vw.tx = cx - ix * ns; vw.ty = cy - iy * ns;
    applyView();
}
function cancelStroke(){ if (vw && vw.drawing) { vw.drawing.el.remove(); vw.drawing = null; } }
function endStroke(){
    const d = vw.drawing, p = getPhoto(vw.id);
    vw.drawing = null;
    if (!d || !p) return;
    pushHistory();
    p.strokes.push({ c:vw.color, w:Math.round(d.w * 10) / 10, pts:d.pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) });
    save(); renderAnnot(); renderViewerBar();
}
function textBox(t){ return { x0:t.x, x1:t.x + t.t.length * t.fs * 0.58, y0:t.y - t.fs, y1:t.y + t.fs * 0.25 }; }
function eraseAt(pt){
    const p = getPhoto(vw.id), tol = 16 / vw.s;
    const before = p.strokes.length + p.texts.length;
    p.strokes = p.strokes.filter(s => !s.pts.some(q => Math.hypot(q[0] - pt[0], q[1] - pt[1]) < tol + s.w / 2));
    p.texts = p.texts.filter(t => { const b = textBox(t); return !(pt[0] > b.x0 - tol && pt[0] < b.x1 + tol && pt[1] > b.y0 - tol && pt[1] < b.y1 + tol); });
    if (p.strokes.length + p.texts.length !== before) { vw.erase.hit = true; renderAnnot(); }
}
let _textEdit = null;
function textTap(pt){
    const p = getPhoto(vw.id);
    const idx = p.texts.findIndex(t => { const b = textBox(t); return pt[0] > b.x0 && pt[0] < b.x1 && pt[1] > b.y0 && pt[1] < b.y1; });
    _textEdit = { idx, pt };
    $('txtInput').value = idx >= 0 ? p.texts[idx].t : '';
    $('txtDelete').classList.toggle('hidden', idx < 0);
    openModal('modalText');
    setTimeout(() => $('txtInput').focus(), 50);
}
function saveText(){
    const p = vw && getPhoto(vw.id), v = $('txtInput').value.trim();
    closeModal('modalText');
    if (!p || !_textEdit) return;
    pushHistory();
    if (_textEdit.idx >= 0) { if (v) p.texts[_textEdit.idx].t = v; else p.texts.splice(_textEdit.idx, 1); }
    else if (v) p.texts.push({ x:Math.round(_textEdit.pt[0]), y:Math.round(_textEdit.pt[1]), t:v.slice(0, 80), c:vw.color, fs:Math.round(p.w * 0.032 * (0.75 + vw.size * 0.25) * zoomK() * 10) / 10 });
    else vw.history.pop();
    _textEdit = null;
    save(); renderAnnot(); renderViewerBar();
}
function deleteText(){ $('txtInput').value = ''; saveText(); }
async function exportPhoto(){
    const p = getPhoto(vw.id);
    const url = p && await getPhotoUrl(p.id, 'full');
    if (!url) { showToast('⚠ Foto non disponibile su questo dispositivo'); return; }
    try {
        const im = await loadImage(url), c = document.createElement('canvas');
        c.width = p.w; c.height = p.h;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0, p.w, p.h);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        p.strokes.forEach(s => { ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.stroke(new Path2D(strokePath(s.pts))); });
        p.texts.forEach(t => {
            ctx.font = `800 ${t.fs}px Nunito, "Segoe UI", sans-serif`;
            ctx.lineWidth = t.fs * 0.16; ctx.strokeStyle = haloFor(t.c); ctx.strokeText(t.t, t.x, t.y);
            ctx.fillStyle = t.c; ctx.fillText(t.t, t.x, t.y);
        });
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
        const room = getRoom(p.roomId);
        const name = slug(`${room ? room.name : 'stanza'} ${p.caption || PHOTO_KINDS[p.kind]}`) + '.jpg';
        const file = new File([blob], name, { type:'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files:[file] })) {
            await navigator.share({ files:[file], title:p.caption || 'Casa Hub' }).catch(() => {});
        } else {
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
    } catch (e) { showToast('⚠ Non riesco a esportare la foto'); }
}
function deletePhoto(){
    const p = getPhoto(vw.id);
    if (!p) return;
    confirmDialog({ title:'Eliminare la foto?', msg:'Spariscono anche i disegni e le scritte.' }, () => {
        const driveId = p.driveId, id = p.id;
        data.photos = data.photos.filter(x => x.id !== id);
        idbDel('blobs', id); idbDel('thumbs', id);
        ['thumb', 'full'].forEach(s => { const u = _urls.get(id + '|' + s); if (u) { URL.revokeObjectURL(u); _urls.delete(id + '|' + s); } });
        deleteDrivePhoto(driveId);
        save(); closeViewer();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
//  GUIDA: tour al primo avvio e "?" nelle schermate
// ═══════════════════════════════════════════════════════════════════════════
const HELP = {
    checkin:{ t:'Il check-in del mattino', b:[
        'Tre domande veloci: come hai dormito, come sta il corpo, come sta la testa. Da qui l’app stima quanti <b>cucchiaini</b> hai oggi.',
        'Il numero è una proposta: con <b>−</b> e <b>+</b> lo correggi tu. Conta come ti senti davvero.',
        'Se ieri hai sforato e il <b>debito</b> è attivo, oggi parti con qualche cucchiaino in meno.',
        'Il massimo di una giornata buona, la riserva e il debito si cambiano in Impegni → Energia.'] },
    task:{ t:'Un impegno', b:[
        '<b>Urgenza</b>: gli urgenti non vengono mai proposti da spostare quando sfori.',
        '<b>Cucchiaini</b>: “Predefinito” usa il valore della categoria; “Zero” per le cose che non pesano; con − e + vai a quarti (1,25 · 1,5 · 1,75).',
        '<b>Senza data</b>: finisce in “Quando capita” (o nella sua stanza) e non pesa sulle energie finché non lo pianifichi.',
        '<b>Ripetizione</b>: ogni N giorni, settimane, mesi o anni. “Conta dal giorno in cui lo completo” è utile per cose come “filtro cappa ogni 3 mesi”.',
        '<b>Stanza</b>: se lo colleghi a una stanza, lo ritrovi anche nella sua lista di cose da fare.'] },
    tasks:{ t:'Impegni', b:[
        'Tocca <b>+</b> per aggiungere un impegno: scegli categoria, urgenza (normale, importante, urgente), data e, se serve, una ripetizione.',
        'Tocca il <b>cerchio</b> per segnarlo come fatto. Tocca il nome per vedere i dettagli, rimandarlo o pianificarlo.',
        '<b>Imprevisto</b> sposta a domani tutto quello che è di oggi o in ritardo.',
        'In alto passi tra le viste: Oggi, Giorno, Settimana, Mese, Elenco (per categoria) ed Energia.'] },
    energy:{ t:'Energie e cucchiaini', b:[
        'Ogni mattina il <b>check-in</b> ti chiede come hai dormito, come sta il corpo e la testa, e propone quanti cucchiaini hai. Puoi correggere con − e +.',
        'Ogni impegno costa dei cucchiaini, anche <b>0</b> o a quarti (1,25 · 1,5 · 1,75). Contano anche le spese fisse (igiene, lezioni…) e il riordino.',
        'La fila di cucchiaini mostra: <b>grigio</b> spesi, <b>miele</b> in programma, <b>salvia</b> liberi, <b>tratteggiato</b> riserva, <b>lampone</b> oltre il limite.',
        'Se sfori, l’app ti suggerisce cosa spostare (mai gli urgenti) e in quale giorno c’è spazio.'] },
    tidy:{ t:'Riordino', b:[
        'Il metodo FlyLady: <b>15 minuti al giorno</b>, una stanza alla volta. Non serve che sia perfetto.',
        'Scegli la stanza (ti viene suggerita quella trascurata da più tempo) e avvia il timer. Lo schermo resta acceso; alla fine suona.',
        'Se finisci prima, tocca “Ho finito”: conta i minuti fatti e i cucchiaini in proporzione.'] },
    rooms:{ t:'Stanze', b:[
        'Ogni stanza ha la sua <b>lista di cose da fare</b>, le sue <b>foto</b> e uno spazio per le note.',
        'La copertina è la foto “Obiettivo” più recente. La barra mostra quante cose hai già fatto.',
        'Con “Modifica” aggiungi, rinomini, riordini o elimini le stanze (le stesse del Riordino).'] },
    room:{ t:'Una stanza', b:[
        '<b>+ Foto</b>: scatta o scegli un’immagine e dille se è com’è <b>adesso</b>, l’<b>obiettivo</b> o un’<b>idea</b>.',
        'Tocca una foto per ingrandirla, poi <b>Scrivi e disegna</b> per annotarla: per esempio scrivi “phon, piastra, spazzole” sopra un cubo del Kallax.',
        'Le cose da fare senza data restano qui. Toccane una e scegli un giorno: comparirà negli impegni e nelle energie.'] },
    photo:{ t:'Scrivere sulle foto', b:[
        '<b>Penna</b>: disegna o scrivi a mano. <b>Testo</b>: tocca un punto e scrivi un’etichetta (tocca un’etichetta per modificarla). <b>Gomma</b>: passa sopra a un tratto o a una scritta per toglierli.',
        'Con <b>due dita</b> ingrandisci e sposti. Da ingrandita il tratto resta fine: comodo per scrivere su dettagli piccoli.',
        '<b>Solo pennina</b>: disegna solo la pennina, le dita servono per spostarti (e puoi appoggiare il palmo).',
        '<b>Condividi</b> crea un’immagine con i disegni “stampati” sopra, da mandare su WhatsApp o salvare.'] },
    shop:{ t:'Spesa', b:[
        'Tocca un prodotto per segnarlo <b>da comprare</b>; con ⋯ aggiungi quantità o note. Scrivi nel campo in alto per cercare o aggiungere.',
        '<b>Stampa / PDF</b> crea la lista divisa per reparti. <b>Google Doc</b> la salva nel tuo Drive. <b>Invia</b> la manda su WhatsApp o altre app.',
        'Metti i reparti nell’ordine del tuo supermercato con “Gestisci reparti”. Dopo la spesa tocca “Spesa fatta”.'] },
    sync:{ t:'Sync e backup', b:[
        'Collegando uno script Google (le istruzioni sono qui sotto) usi l’app su più dispositivi: i dati stanno in un tuo Foglio Google, le foto in una cartella del tuo Drive.',
        'Senza sync tutto resta su questo dispositivo. Il backup esporta i dati in un file, ma non le foto.'] },
};
function helpBtn(topic){ return `<button class="help-btn" onclick="event.stopPropagation();openHelp('${topic}')" aria-label="Aiuto">?</button>`; }
function openHelp(topic){
    const h = HELP[topic];
    if (!h) return;
    $('helpBody').innerHTML = `<div class="modal-title">${h.t}</div>${h.b.map(x => `<p class="help-p">${x}</p>`).join('')}
        <button class="btn btn-primary" onclick="closeModal('modalHelp')">Ho capito</button>
        <button class="btn btn-secondary" onclick="closeModal('modalHelp');openTour()">Rivedi la guida completa</button>`;
    openModal('modalHelp');
}
const TOUR = [
    { i:'⌂', t:'Ti do il benvenuto in Casa Hub', b:'Impegni di casa, energie, riordino, stanze e spesa in un posto solo. In un minuto ti mostro come funziona. Puoi ritrovare tutto toccando i <b>?</b> nelle schermate.' },
    { i:'✓', t:'Impegni', b:'Con <b>+</b> aggiungi un impegno, con urgenza, data e ripetizione. Tocca il cerchio quando l’hai fatto, oppure tocca il nome per rimandarlo. Se arriva un imprevisto, un tasto sposta tutto a domani.' },
    { i:'🥄', t:'Le tue energie', b:'Ogni mattina un piccolo check-in stima i tuoi <b>cucchiaini</b>. Ogni impegno ne costa un po’ (anche zero o a quarti). Se la giornata è troppo piena, l’app ti dice cosa spostare.' },
    { i:'◷', t:'Riordino', b:'15 minuti al giorno, una stanza alla volta, con un timer. Niente perfezionismo: quando suona, ti fermi.' },
    { i:'▣', t:'Stanze', b:'Per ogni stanza: la lista delle cose da fare e le foto di com’è e di come la vorresti. Sulle foto puoi <b>scrivere e disegnare</b>, anche con la pennina.' },
    { i:'🛒', t:'Spesa', b:'Spunta quello che serve: la lista si stampa divisa per reparti, diventa un Google Doc o parte su WhatsApp.' },
    { i:'☁', t:'Su più dispositivi', b:'Dal tasto con la nuvoletta in alto colleghi la sincronizzazione con Google: dati e foto restano tuoi, nel tuo Drive. Fatto questo, si comincia!' },
];
let tourIdx = 0;
function openTour(){ tourIdx = 0; renderTour(); openModal('modalTour'); }
function renderTour(){
    const s = TOUR[tourIdx], last = tourIdx === TOUR.length - 1;
    $('tourBody').innerHTML = `
        <button class="tour-skip" onclick="finishTour()">Salta</button>
        <div class="tour-icon">${s.i}</div>
        <div class="modal-title" style="text-align:center;">${s.t}</div>
        <p class="tour-text">${s.b}</p>
        <div class="tour-dots">${TOUR.map((_, i) => `<i class="${i === tourIdx ? 'on' : ''}"></i>`).join('')}</div>
        <div class="modal-btns">
            ${tourIdx ? `<button class="btn btn-secondary" onclick="tourIdx--;renderTour()">Indietro</button>` : ''}
            <button class="btn btn-primary" onclick="${last ? 'finishTour()' : 'tourIdx++;renderTour()'}">${last ? 'Iniziamo' : 'Avanti'}</button>
        </div>`;
}
function finishTour(){
    const first = !ui.tourSeen;
    ui.tourSeen = true; saveUi();
    closeModal('modalTour');
    if (first) setTimeout(maybeCheckin, 350);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RIORDINO (metodo FlyLady: un timer, una stanza, niente perfezionismo)
// ═══════════════════════════════════════════════════════════════════════════
function tidyOn(iso){ return data.tidy.filter(x => x.date === iso); }
function tidySum(iso){ return qr(tidyOn(iso).reduce((n, x) => n + x.cost, 0)); }
// Se il riordino quotidiano è attivo, conta come "in programma" finché non lo fai
function tidyPlannedOn(iso){
    const st = settings();
    if (!st.tidyDaily || iso < todayStr() || tidyOn(iso).length) return 0;
    return st.tidyCost;
}
function lastTidyOf(roomId){
    let last = null;
    data.tidy.forEach(x => { if (x.roomId === roomId && (!last || x.date > last)) last = x.date; });
    return last;
}
function suggestedRoom(){
    const rooms = sortedRooms();
    if (!rooms.length) return null;
    return rooms.reduce((best, r) => {
        const a = lastTidyOf(r.id) || '0000', b = lastTidyOf(best.id) || '0000';
        return a < b ? r : best;
    }, rooms[0]);
}
function tidyStreak(){
    const dates = new Set(data.tidy.map(x => x.date));
    let d = todayStr();
    if (!dates.has(d)) d = shiftDate(d, -1);
    let n = 0;
    while (dates.has(d) && n < 3650) { n++; d = shiftDate(d, -1); }
    return n;
}
function relDays(iso){
    if (!iso) return 'mai';
    const n = daysBetween(iso, todayStr());
    return n === 0 ? 'oggi' : n === 1 ? 'ieri' : `${n} giorni fa`;
}
function timerLeft(){
    const tm = ui.timer;
    if (!tm) return 0;
    return tm.endAt ? Math.max(0, Math.round((tm.endAt - Date.now()) / 1000)) : tm.left;
}
function fmtClock(sec){ return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function tidyBadgeText(){
    if (ui.timer) return `${Math.ceil(timerLeft() / 60)}′`;
    return tidyOn(todayStr()).length ? '✓' : '';
}
function renderTidy(app){
    const st = settings(), today = todayStr(), tm = ui.timer;
    const rooms = sortedRooms(), sug = suggestedRoom();
    if (!getRoom(ui.tidyRoom)) ui.tidyRoom = sug ? sug.id : null;
    const sel = getRoom(ui.tidyRoom);
    const doneToday = tidyOn(today), streak = tidyStreak();
    const recent = [...data.tidy].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 7);
    let timerHtml;
    if (tm) {
        const left = timerLeft(), frac = tm.total ? left / tm.total : 0;
        const room = getRoom(tm.roomId);
        const C = 2 * Math.PI * 88;
        timerHtml = `<div class="timer-card">
            <div class="timer-room">${escHtml(room ? room.name : tm.roomName || 'Riordino')}</div>
            <div class="ring"><svg viewBox="0 0 200 200"><circle class="ring-bg" cx="100" cy="100" r="88"/>
                <circle class="ring-fg" id="tidyRing" cx="100" cy="100" r="88" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
                <div class="ring-clock" id="tidyClock">${fmtClock(left)}</div></div>
            <div class="timer-note">${tm.endAt ? 'Non serve che sia perfetto: quando suona, ti fermi.' : 'In pausa'}</div>
            <div class="modal-btns">
                ${tm.endAt ? `<button class="btn btn-secondary" onclick="pauseTidy()">Pausa</button>` : `<button class="btn btn-primary" onclick="resumeTidy()">Riprendi</button>`}
                <button class="btn btn-secondary" onclick="finishTidy(false)">Ho finito</button>
            </div>
            <button class="link-btn danger" style="margin-top:10px;" onclick="cancelTidy()">Annulla senza salvare</button>
        </div>`;
    } else {
        timerHtml = `<div class="timer-card">
            ${doneToday.length ? `<div class="tidy-done">Oggi hai già riordinato: ${escHtml(doneToday.map(x => (getRoom(x.roomId) || {}).name || x.roomName).join(', '))}. Basta così, oppure un altro giro se ti va.</div>` : ''}
            <div class="field-label" style="margin-top:0;">Dove oggi?</div>
            <div class="room-grid">${rooms.map(r => {
                const last = lastTidyOf(r.id);
                return `<button class="room-card${r.id === ui.tidyRoom ? ' on' : ''}" onclick="ui.tidyRoom=${jsArg(r.id)};saveUi();render()">
                    <span class="room-name">${escHtml(r.name)}</span><span class="room-last">${r.id === (sug && sug.id) && last !== today ? 'suggerita · ' : ''}${relDays(last)}</span></button>`;
            }).join('') || `<div class="empty-note">Aggiungi le tue stanze.</div>`}</div>
            <button class="btn btn-primary big-start" onclick="startTidy()" ${sel ? '' : 'disabled'}>Inizia ${st.tidyMin} minuti${sel ? ' in ' + escHtml(sel.name.toLowerCase()) : ''}</button>
        </div>`;
    }
    app.innerHTML = `
        <div class="sec-head"><div><div class="sec-title">Riordino ${helpBtn('tidy')}</div><div class="sec-sub">${st.tidyMin} minuti al giorno, una stanza alla volta</div></div>
            ${streak ? `<span class="streak">${streak} ${streak === 1 ? 'giorno' : 'giorni'} di fila</span>` : ''}</div>
        ${timerHtml}
        ${recent.length ? `<div class="block card"><div class="block-title"><span>Ultime volte</span></div>
            ${recent.map(x => `<div class="e-row static"><span class="e-name">${escHtml((getRoom(x.roomId) || {}).name || x.roomName || 'Stanza')}<span class="e-days">${escHtml(relDays(x.date))}, ${x.minutes} min</span></span>
                <span class="m-spoon">🥄${fmtSp(x.cost)}</span><button class="shop-edit" onclick="deleteTidy(${jsArg(x.id)})" aria-label="Elimina">✕</button></div>`).join('')}</div>` : ''}
        <div class="block card"><div class="block-title"><span>Impostazioni</span></div>
            <div class="set-row"><div><div class="set-name">Durata</div></div>
                <div class="chip-row" style="margin:0;">${[10, 15, 20, 30].map(n => `<button class="chip${st.tidyMin === n ? ' on' : ''}" onclick="setTidyMin(${n})">${n}′</button>`).join('')}</div></div>
            <div class="set-row"><div><div class="set-name">Cucchiaini</div><div class="set-desc">Quanto ti costa un giro completo</div></div>
                <div class="sp-stepper on"><button onclick="stepTidyCost(-1)" aria-label="Meno">−</button><span>🥄 ${fmtSp(st.tidyCost)}</span><button onclick="stepTidyCost(1)" aria-label="Più">+</button></div></div>
            <label class="check-row set-check"><input type="checkbox" ${st.tidyDaily ? 'checked' : ''} onchange="settings().tidyDaily=this.checked;save();">
                <span><b>Mettilo in programma ogni giorno</b>: finché non lo fai conta tra le energie previste</span></label>
            <button class="btn btn-secondary" onclick="openRoomsModal()">Gestisci stanze</button>
        </div>`;
    if (tm && tm.endAt) startTick();
}
function setTidyMin(n){ settings().tidyMin = n; save(); render(); }
function stepTidyCost(dir){ const st = settings(); st.tidyCost = clamp(qr(st.tidyCost + dir * 0.25), 0, TASK_COST_MAX); save(); render(); }

// ── Timer ───────────────────────────────────────────────────────────────────
let _tick = null, _wake = null, _audio = null;
function startTick(){
    clearInterval(_tick);
    _tick = setInterval(() => {
        if (!ui.timer || !ui.timer.endAt) { clearInterval(_tick); return; }
        const left = timerLeft();
        const clock = $('tidyClock'), ring = $('tidyRing');
        if (clock) clock.textContent = fmtClock(left);
        if (ring) { const C = 2 * Math.PI * 88; ring.setAttribute('stroke-dashoffset', C * (1 - left / ui.timer.total)); }
        const bd = $('badgeTidy'); if (bd) bd.textContent = tidyBadgeText();
        if (left <= 0) finishTidy(true);
    }, 1000);
}
async function keepAwake(on){
    try {
        if (on && 'wakeLock' in navigator && !_wake) { _wake = await navigator.wakeLock.request('screen'); _wake.addEventListener('release', () => { _wake = null; }); }
        if (!on && _wake) { await _wake.release(); _wake = null; }
    } catch (_) { _wake = null; }
}
function startTidy(){
    const r = getRoom(ui.tidyRoom);
    if (!r) return;
    // l'audio va "sbloccato" con un tocco, così il segnale finale può suonare
    try { _audio = _audio || new (window.AudioContext || window.webkitAudioContext)(); _audio.resume(); } catch (_) {}
    const total = settings().tidyMin * 60;
    ui.timer = { roomId:r.id, roomName:r.name, total, endAt:Date.now() + total * 1000, left:total };
    saveUi(); keepAwake(true); render();
}
function pauseTidy(){
    if (!ui.timer || !ui.timer.endAt) return;
    ui.timer.left = timerLeft(); ui.timer.endAt = null;
    saveUi(); keepAwake(false); clearInterval(_tick); render();
}
function resumeTidy(){
    if (!ui.timer || ui.timer.endAt) return;
    ui.timer.endAt = Date.now() + ui.timer.left * 1000;
    saveUi(); keepAwake(true); render();
}
function cancelTidy(){
    confirmDialog({ title:'Annullare?', msg:'Il giro di riordino non verrà salvato.', ok:'Annulla il giro' }, () => {
        ui.timer = null; saveUi(); clearInterval(_tick); keepAwake(false); render();
    });
}
function chime(){
    try {
        const ctx = _audio || new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
        [659.25, 783.99, 1046.5].forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.22;
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
            o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.65);
        });
    } catch (_) {}
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (_) {}
}
// auto = il tempo è scaduto; altrimenti "Ho finito" (conta i minuti fatti davvero)
function finishTidy(auto, silent){
    const tm = ui.timer;
    if (!tm) return;
    clearInterval(_tick);
    const elapsed = auto ? tm.total : tm.total - timerLeft();
    const minutes = clamp(Math.round(elapsed / 60), 1, 180);
    const st = settings();
    const full = tm.total / 60;
    const cost = qr(st.tidyCost * Math.min(1, minutes / full)) || (st.tidyCost ? 0.25 : 0);
    const room = getRoom(tm.roomId);
    // la data è quella in cui il giro è finito (anche se l'app era chiusa)
    const endDate = auto && tm.endAt ? localDateStr(new Date(Math.min(tm.endAt, Date.now()))) : todayStr();
    const rec = { id:uid(), date:endDate, roomId:tm.roomId, roomName:room ? room.name : tm.roomName, minutes, cost };
    data.tidy.push(rec);
    ui.timer = null; saveUi(); keepAwake(false);
    if (auto && !silent) chime();
    save(); render();
    showToast(`✨ ${minutes} minuti in ${(rec.roomName || 'casa').toLowerCase()}. Ben fatto!`, { label:'Annulla', fn:() => {
        data.tidy = data.tidy.filter(x => x.id !== rec.id); save(); render();
    } });
}
function deleteTidy(id){
    data.tidy = data.tidy.filter(x => x.id !== id);
    save(); render();
}
// All'avvio o al ritorno nell'app: se il tempo è finito mentre eri altrove, salva il giro
function resumeTimerState(){
    if (!ui.timer || !ui.timer.endAt) return;
    if (timerLeft() <= 0) finishTidy(true, true); // eri altrove: niente suono, solo il salvataggio
    else { startTick(); keepAwake(true); }
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
        <div class="shop-head"><span class="shop-count-num" id="shopCount">${n}</span><span class="shop-count-label">da comprare</span>${helpBtn('shop')}</div>
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
const APPS_SCRIPT_CODE = `// Casa Hub — Apps Script v2 (sync + liste della spesa in Google Docs + foto delle stanze)
// Crealo da un Foglio Google tutto suo: Estensioni → Apps Script.
const SHEET_NAME = 'CasaHub';
const CHUNK = 45000;
const FOLDER_NAME = 'Casa Hub - Liste spesa';
const KEEP_DAYS = 60; // le liste più vecchie finiscono nel cestino
const PHOTO_FOLDER = 'Casa Hub - Foto';

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
  if (e && e.parameter && e.parameter.action === 'imgget') return getImage(e.parameter.id);
  return out(JSON.stringify({ error: 'unknown action' }));
}

function doPost(e) {
  if (e && e.parameter && e.parameter.action === 'doc') return createShoppingDoc(e);
  if (e && e.parameter && e.parameter.action === 'imgput') return putImage(e);
  if (e && e.parameter && e.parameter.action === 'imgdel') return deleteImage(e);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = e.postData.contents;
    const obj = JSON.parse(body);
    // protezione: scrive solo dati di Casa Hub, mai una richiesta di documento
    if (!obj || obj.kind || !Array.isArray(obj.tasks)) throw new Error('dati non validi');
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

// ── Foto delle stanze: file JPEG nella cartella "Casa Hub - Foto" del tuo Drive ──
function getPhotoFolder() {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

// sicurezza: lo script legge o cancella SOLO file che stanno nella cartella delle foto
function photoFile(id) {
  const f = DriveApp.getFileById(String(id));
  const folderId = getPhotoFolder().getId();
  const parents = f.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return f;
  throw new Error('file non consentito');
}

function putImage(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (!p || p.kind !== 'img' || !p.data) throw new Error('immagine mancante');
    const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg', String(p.id || 'foto') + '.jpg');
    const f = getPhotoFolder().createFile(blob);
    return out(JSON.stringify({ ok: true, fileId: f.getId() }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function getImage(id) {
  try {
    const b = photoFile(id).getBlob();
    return out(JSON.stringify({ ok: true, mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
}

function deleteImage(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    photoFile(p.fileId).setTrashed(true);
    return out(JSON.stringify({ ok: true }));
  } catch (err) {
    return out(JSON.stringify({ error: String(err && err.message || err) }));
  }
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
            let pick = !l ? r : !r ? l : ((r._mod || 0) > (l._mod || 0) ? r : l);
            if (c === 'days' && l && r) pick = mergeDay(pick, pick === l ? r : l);
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

// Stesso giorno toccato da due dispositivi (es. check-in sul telefono, impegno fatto
// sul PC): parte dalla versione più recente ma non perde i compiti fatti né il check-in.
function mergeDay(newer, older){
    const m = JSON.parse(JSON.stringify(newer));
    const seen = new Set(m.done.map(e => e.ts + ':' + e.taskId));
    older.done.forEach(e => { if (!seen.has(e.ts + ':' + e.taskId)) m.done.push(e); });
    if (typeof m.spoons !== 'number' && typeof older.spoons === 'number') {
        ['sleep','body','mind','spoons','debt'].forEach(k => { m[k] = older[k]; });
    }
    return m;
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
        uploadPending();
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
    $('syncModalBody').innerHTML = (_photoSyncError ? `<div class="sheet-info">${escHtml(_photoSyncError)}</div>` : '') + (syncUrl ? `
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
            </ol><b>Hai già lo script della versione precedente?</b> Incolla il nuovo codice al posto del vecchio, salva, poi Esegui il deployment → Gestisci deployment → ✎ Modifica → Versione: Nuova versione → Esegui il deployment. Autorizza di nuovo se Google lo chiede. L'URL resta lo stesso.</div>
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
        else if (vw) closeViewer();
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
    if (_renderDay !== todayStr()) { renderWhenIdle(); setTimeout(maybeCheckin, 300); } // è passata la mezzanotte
    resumeTimerState();
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
    resumeTimerState();
    updateSyncBtn(getSyncStatus());
    if (_loadError) showToast('⚠ Dati locali illeggibili: copia salvata, ripristina da sync o backup');
    // Il check-in parte dopo la prima sync, così non lo rifai se l'hai già fatto sull'altro dispositivo
    initViewerGestures();
    if (!ui.tourSeen) setTimeout(openTour, 300); // primo utilizzo: prima la guida, poi il check-in
    if (syncUrl) setTimeout(async () => { await doSync(true); if (ui.tourSeen) maybeCheckin(); }, 1200);
    else if (ui.tourSeen) setTimeout(maybeCheckin, 400);
    setTimeout(gcPhotos, 8000);
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
