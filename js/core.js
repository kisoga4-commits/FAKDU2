(() => {
  'use strict';

  const APP_VERSION = '10.0.0';
  const MASTER_LOCK_KEY = 'FAKDU_MASTER_LOCK';
  const ADMIN_SESSION_KEY = 'FAKDU_ADMIN_OK';

  const DEFAULT_DB = {
    version: APP_VERSION,
    shopId: '',
    shopName: 'FAKDU',
    logo: 'icon.png',
    theme: '#111827',
    adminPin: '2468',
    unitType: 'โต๊ะ',
    unitCount: 8,
    items: [],
    units: [],
    carts: {},
    sales: [],
    recovery: { phone: '', color: '', animal: '' },
    licenseToken: '',
    licenseActive: false,
    sync: { pin: '000000', clients: [], approvals: [], hadClientEver: false, lastCheck: { status: 'idle', text: 'idle' } },
    appliedOps: {}
  };

  const state = { db: structuredClone(DEFAULT_DB), tab: 'customer', activeUnitId: null, gridZoom: 2, admin: localStorage.getItem(ADMIN_SESSION_KEY) === '1', pendingTab: null, channel: null };

  const $ = (id) => document.getElementById(id);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');
  const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function ensureDb(raw) {
    const db = Object.assign({}, clone(DEFAULT_DB), raw || {});
    if (!db.shopId) db.shopId = `SHOP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!db.sync.pin || db.sync.pin === '000000') db.sync.pin = String(Math.floor(100000 + Math.random() * 900000));
    db.units = Array.from({ length: Number(db.unitCount || 8) }, (_, i) => {
      const id = i + 1;
      const old = (raw?.units || []).find((u) => Number(u.id) === id) || {};
      return { id, orders: old.orders || [], checkoutRequested: !!old.checkoutRequested, startTime: old.startTime || null, status: old.status || 'idle' };
    });
    db.carts = db.carts || {};
    db.units.forEach((u) => { if (!Array.isArray(db.carts[u.id])) db.carts[u.id] = []; });
    db.appliedOps = db.appliedOps || {};
    return db;
  }

  async function save(sync = true) {
    await FakduDB.save(state.db);
    if (sync) broadcastSnapshot();
    renderAll();
  }

  function setDot(id, mode) {
    const el = $(id); if (!el) return;
    el.className = `dot ${mode}`;
  }

  function updateHeaderDots() {
    setDot('dot-online', navigator.onLine ? 'ok' : 'error');
    const approved = state.db.sync.clients.filter((c) => c.approved);
    const online = approved.filter((c) => Date.now() - Number(c.lastSeen || 0) < 20000);
    if (!state.db.sync.hadClientEver && approved.length === 0) setDot('dot-sync', 'idle');
    else if (online.length === 0) setDot('dot-sync', 'error');
    else setDot('dot-sync', 'ok');

    const risk = online.length === 0 && state.db.sync.hadClientEver;
    setDot('dot-risk', risk ? 'error' : 'idle');
    $('risk-bell')?.classList.toggle('hidden', !risk);
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(`screen-${tab}`)?.classList.add('active');
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'customer') renderGrid();
    if (tab === 'shop') renderCheckout();
    if (tab === 'manage') { renderSales(); renderAdminMenu(); }
    if (tab === 'system') renderSystem();
  }

  function openAdminTab(tab) {
    if (state.admin) return switchTab(tab);
    state.pendingTab = tab; $('pin-input').value = ''; $('pin-error').textContent = '';
    $('pin-modal').classList.remove('hidden');
  }
  function closePin() { $('pin-modal').classList.add('hidden'); }
  function verifyPin() {
    const pin = $('pin-input').value.trim();
    if (!pin || pin !== String(state.db.adminPin || '')) { $('pin-error').textContent = 'PIN ไม่ถูกต้อง'; return; }
    state.admin = true; localStorage.setItem(ADMIN_SESSION_KEY, '1'); closePin(); switchTab(state.pendingTab || 'manage');
  }

  function setGridZoom(z) {
    state.gridZoom = Math.max(1, Math.min(3, Number(z || 2)));
    $('zoom-s')?.classList.toggle('active', state.gridZoom === 1);
    $('zoom-m')?.classList.toggle('active', state.gridZoom === 2);
    $('zoom-l')?.classList.toggle('active', state.gridZoom === 3);
    const g = $('unit-grid'); if (g) g.dataset.zoom = String(state.gridZoom);
    renderGrid();
  }
  function changeGridZoom(d) { setGridZoom(state.gridZoom + Number(d || 0)); }

  function renderGrid() {
    const g = $('unit-grid'); if (!g) return;
    g.dataset.zoom = String(state.gridZoom);
    g.innerHTML = state.db.units.map((u) => {
      const draft = state.db.carts[u.id] || [];
      const warn = draft.length > 0;
      const cls = u.checkoutRequested ? 'checkout' : (warn ? 'warn' : (u.orders.length ? 'busy' : 'idle'));
      return `<button class="unit ${cls}" onclick="openUnit(${u.id})"><b>${state.db.unitType} ${u.id}</b><small>${u.orders.length} sent / ${draft.length} draft</small></button>`;
    }).join('');
  }

  function openUnit(id) {
    state.activeUnitId = Number(id);
    $('order-title').textContent = `${state.db.unitType} ${id}`;
    switchTab('order');
    renderMenu();
    renderCartBar();
  }

  function renderMenu() {
    const list = $('menu-list'); if (!list) return;
    list.innerHTML = state.db.items.map((it) => `<button class="menu" onclick="addToCart('${it.id}')">${it.img ? `<img src="${it.img}"/>` : ''}<div><b>${it.name}</b><small>฿${fmt(it.price)}</small></div></button>`).join('') || '<div class="card">ยังไม่มีเมนู</div>';
  }

  function addToCart(itemId) {
    const it = state.db.items.find((x) => x.id === itemId); if (!it || !state.activeUnitId) return;
    const cart = state.db.carts[state.activeUnitId];
    let line = cart.find((r) => r.itemId === it.id);
    if (!line) { line = { id: rid('CRT'), itemId: it.id, name: it.name, qty: 0, price: Number(it.price || 0), total: 0 }; cart.push(line); }
    line.qty += 1; line.total = line.qty * line.price;
    renderCartBar(); renderGrid(); save(false);
  }

  function editDraft(idx, delta) {
    const cart = state.db.carts[state.activeUnitId] || [];
    const row = cart[idx]; if (!row) return;
    row.qty += delta;
    if (row.qty <= 0) cart.splice(idx, 1); else row.total = row.qty * row.price;
    renderCartBar(); renderGrid();
  }

  function renderCartBar() {
    const cart = state.activeUnitId ? (state.db.carts[state.activeUnitId] || []) : [];
    $('cart-count').textContent = String(cart.reduce((s, r) => s + r.qty, 0));
    $('cart-total').textContent = fmt(cart.reduce((s, r) => s + r.total, 0));
  }

  function reviewCart() {
    const cart = state.db.carts[state.activeUnitId] || [];
    if (!cart.length) return;
    $('review-lines').innerHTML = cart.map((r, i) => `<div class="row between"><span>${r.name}</span><span>${r.qty}</span><span>฿${fmt(r.total)}</span><span><button onclick="editDraft(${i},-1)">-</button><button onclick="editDraft(${i},1)">+</button></span></div>`).join('');
    $('review-modal').classList.remove('hidden');
  }
  function closeReview() { $('review-modal').classList.add('hidden'); }

  function confirmSendOrder() {
    const unit = state.db.units.find((u) => u.id === state.activeUnitId);
    const cart = state.db.carts[state.activeUnitId] || [];
    if (!unit || !cart.length) return;
    const opId = rid('OP');
    if (state.db.appliedOps[opId]) return;
    state.db.appliedOps[opId] = Date.now();
    cart.forEach((r) => unit.orders.push({ ...clone(r), id: rid('ORD'), createdAt: Date.now(), source: 'master' }));
    unit.startTime = unit.startTime || Date.now(); unit.status = 'active';
    state.db.carts[state.activeUnitId] = [];
    closeReview(); save(true); switchTab('customer');
  }

  function renderCheckout() {
    const box = $('checkout-list'); if (!box) return;
    box.innerHTML = state.db.units.filter((u) => u.orders.length).map((u) => {
      const total = u.orders.reduce((s, r) => s + Number(r.total || 0), 0);
      return `<div class="card"><b>${state.db.unitType} ${u.id}</b><div>฿${fmt(total)}</div><button onclick="toggleCheckout(${u.id})">${u.checkoutRequested ? 'ยกเลิก' : 'ขอเช็คบิล'}</button><button onclick="closeBill(${u.id})">ปิดบิล</button></div>`;
    }).join('') || '<div class="card">ไม่มีรายการ</div>';
  }

  function toggleCheckout(id) {
    const u = state.db.units.find((x) => x.id === Number(id)); if (!u) return;
    u.checkoutRequested = !u.checkoutRequested; save(true);
  }

  function closeBill(id) {
    const u = state.db.units.find((x) => x.id === Number(id)); if (!u) return;
    const total = u.orders.reduce((s, r) => s + Number(r.total || 0), 0);
    state.db.sales.push({ id: rid('SALE'), unitId: id, items: clone(u.orders), total, closedAt: Date.now() });
    u.orders = []; u.checkoutRequested = false; u.startTime = null; u.status = 'idle';
    save(true);
  }

  function renderSales() {
    const today = new Date().toISOString().slice(0, 10);
    const todays = state.db.sales.filter((s) => new Date(s.closedAt).toISOString().slice(0, 10) === today).reduce((s, r) => s + r.total, 0);
    $('sales-summary').textContent = `วันนี้ ฿${fmt(todays)} | ทั้งหมด ${state.db.sales.length} บิล`;
    const count = {};
    state.db.sales.forEach((sale) => (sale.items || []).forEach((it) => { count[it.name] = (count[it.name] || 0) + Number(it.qty || 0); }));
    $('top-items').innerHTML = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, q]) => `<div class="row between"><span>${n}</span><b>${q}</b></div>`).join('') || '-';
  }

  function renderAdminMenu() {
    $('admin-menu').innerHTML = state.db.items.map((it) => `<div class="row between"><span>${it.name} ฿${fmt(it.price)}</span><span><button onclick="editItem('${it.id}')">แก้</button><button onclick="removeItem('${it.id}')">ลบ</button></span></div>`).join('');
  }
  function addMenuItem() {
    const name = prompt('ชื่อเมนู'); const price = Number(prompt('ราคา') || 0);
    if (!name || price <= 0) return;
    state.db.items.push({ id: rid('ITM'), name, price, img: '' }); save(true);
  }
  function editItem(id) { const it = state.db.items.find((x) => x.id === id); if (!it) return; const p = Number(prompt('ราคาใหม่', it.price) || it.price); it.price = p; save(true); }
  function removeItem(id) { state.db.items = state.db.items.filter((x) => x.id !== id); save(true); }

  function saveSystem() {
    state.db.shopName = $('sys-shop-name').value.trim() || 'FAKDU';
    state.db.adminPin = $('sys-admin-pin').value.trim() || state.db.adminPin;
    state.db.theme = $('sys-theme').value || '#111827';
    save(true);
  }

  function handleImage(e, type) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { if (type === 'logo') state.db.logo = r.result; save(true); };
    r.readAsDataURL(f);
  }

  function saveRecovery() {
    state.db.recovery = { phone: $('rec-phone').value.trim(), color: $('rec-color').value.trim(), animal: $('rec-animal').value.trim() }; save(false);
  }
  function recoverPin() {
    const phone = prompt('phone'); const color = prompt('color'); const animal = prompt('animal');
    if (phone === state.db.recovery.phone && color === state.db.recovery.color && animal === state.db.recovery.animal) {
      const np = prompt('ตั้ง PIN ใหม่'); if (np) { state.db.adminPin = np; save(false); alert('ok'); }
    } else alert('ข้อมูลไม่ตรง');
  }

  function renderSystem() {
    $('sys-shop-name').value = state.db.shopName;
    $('sys-admin-pin').value = '';
    $('sys-theme').value = state.db.theme;
    $('shop-id').textContent = state.db.shopId;
    $('sync-pin').textContent = state.db.sync.pin;
    $('sync-check-text').textContent = state.db.sync.lastCheck.text;
    $('approve-list').innerHTML = state.db.sync.approvals.map((a) => `<div class="row between"><span>${a.name || a.clientId}</span><span><button onclick="approve('${a.clientId}')">อนุมัติ</button><button onclick="reject('${a.clientId}')">ปฏิเสธ</button></span></div>`).join('') || '-';
  }

  function approve(clientId) {
    let c = state.db.sync.clients.find((x) => x.clientId === clientId);
    if (!c) { const req = state.db.sync.approvals.find((x) => x.clientId === clientId) || { clientId }; c = { ...req, approved: true, lastSeen: Date.now(), pendingOps: 0 }; state.db.sync.clients.push(c); }
    c.approved = true; c.lastSeen = Date.now();
    state.db.sync.approvals = state.db.sync.approvals.filter((x) => x.clientId !== clientId);
    state.db.sync.hadClientEver = true;
    post({ type: 'MASTER_APPROVAL', payload: { clientId, approved: true } });
    save(true);
  }
  function reject(clientId) { state.db.sync.approvals = state.db.sync.approvals.filter((x) => x.clientId !== clientId); post({ type: 'MASTER_APPROVAL', payload: { clientId, approved: false } }); save(false); }

  function resetSyncPin() { state.db.sync.pin = String(Math.floor(100000 + Math.random() * 900000)); save(true); }
  function manualSyncCheck() {
    const clients = state.db.sync.clients.filter((c) => c.approved);
    if (clients.length === 0) state.db.sync.lastCheck = { status: 'idle', text: 'idle: ไม่มีเครื่องลูก' };
    else {
      const bad = clients.some((c) => Date.now() - Number(c.lastSeen || 0) > 30000 || Number(c.pendingOps || 0) > 0);
      state.db.sync.lastCheck = bad ? { status: 'error', text: 'error: คิวค้าง/เครื่องลูกขาด' } : { status: 'ok', text: 'ok: ข้อมูลตรงกัน' };
    }
    save(false); updateHeaderDots(); renderSystem();
  }

  function post(msg) { try { state.channel?.postMessage(msg); } catch (_) {} }
  function bindChannel() {
    state.channel?.close?.(); state.channel = new BroadcastChannel(`FAKDU_SYNC_${state.db.shopId}`);
    state.channel.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'CLIENT_HEARTBEAT') {
        const c = msg.client; if (!c?.clientId) return;
        let row = state.db.sync.clients.find((x) => x.clientId === c.clientId);
        if (!row) { row = { clientId: c.clientId, name: c.name, avatar: c.avatar, approved: false, pendingOps: 0, lastSeen: Date.now() }; state.db.sync.clients.push(row); }
        row.name = c.name || row.name; row.avatar = c.avatar || row.avatar; row.lastSeen = Date.now(); row.pendingOps = Number(c.pendingOps || 0);
        save(false);
      }
      if (msg.type === 'CLIENT_ACCESS_REQUEST') {
        const c = msg.client; if (!c?.clientId) return;
        if (!state.db.sync.approvals.some((a) => a.clientId === c.clientId)) state.db.sync.approvals.push({ clientId: c.clientId, name: c.name, avatar: c.avatar, pin: c.pin, requestedAt: Date.now() });
        save(false);
      }
      if (msg.type === 'CLIENT_ACTION') applyClientAction(msg.action);
      if (msg.type === 'CLIENT_SYNC_ACK') {
        const c = state.db.sync.clients.find((x) => x.clientId === msg.clientId); if (c) c.pendingOps = Number(msg.pendingOps || 0);
        save(false);
      }
    };
  }

  function applyClientAction(action) {
    if (!action?.opId || state.db.appliedOps[action.opId]) return;
    state.db.appliedOps[action.opId] = Date.now();
    if (action.type === 'APPEND_ORDER') {
      const u = state.db.units.find((x) => x.id === Number(action.unitId)); if (!u) return;
      u.startTime = u.startTime || Date.now(); u.status = 'active';
      (action.items || []).forEach((r) => u.orders.push({ ...r, id: r.id || rid('ORD'), source: 'client', createdAt: r.createdAt || Date.now() }));
    }
    if (action.type === 'REQUEST_CHECKOUT') {
      const u = state.db.units.find((x) => x.id === Number(action.unitId)); if (u) u.checkoutRequested = true;
    }
    save(true);
  }

  function broadcastSnapshot() {
    post({ type: 'MASTER_SNAPSHOT', payload: { shopId: state.db.shopId, shopName: state.db.shopName, unitType: state.db.unitType, items: state.db.items, units: state.db.units, theme: state.db.theme, logo: state.db.logo } });
  }

  function singleInstanceGuard() {
    const tabId = rid('TAB');
    const beat = () => localStorage.setItem(MASTER_LOCK_KEY, JSON.stringify({ tabId, t: Date.now() }));
    beat();
    setInterval(beat, 1500);
    window.addEventListener('storage', (e) => {
      if (e.key !== MASTER_LOCK_KEY) return;
      const data = JSON.parse(e.newValue || '{}');
      if (data.tabId && data.tabId !== tabId && Date.now() - Number(data.t || 0) < 4000) $('duplicate-guard').classList.remove('hidden');
    });
  }

  function renderAll() {
    document.documentElement.style.setProperty('--primary', state.db.theme);
    $('shop-name').textContent = state.db.shopName;
    $('shop-logo').src = state.db.logo || 'icon.png';
    updateHeaderDots();
    if (state.tab === 'customer') renderGrid();
    if (state.tab === 'order') { renderMenu(); renderCartBar(); }
    if (state.tab === 'shop') renderCheckout();
    if (state.tab === 'manage') { renderSales(); renderAdminMenu(); }
    if (state.tab === 'system') renderSystem();
  }

  function showRiskLogs() { alert('พบความเสี่ยง: เครื่องลูกเคยมีแต่ตอนนี้หายทั้งหมด หรือคิวค้าง'); }

  async function init() {
    await FakduDB.ready();
    const raw = await FakduDB.load();
    state.db = ensureDb(raw);
    const license = await FakduVault.isProActive(state.db);
    state.db.licenseActive = !!license;
    bindChannel();
    renderAll();
    switchTab('customer');
    setGridZoom(2);
    await save(false);
    singleInstanceGuard();
    setInterval(() => { updateHeaderDots(); }, 2000);
  }

  window.addEventListener('online', () => { updateHeaderDots(); broadcastSnapshot(); });
  window.addEventListener('offline', updateHeaderDots);
  document.addEventListener('DOMContentLoaded', init);

  Object.assign(window, { switchTab, openAdminTab, closePin, verifyPin, changeGridZoom, setGridZoom, openUnit, addToCart, reviewCart, closeReview, confirmSendOrder, editDraft, toggleCheckout, closeBill, addMenuItem, editItem, removeItem, saveSystem, handleImage, saveRecovery, recoverPin, manualSyncCheck, resetSyncPin, approve, reject, showRiskLogs });
})();
