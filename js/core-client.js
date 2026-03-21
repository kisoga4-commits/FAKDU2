(() => {
  'use strict';

  const CLIENT_LOCK_KEY = 'FAKDU_CLIENT_LOCK';
  const LS_PIN = 'FAKDU_PENDING_CLIENT_PIN';
  const LS_SHOP = 'FAKDU_PENDING_SHOP_ID';

  const state = { profile: { name: '', avatar: '' }, session: { shopId: '', pin: '', approved: false }, snapshot: null, queue: [], drafts: {}, unitId: null, zoom: 2, tab: 'units', channel: null, clientId: '' };
  const $ = (id) => document.getElementById(id);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const fmt = (n) => Number(n || 0).toLocaleString('th-TH');

  async function load() {
    await FakduDB.ready();
    state.clientId = await FakduDB.getDeviceId();
    state.profile = (await FakduDB.loadClientProfile()) || { name: `Client-${state.clientId.slice(-4)}`, avatar: '' };
    state.session = (await FakduDB.loadClientSession()) || { shopId: '', pin: '', approved: false };
    state.snapshot = await FakduDB.loadSnapshot();
    state.queue = (await FakduDB.loadClientQueue()) || [];
    state.drafts = (await FakduDB.loadDrafts()) || {};
    state.session.pin ||= localStorage.getItem(LS_PIN) || '';
    state.session.shopId ||= localStorage.getItem(LS_SHOP) || '';
  }

  function setDot(id, mode) { const el = $(id); if (el) el.className = `dot ${mode}`; }

  function bindChannel() {
    if (!state.session.shopId) return;
    state.channel?.close?.();
    state.channel = new BroadcastChannel(`FAKDU_SYNC_${state.session.shopId}`);
    state.channel.onmessage = async (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'MASTER_SNAPSHOT') {
        state.snapshot = clone(msg.payload);
        state.session.shopId = msg.payload.shopId || state.session.shopId;
        await FakduDB.saveSnapshot(state.snapshot);
        await FakduDB.saveClientSession(state.session);
        renderAll();
      }
      if (msg.type === 'MASTER_APPROVAL' && msg.payload?.clientId === state.clientId) {
        state.session.approved = !!msg.payload.approved;
        await FakduDB.saveClientSession(state.session);
        renderAll();
      }
    };
  }

  function post(type, extra = {}) { try { state.channel?.postMessage({ type, ...extra }); } catch (_) {} }

  function heartbeat() {
    if (!state.session.shopId) return;
    bindChannel();
    post('CLIENT_HEARTBEAT', { client: { clientId: state.clientId, name: state.profile.name, avatar: state.profile.avatar, pin: state.session.pin, pendingOps: state.queue.length, approved: state.session.approved, lastSeen: Date.now() } });
  }

  function units() { return state.snapshot?.units || []; }
  function items() { return state.snapshot?.items || []; }
  function unitType() { return state.snapshot?.unitType || 'โต๊ะ'; }
  function draft(id) { return state.drafts[String(id)] || []; }

  async function persistAll() {
    await Promise.all([FakduDB.saveClientProfile(state.profile), FakduDB.saveClientSession(state.session), FakduDB.saveClientQueue(state.queue), FakduDB.saveDrafts(state.drafts)]);
  }

  function switchClientTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(`c-screen-${tab}`)?.classList.add('active');
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    renderAll();
  }

  function setClientGridZoom(z) { state.zoom = Math.max(1, Math.min(3, Number(z || 2))); renderUnits(); }
  function changeClientGridZoom(d) { setClientGridZoom(state.zoom + Number(d || 0)); }

  function selectUnit(id) { state.unitId = Number(id); renderAll(); }

  function renderUnits() {
    const g = $('client-unit-grid'); if (!g) return;
    g.dataset.zoom = String(state.zoom);
    g.innerHTML = units().map((u) => {
      const d = draft(u.id);
      const warn = d.length > 0;
      const cls = u.checkoutRequested ? 'checkout' : (warn ? 'warn' : (u.orders?.length ? 'busy' : 'idle'));
      return `<button class="unit ${cls}" onclick="selectUnit(${u.id})"><b>${unitType()} ${u.id}</b><small>${u.orders?.length || 0} sent / ${d.length} draft</small></button>`;
    }).join('') || '<div class="card">ยังไม่เชื่อมร้าน</div>';
  }

  function renderMenu() {
    const box = $('client-menu-list'); if (!box) return;
    if (!state.unitId) { box.innerHTML = '<div class="card">เลือกโต๊ะก่อน</div>'; return; }
    box.innerHTML = items().map((it) => `<button class="menu" onclick="addDraft('${it.id}')">${it.img ? `<img src="${it.img}"/>` : ''}<div><b>${it.name}</b><small>฿${fmt(it.price)}</small></div></button>`).join('') || '<div class="card">ไม่มีเมนู</div>';
  }

  function renderCartBar() {
    const d = state.unitId ? draft(state.unitId) : [];
    $('client-cart-count').textContent = String(d.reduce((s, r) => s + Number(r.qty || 0), 0));
    $('client-cart-total').textContent = fmt(d.reduce((s, r) => s + Number(r.total || 0), 0));
  }

  function addDraft(itemId) {
    if (!state.unitId) return;
    const it = items().find((x) => x.id === itemId); if (!it) return;
    const key = String(state.unitId);
    state.drafts[key] ||= [];
    let row = state.drafts[key].find((r) => r.itemId === itemId);
    if (!row) { row = { id: rid('DRF'), itemId, name: it.name, baseName: it.name, qty: 0, price: Number(it.price || 0), total: 0, addons: [] }; state.drafts[key].push(row); }
    row.qty += 1; row.total = row.qty * row.price;
    FakduDB.saveDrafts(state.drafts);
    renderUnits(); renderCartBar();
  }

  async function sendDraftOrder() {
    if (!state.unitId) return;
    const d = draft(state.unitId);
    if (!d.length) return;
    const op = { opId: rid('OP'), type: 'APPEND_ORDER', unitId: state.unitId, clientId: state.clientId, clientName: state.profile.name, items: clone(d) };
    state.queue.push(op);
    state.drafts[String(state.unitId)] = [];
    await persistAll();
    await flushQueue();
    renderAll();
  }

  async function requestBill(unitId) {
    const target = Number(unitId || state.unitId || 0); if (!target) return;
    const op = { opId: rid('OP'), type: 'REQUEST_CHECKOUT', unitId: target, clientId: state.clientId, clientName: state.profile.name };
    state.queue.push(op);
    await FakduDB.saveClientQueue(state.queue);
    await flushQueue();
    renderAll();
  }

  async function flushQueue() {
    if (!navigator.onLine || !state.session.approved || !state.channel) return;
    const rest = [];
    for (const op of state.queue) {
      try { post('CLIENT_ACTION', { action: op }); }
      catch (_) { rest.push(op); }
    }
    state.queue = rest;
    await FakduDB.saveClientQueue(state.queue);
    post('CLIENT_SYNC_ACK', { clientId: state.clientId, pendingOps: state.queue.length });
    heartbeat();
  }

  function renderBills() {
    const box = $('client-bill-list'); if (!box) return;
    box.innerHTML = units().map((u) => `<div class="card row between"><span>${unitType()} ${u.id}</span><button onclick="requestBill(${u.id})">ขอเช็คบิล</button></div>`).join('') || '<div class="card">ยังไม่มีข้อมูล</div>';
  }

  async function submitJoin() {
    state.session.shopId = $('join-shop-id').value.trim();
    state.session.pin = $('join-pin').value.trim();
    localStorage.setItem(LS_PIN, state.session.pin);
    localStorage.setItem(LS_SHOP, state.session.shopId);
    await FakduDB.saveClientSession(state.session);
    bindChannel();
    post('CLIENT_ACCESS_REQUEST', { client: { clientId: state.clientId, name: state.profile.name, avatar: state.profile.avatar, pin: state.session.pin } });
    heartbeat();
  }

  async function saveClientProfile() {
    state.profile.name = $('client-name-input').value.trim() || `Client-${state.clientId.slice(-4)}`;
    await FakduDB.saveClientProfile(state.profile);
    renderAll();
    heartbeat();
  }
  function handleClientImage(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => { state.profile.avatar = r.result; await FakduDB.saveClientProfile(state.profile); renderAll(); heartbeat(); };
    r.readAsDataURL(f);
  }

  function openJoin() { switchClientTab('settings'); }

  function renderAll() {
    $('client-name').textContent = state.profile.name || 'Client';
    $('client-avatar').src = state.profile.avatar || 'icon.png';
    $('client-name-input').value = state.profile.name || '';
    $('join-shop-id').value = state.session.shopId || '';
    $('join-pin').value = state.session.pin || '';
    setDot('client-dot-online', navigator.onLine ? 'ok' : 'error');
    setDot('client-dot-sync', state.queue.length ? 'warn' : (state.session.approved ? 'ok' : 'idle'));
    renderUnits(); renderMenu(); renderCartBar(); renderBills();
  }

  function singleInstanceGuard() {
    const tabId = rid('TAB');
    const beat = () => localStorage.setItem(CLIENT_LOCK_KEY, JSON.stringify({ tabId, t: Date.now() }));
    beat(); setInterval(beat, 1500);
    window.addEventListener('storage', (e) => {
      if (e.key !== CLIENT_LOCK_KEY) return;
      const data = JSON.parse(e.newValue || '{}');
      if (data.tabId && data.tabId !== tabId && Date.now() - Number(data.t || 0) < 4000) $('duplicate-guard').classList.remove('hidden');
    });
  }

  async function init() {
    await load();
    bindChannel();
    renderAll();
    setInterval(() => { heartbeat(); if (navigator.onLine) flushQueue(); renderAll(); }, 3000);
    singleInstanceGuard();
  }

  window.addEventListener('online', () => { heartbeat(); flushQueue(); renderAll(); });
  window.addEventListener('offline', renderAll);
  document.addEventListener('DOMContentLoaded', init);

  Object.assign(window, { switchClientTab, setClientGridZoom, changeClientGridZoom, selectUnit, addDraft, sendDraftOrder, requestBill, submitJoin, saveClientProfile, handleClientImage, openJoin });
})();
