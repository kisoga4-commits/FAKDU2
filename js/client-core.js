(() => {
  'use strict';

  const APP_VERSION = '9.46';
  const LS_PENDING_PIN = 'FAKDU_PENDING_CLIENT_PIN';
  const LS_PENDING_SHOP_ID = 'FAKDU_PENDING_MASTER_SHOP_ID';

  const state = {
    dbApi: null,
    deviceId: '',
    clientId: '',
    profile: {
      name: '',
      avatar: ''
    },
    session: {
      shopId: '',
      pin: '',
      approved: false,
      approvedAt: null,
      lastApprovalAt: null,
      lastSyncAt: null,
      syncKey: '',
      linkedAt: null
    },
    snapshot: null,
    queue: [],
    drafts: {},
    activeUnitId: null,
    activeTab: 'units',
    gridZoom: 2,
    scanner: null,
    channel: null,
    heartbeatTimer: null,
    liveTimer: null,
    joinPollingTimer: null,
    toastTimer: null,
    pendingAddonItem: null,
    soundEnabled: true,
    online: navigator.onLine
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('th-TH');
  }

  function randomId(prefix = 'ID') {
    const rand = Math.random().toString(36).slice(2, 9).toUpperCase();
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
  }

  function nowTs() {
    return Date.now();
  }

  function thaiDate(ts) {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '-';
    }
  }

  function formatDurationFrom(startTime) {
    if (!startTime) return 'ยังไม่เริ่ม';
    const sec = Math.max(0, Math.floor((Date.now() - Number(startTime)) / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}ชม. ${m}น.`;
    if (m > 0) return `${m}น. ${s}วิ`;
    return `${s}วิ`;
  }

  function getUnitTypeLabel() {
    return state.snapshot?.unitType || 'โต๊ะ';
  }

  function getUnits() {
    return Array.isArray(state.snapshot?.units) ? state.snapshot.units : [];
  }

  function getItems() {
    return Array.isArray(state.snapshot?.items) ? state.snapshot.items : [];
  }

  function getDraft(unitId) {
    return Array.isArray(state.drafts[String(unitId)]) ? state.drafts[String(unitId)] : [];
  }

  function setDraft(unitId, rows) {
    state.drafts[String(unitId)] = Array.isArray(rows) ? rows : [];
  }

  function totalDraft(unitId) {
    return getDraft(unitId).reduce((sum, row) => sum + Number(row.total || 0), 0);
  }

  function pendingQueueCount() {
    return Array.isArray(state.queue) ? state.queue.length : 0;
  }

  function isApproved() {
    return Boolean(state.session?.approved && state.session?.shopId);
  }

  function getOnlineChipText() {
    return state.online ? 'ONLINE' : 'OFFLINE';
  }

  function channelName(shopId) {
    return `FAKDU_SYNC_${shopId || 'DEFAULT'}`;
  }

  function currentClientPayload() {
    return {
      clientId: state.clientId,
      name: state.profile.name || `Client ${String(state.clientId).slice(-4)}`,
      avatar: state.profile.avatar || '',
      pin: state.session.pin || '',
      approved: isApproved(),
      lastSeen: nowTs(),
      lastSyncAt: state.session.lastSyncAt || null,
      pendingOps: pendingQueueCount(),
      shopId: state.session.shopId || ''
    };
  }

  function playBeep(type = 'click') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!state.audioCtx) state.audioCtx = new AudioCtx();
      const ctx = state.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'success') {
        osc.frequency.setValueAtTime(760, ctx.currentTime);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.09);
        return;
      }
      if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(190, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
        osc.start(); osc.stop(ctx.currentTime + 0.16);
        return;
      }
      osc.frequency.setValueAtTime(620, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.start(); osc.stop(ctx.currentTime + 0.05);
    } catch (_) {}
  }

  function showToast(message, type = 'click') {
    if (type) playBeep(type);
    const el = qs('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function applyTheme() {
    const theme = state.snapshot?.theme || '#800000';
    const bg = state.snapshot?.bgColor || '#f8fafc';
    document.documentElement.style.setProperty('--primary', theme);
    document.documentElement.style.setProperty('--bg', bg);
    document.body.style.background = bg;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme);
    const shopName = state.snapshot?.shopName || 'FAKDU';
    const logo = state.snapshot?.logo || 'icon.png';
    if (qs('client-shop-name')) qs('client-shop-name').textContent = shopName;
    if (qs('client-shop-logo')) qs('client-shop-logo').src = logo;
    document.title = `${shopName} - Client`;
  }

  function updateNetworkUi() {
    const onlineDot = qs('client-online-dot');
    const onlineChip = qs('client-online-chip');
    if (onlineDot) {
      onlineDot.classList.toggle('bg-green-500', state.online);
      onlineDot.classList.toggle('bg-red-500', !state.online);
    }
    if (onlineChip) {
      onlineChip.textContent = getOnlineChipText();
      onlineChip.className = state.online
        ? 'text-[10px] font-black px-2 py-0.5 rounded-full bg-white/95 text-emerald-700'
        : 'text-[10px] font-black px-2 py-0.5 rounded-full bg-white/95 text-red-600';
    }
  }

  function updateApprovalUi() {
    const chip = qs('client-approval-chip');
    const sub = qs('client-profile-sub');
    const statusText = isApproved() ? 'เชื่อมแล้ว' : 'รออนุมัติ';
    if (chip) {
      chip.textContent = statusText;
      chip.className = isApproved()
        ? 'text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'text-[10px] font-black px-2 py-0.5 rounded-full bg-white/15 border border-white/25';
    }
    if (sub) {
      if (!state.session.shopId) sub.textContent = 'ยังไม่ได้ผูกกับเครื่องแม่';
      else if (!isApproved()) sub.textContent = 'ส่งคำขอแล้ว รอเครื่องแม่กดยอมรับ';
      else sub.textContent = `เชื่อมกับร้าน ${state.snapshot?.shopName || state.session.shopId}`;
    }
    const wait = qs('screen-client-wait');
    const main = qs('screen-client-main');
    const nav = qs('client-main-nav');
    if (wait) wait.classList.toggle('hidden', isApproved());
    if (main) main.classList.toggle('hidden', !isApproved());
    if (nav) nav.classList.toggle('hidden', !isApproved());

    const joinStatusText = qs('join-status-text');
    const joinStatusHint = qs('join-status-hint');
    if (joinStatusText) {
      if (!state.session.shopId) joinStatusText.textContent = 'ยังไม่ได้ส่งคำขอ';
      else if (!isApproved()) joinStatusText.textContent = 'ส่งคำขอแล้ว รอเครื่องแม่อนุมัติ';
      else joinStatusText.textContent = 'เชื่อมต่อสำเร็จ';
    }
    if (joinStatusHint) {
      if (!state.session.shopId) joinStatusHint.textContent = 'กรอก PIN หรือสแกน QR จากเครื่องแม่';
      else if (!isApproved()) joinStatusHint.textContent = 'หน้านี้จะเปลี่ยนอัตโนมัติเมื่อเครื่องแม่กดยอมรับ';
      else joinStatusHint.textContent = 'พร้อมใช้งานโหมดเครื่องลูก';
    }
  }

  function updateProfileUi() {
    const name = state.profile.name || `เครื่องลูก ${String(state.clientId).slice(-4)}`;
    if (qs('client-profile-name-header')) qs('client-profile-name-header').textContent = name;
    if (qs('client-name-input')) qs('client-name-input').value = name;

    const avatarMini = qs('client-avatar-mini');
    const avatarMiniFallback = qs('client-avatar-mini-fallback');
    const avatarPreview = qs('client-avatar-preview');
    const avatarPreviewFallback = qs('client-avatar-preview-fallback');

    if (state.profile.avatar) {
      if (avatarMini) {
        avatarMini.src = state.profile.avatar;
        avatarMini.classList.remove('hidden');
      }
      avatarMiniFallback?.classList.add('hidden');
      if (avatarPreview) {
        avatarPreview.src = state.profile.avatar;
        avatarPreview.classList.remove('hidden');
      }
      avatarPreviewFallback?.classList.add('hidden');
    } else {
      if (avatarMini) avatarMini.classList.add('hidden');
      avatarMiniFallback && (avatarMiniFallback.textContent = name.slice(0, 1).toUpperCase());
      avatarMiniFallback?.classList.remove('hidden');
      if (avatarPreview) avatarPreview.classList.add('hidden');
      avatarPreviewFallback && (avatarPreviewFallback.textContent = name.slice(0, 1).toUpperCase());
      avatarPreviewFallback?.classList.remove('hidden');
    }

    if (qs('client-shop-id-view')) qs('client-shop-id-view').textContent = state.session.shopId || '-';
    if (qs('client-id-view')) qs('client-id-view').textContent = state.clientId || '-';
    if (qs('client-setting-status')) qs('client-setting-status').textContent = isApproved() ? 'อนุมัติแล้ว' : (state.session.shopId ? 'รออนุมัติ' : 'ยังไม่เชื่อม');
    if (qs('client-pending-queue-view')) qs('client-pending-queue-view').textContent = String(pendingQueueCount());
    if (qs('pending-op-badge')) qs('pending-op-badge').textContent = String(pendingQueueCount());
    if (qs('client-last-sync-view')) qs('client-last-sync-view').textContent = state.session.lastSyncAt ? thaiDate(state.session.lastSyncAt) : '-';
  }

  function updateHeaderTexts() {
    if (qs('unit-type-title')) qs('unit-type-title').textContent = getUnitTypeLabel();
    const activeUnit = state.activeUnitId ? getUnits().find((row) => Number(row.id) === Number(state.activeUnitId)) : null;
    if (qs('active-unit-label')) {
      qs('active-unit-label').textContent = activeUnit ? `${getUnitTypeLabel()} ${activeUnit.id}` : `ยังไม่ได้เลือก${getUnitTypeLabel()}`;
    }
    if (qs('active-unit-time')) {
      qs('active-unit-time').textContent = activeUnit?.startTime ? `ใช้งานมาแล้ว ${formatDurationFrom(activeUnit.startTime)}` : 'เลือกก่อนเพื่อเริ่มรับออร์เดอร์';
    }
    if (qs('cart-sheet-title')) {
      qs('cart-sheet-title').textContent = state.activeUnitId ? `ตะกร้า ${getUnitTypeLabel()} ${state.activeUnitId}` : 'ตะกร้า';
    }
  }

  function switchClientTab(tab, button = null) {
    state.activeTab = tab;
    document.querySelectorAll('.screen-client').forEach((el) => el.classList.add('hidden'));
    qs(`screen-client-${tab}`)?.classList.remove('hidden');
    document.querySelectorAll('.nav-tab').forEach((el) => el.classList.remove('active'));
    button?.classList?.add('active');
    if (!button) {
      const id = tab === 'units' ? 'tab-client-units' : tab === 'bill' ? 'tab-client-bill' : 'tab-client-settings-bottom';
      qs(id)?.classList.add('active');
    }
    if (tab === 'bill') renderBillList();
    if (tab === 'settings') updateProfileUi();
  }

  function changeClientGridZoom(delta) {
    state.gridZoom += delta;
    if (state.gridZoom < 1) state.gridZoom = 1;
    if (state.gridZoom > 3) state.gridZoom = 3;
    const text = qs('client-zoom-level');
    if (text) text.textContent = state.gridZoom === 1 ? 'S' : state.gridZoom === 2 ? 'M' : 'L';
    const grid = qs('client-grid-units');
    if (!grid) return;
    grid.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3');
    grid.classList.add(state.gridZoom === 1 ? 'grid-cols-3' : state.gridZoom === 2 ? 'grid-cols-2' : 'grid-cols-1');
  }

  function getUnitLocalOverlay(unitId) {
    const draft = getDraft(unitId);
    const queuedOrders = state.queue.filter((op) => Number(op.unitId) === Number(unitId) && op.type === 'APPEND_ORDER').length;
    const queuedCheckout = state.queue.some((op) => Number(op.unitId) === Number(unitId) && op.type === 'REQUEST_CHECKOUT');
    return {
      draftCount: draft.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      queuedOrders,
      queuedCheckout
    };
  }

  function renderUnitsGrid() {
    const grid = qs('client-grid-units');
    if (!grid) return;
    changeClientGridZoom(0);

    const units = getUnits();
    if (!units.length) {
      grid.innerHTML = `<div class="col-span-full bg-white rounded-[24px] border p-6 text-center text-sm font-bold text-gray-400">ยังไม่มีข้อมูลจากเครื่องแม่<br>เมื่อเครื่องแม่ส่ง snapshot มา เมนูและ${escapeHtml(getUnitTypeLabel())}จะขึ้นที่นี่</div>`;
      return;
    }

    grid.innerHTML = units.map((unit) => {
      const selected = Number(state.activeUnitId) === Number(unit.id);
      const overlay = getUnitLocalOverlay(unit.id);
      const draftTotal = totalDraft(unit.id);
      const activeClass = selected ? 'active' : '';
      const statusClass = unit.checkoutRequested || overlay.queuedCheckout
        ? 'status-checkout'
        : unit.status === 'active' || overlay.draftCount > 0 || overlay.queuedOrders > 0
          ? 'status-active'
          : 'status-idle';
      const badge = unit.checkoutRequested || overlay.queuedCheckout
        ? `<div class="px-2 py-1 rounded-full bg-red-100 text-red-600 text-[10px] font-black">เช็คบิล</div>`
        : unit.status === 'active'
          ? `<div class="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">กำลังใช้งาน</div>`
          : `<div class="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">ว่าง</div>`;
      const timer = unit.startTime ? formatDurationFrom(unit.startTime) : '-';
      return `
        <button onclick="selectUnit(${unit.id})" class="unit-card ${statusClass} ${activeClass} text-left p-4 relative overflow-hidden">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-lg font-black text-gray-800">${escapeHtml(getUnitTypeLabel())} ${unit.id}</div>
              <div class="text-[11px] font-bold text-gray-400 mt-1">ใช้งาน ${escapeHtml(timer)}</div>
            </div>
            ${badge}
          </div>
          <div class="mt-4 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-2xl bg-white/80 border px-2 py-2">
              <div class="text-[10px] font-black text-gray-400">ออร์เดอร์</div>
              <div class="text-base font-black text-gray-800">${unit.orders?.length || 0}</div>
            </div>
            <div class="rounded-2xl bg-white/80 border px-2 py-2">
              <div class="text-[10px] font-black text-gray-400">ร่าง</div>
              <div class="text-base font-black text-gray-800">${overlay.draftCount}</div>
            </div>
            <div class="rounded-2xl bg-white/80 border px-2 py-2">
              <div class="text-[10px] font-black text-gray-400">ยอดร่าง</div>
              <div class="text-base font-black theme-text">฿${formatMoney(draftTotal)}</div>
            </div>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderMenuList() {
    const box = qs('client-menu-list');
    if (!box) return;
    if (!state.activeUnitId) {
      box.innerHTML = `<div class="col-span-full rounded-[20px] bg-gray-50 border p-5 text-center text-sm font-bold text-gray-400">เลือก${escapeHtml(getUnitTypeLabel())}ก่อน แล้วเมนูจะขึ้นตรงนี้</div>`;
      return;
    }
    const items = getItems();
    if (!items.length) {
      box.innerHTML = `<div class="col-span-full rounded-[20px] bg-gray-50 border p-5 text-center text-sm font-bold text-gray-400">ยังไม่มีเมนูจากเครื่องแม่</div>`;
      return;
    }

    box.innerHTML = items.map((item) => {
      const image = item.img
        ? `<img src="${item.img}" class="w-full h-32 object-cover">`
        : `<div class="w-full h-32 bg-gray-100 flex items-center justify-center text-3xl">🍽️</div>`;
      return `
        <div class="menu-card">
          ${image}
          <div class="p-3">
            <div class="line-clamp-2 min-h-[40px] font-black text-gray-800 leading-tight">${escapeHtml(item.name)}</div>
            <div class="mt-1 text-sm font-black theme-text">฿${formatMoney(item.price)}</div>
            <button onclick="quickAddItem('${String(item.id).replace(/'/g, "\\'")}')" class="mt-3 w-full py-2.5 rounded-2xl theme-bg text-white font-black">เพิ่ม</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderCartSheet() {
    const list = qs('cart-sheet-list');
    if (!list) return;
    if (!state.activeUnitId) {
      list.innerHTML = `<div class="rounded-2xl bg-gray-50 border p-4 text-sm font-bold text-gray-400 text-center">ยังไม่ได้เลือก${escapeHtml(getUnitTypeLabel())}</div>`;
      if (qs('cart-sheet-total')) qs('cart-sheet-total').textContent = '0';
      return;
    }
    const cart = getDraft(state.activeUnitId);
    if (!cart.length) {
      list.innerHTML = `<div class="rounded-2xl bg-gray-50 border p-4 text-sm font-bold text-gray-400 text-center">ยังไม่มีรายการในตะกร้า</div>`;
      if (qs('cart-sheet-total')) qs('cart-sheet-total').textContent = '0';
      return;
    }
    list.innerHTML = cart.map((row, index) => {
      const addons = Array.isArray(row.addons) && row.addons.length
        ? `<div class="mt-1 text-[11px] font-bold text-gray-400">+ ${row.addons.map((a) => `${escapeHtml(a.name)} ${a.price ? `(฿${formatMoney(a.price)})` : ''}`).join(', ')}</div>`
        : '';
      return `
        <div class="rounded-2xl border bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="font-black text-gray-800">${escapeHtml(row.name)}</div>
              <div class="text-sm font-black theme-text mt-1">฿${formatMoney(row.price)} × ${row.qty}</div>
              ${addons}
            </div>
            <div class="text-right shrink-0">
              <div class="font-black theme-text">฿${formatMoney(row.total)}</div>
              <div class="mt-2 flex items-center gap-2">
                <button onclick="changeDraftQty(${index}, -1)" class="w-8 h-8 rounded-xl bg-gray-100 font-black">-</button>
                <button onclick="changeDraftQty(${index}, 1)" class="w-8 h-8 rounded-xl bg-gray-100 font-black">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    if (qs('cart-sheet-total')) qs('cart-sheet-total').textContent = formatMoney(totalDraft(state.activeUnitId));
  }

  function renderBillList() {
    const box = qs('bill-unit-list');
    if (!box) return;
    const units = getUnits();
    if (!units.length) {
      box.innerHTML = `<div class="rounded-2xl bg-gray-50 border p-4 text-sm font-bold text-gray-400 text-center">ยังไม่มีข้อมูล${escapeHtml(getUnitTypeLabel())}</div>`;
      return;
    }
    box.innerHTML = units.map((unit) => {
      const total = (Array.isArray(unit.orders) ? unit.orders : []).reduce((sum, row) => sum + Number(row.total || 0), 0) + totalDraft(unit.id);
      const overlay = getUnitLocalOverlay(unit.id);
      const requested = unit.checkoutRequested || overlay.queuedCheckout;
      return `
        <div class="rounded-2xl border p-4 bg-white flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="font-black text-gray-800">${escapeHtml(getUnitTypeLabel())} ${unit.id}</div>
            <div class="text-xs font-bold text-gray-400 mt-1">ยอดรวมประมาณ ฿${formatMoney(total)}</div>
            <div class="text-[11px] font-bold ${requested ? 'text-red-500' : 'text-gray-400'} mt-1">${requested ? 'มีคำขอเช็คบิลแล้ว' : 'ยังไม่ได้ขอเช็คบิล'}</div>
          </div>
          <button onclick="requestCheckout(${unit.id})" class="px-4 py-3 rounded-2xl ${requested ? 'bg-red-50 text-red-600 border border-red-100' : 'theme-bg text-white'} font-black">${requested ? 'ส่งแล้ว' : 'ขอเช็คบิล'}</button>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    applyTheme();
    updateNetworkUi();
    updateApprovalUi();
    updateProfileUi();
    updateHeaderTexts();
    renderUnitsGrid();
    renderMenuList();
    renderCartSheet();
    renderBillList();
  }

  async function persistSession() {
    await state.dbApi.saveClientSession(state.session);
  }

  async function persistProfile() {
    await state.dbApi.saveClientProfile(state.profile);
  }

  async function persistQueue() {
    await state.dbApi.saveClientQueue(state.queue);
  }

  async function persistDrafts() {
    await state.dbApi.saveDrafts(state.drafts);
  }

  async function persistSnapshot() {
    if (state.snapshot) await state.dbApi.saveSnapshot(state.snapshot);
  }

  function bindChannel(shopId) {
    if (!shopId) return;
    try {
      if (state.channel) state.channel.close();
      state.channel = new BroadcastChannel(channelName(shopId));
      state.channel.onmessage = onChannelMessage;
    } catch (error) {
      console.warn('BroadcastChannel unavailable', error);
    }
  }

  function onChannelMessage(event) {
    const msg = event.data || {};
    if (!msg?.type) return;

    if (msg.type === 'MASTER_APPROVAL') {
      const payload = msg.payload || {};
      if (payload.clientId !== state.clientId) return;
      if (payload.approved) {
        state.session.approved = true;
        state.session.lastApprovalAt = nowTs();
        state.session.approvedAt = state.session.approvedAt || nowTs();
        state.session.syncKey = payload.syncKey || state.session.syncKey || '';
        persistSession();
        state.dbApi.saveClientLastSync({ at: nowTs(), by: 'MASTER_APPROVAL' }).catch(() => {});
        postHeartbeat(true);
        flushQueue();
        showToast('เครื่องแม่อนุมัติแล้ว', 'success');
      } else {
        state.session.approved = false;
        persistSession();
        showToast('เครื่องแม่ปฏิเสธคำขอ', 'error');
      }
      renderAll();
      return;
    }

    if (msg.type === 'MASTER_SNAPSHOT') {
      const payload = msg.payload || {};
      if (state.session.shopId && payload.shopId && payload.shopId !== state.session.shopId) return;
      state.snapshot = clone(payload);
      state.session.shopId = payload.shopId || state.session.shopId || '';
      state.session.lastSyncAt = nowTs();
      persistSnapshot();
      persistSession();
      state.dbApi.saveClientLastSync({ at: nowTs(), by: 'MASTER_SNAPSHOT', salesCount: Number(payload.salesCount || 0) }).catch(() => {});
      if (payload.shopId) bindChannel(payload.shopId);
      renderAll();
      return;
    }
  }

  function postMessage(payload) {
    try {
      state.channel?.postMessage(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function submitJoinRequest(force = false) {
    const shopIdInput = String(qs('join-shop-id')?.value || '').trim();
    const pin = String(qs('join-pin')?.value || '').trim();
    if (!pin && !force && !state.session.pin) {
      showToast('กรุณากรอก PIN ก่อน', 'error');
      return;
    }

    if (shopIdInput) state.session.shopId = shopIdInput;
    state.session.pin = pin || state.session.pin || '';
    if (!state.session.shopId && !state.snapshot?.shopId) {
      state.session.shopId = localStorage.getItem(LS_PENDING_SHOP_ID) || '';
    }
    const candidateShopId = state.session.shopId || state.snapshot?.shopId || localStorage.getItem(LS_PENDING_SHOP_ID) || 'DEFAULT';
    bindChannel(candidateShopId);

    const ok = postMessage({
      type: 'CLIENT_ACCESS_REQUEST',
      client: currentClientPayload()
    });

    state.session.linkedAt = nowTs();
    state.session.approved = false;
    await persistSession();
    if (ok) {
      showToast('ส่งคำขอไปเครื่องแม่แล้ว', 'click');
    } else {
      showToast('บันทึกคำขอไว้แล้ว รอออนไลน์แล้วส่งใหม่', 'error');
    }
    renderAll();
    postHeartbeat();
  }

  async function saveClientProfile() {
    const name = String(qs('client-name-input')?.value || '').trim() || `เครื่องลูก ${String(state.clientId).slice(-4)}`;
    state.profile.name = name;
    await persistProfile();
    renderAll();
    postHeartbeat(true);
    showToast('บันทึกโปรไฟล์แล้ว', 'success');
  }

  function handleClientAvatar(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      state.profile.avatar = e.target?.result || '';
      await persistProfile();
      renderAll();
      postHeartbeat(true);
      showToast('อัปเดตรูปเครื่องลูกแล้ว', 'success');
    };
    reader.readAsDataURL(file);
  }

  function selectUnit(unitId) {
    state.activeUnitId = Number(unitId);
    updateHeaderTexts();
    renderMenuList();
    renderCartSheet();
    renderUnitsGrid();
    if (window.innerWidth < 768) {
      try {
        document.getElementById('screen-client-units')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) {}
    }
  }

  function quickAddItem(itemId) {
    if (!state.activeUnitId) {
      showToast(`เลือก${getUnitTypeLabel()}ก่อน`, 'error');
      return;
    }
    const item = getItems().find((row) => String(row.id) === String(itemId));
    if (!item) return;
    if (Array.isArray(item.addons) && item.addons.length) {
      state.pendingAddonItem = clone(item);
      openAddonModal();
      return;
    }
    addToDraft(item, []);
  }

  function openAddonModal() {
    if (!state.pendingAddonItem) return;
    if (qs('addon-item-title')) qs('addon-item-title').textContent = state.pendingAddonItem.name || 'เลือกเพิ่มเติม';
    const box = qs('addon-list');
    if (box) {
      box.innerHTML = (state.pendingAddonItem.addons || []).map((addon, index) => `
        <label class="flex items-center justify-between gap-3 rounded-2xl border p-3 cursor-pointer">
          <div class="min-w-0">
            <div class="font-black text-gray-800">${escapeHtml(addon.name)}</div>
            <div class="text-xs font-bold text-gray-400">เพิ่ม ฿${formatMoney(addon.price || 0)}</div>
          </div>
          <input type="checkbox" data-addon-index="${index}" class="w-5 h-5 rounded">
        </label>
      `).join('');
    }
    qs('modal-addon')?.classList.add('open');
  }

  function closeAddonModal() {
    qs('modal-addon')?.classList.remove('open');
    state.pendingAddonItem = null;
  }

  function confirmAddonSelection() {
    if (!state.pendingAddonItem) return;
    const selectedIndexes = Array.from(document.querySelectorAll('#addon-list input[type="checkbox"]:checked')).map((el) => Number(el.dataset.addonIndex));
    const addons = selectedIndexes.map((index) => state.pendingAddonItem.addons[index]).filter(Boolean);
    addToDraft(state.pendingAddonItem, addons);
    closeAddonModal();
  }

  function addToDraft(item, addons = []) {
    const unitId = Number(state.activeUnitId);
    const draft = clone(getDraft(unitId));
    const addonKey = (addons || []).map((row) => `${row.name}:${row.price || 0}`).join('|');
    const existing = draft.find((row) => row.itemId === item.id && row._addonKey === addonKey);
    const price = Number(item.price || 0) + addons.reduce((sum, row) => sum + Number(row.price || 0), 0);
    if (existing) {
      existing.qty += 1;
      existing.total = existing.qty * existing.price;
    } else {
      draft.push({
        id: randomId('DRF'),
        itemId: item.id,
        baseName: item.name,
        name: item.name,
        qty: 1,
        price,
        total: price,
        addons: clone(addons),
        _addonKey: addonKey,
        createdAt: nowTs()
      });
    }
    setDraft(unitId, draft);
    persistDrafts();
    renderAll();
    showToast('เพิ่มลงตะกร้าแล้ว', 'click');
  }

  function changeDraftQty(index, delta) {
    if (!state.activeUnitId) return;
    const draft = clone(getDraft(state.activeUnitId));
    const item = draft[index];
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      draft.splice(index, 1);
    } else {
      item.total = item.qty * item.price;
    }
    setDraft(state.activeUnitId, draft);
    persistDrafts();
    renderAll();
  }

  function clearActiveDraft() {
    if (!state.activeUnitId) return;
    if (!confirm('ล้างตะกร้ารายการนี้ใช่ไหม?')) return;
    setDraft(state.activeUnitId, []);
    persistDrafts();
    renderAll();
    showToast('ล้างตะกร้าแล้ว', 'click');
  }

  function makeQueuedAction(type, payload = {}) {
    return {
      id: randomId('OP'),
      type,
      clientId: state.clientId,
      clientName: state.profile.name,
      clientAvatar: state.profile.avatar,
      shopId: state.session.shopId || state.snapshot?.shopId || '',
      createdAt: nowTs(),
      ...payload
    };
  }

  async function queueAction(action) {
    state.queue.push(clone(action));
    await persistQueue();
    updateProfileUi();
    postHeartbeat();
  }

  async function sendActiveOrder() {
    if (!state.activeUnitId) {
      showToast(`เลือก${getUnitTypeLabel()}ก่อน`, 'error');
      return;
    }
    const draft = clone(getDraft(state.activeUnitId));
    if (!draft.length) {
      showToast('ยังไม่มีรายการในตะกร้า', 'error');
      return;
    }
    const action = makeQueuedAction('APPEND_ORDER', {
      unitId: state.activeUnitId,
      items: draft.map((row) => ({
        id: randomId('ORD'),
        itemId: row.itemId,
        baseName: row.baseName || row.name,
        name: row.name,
        qty: Number(row.qty || 1),
        price: Number(row.price || 0),
        total: Number(row.total || 0),
        addons: Array.isArray(row.addons) ? row.addons : [],
        createdAt: row.createdAt || nowTs()
      }))
    });

    await queueAction(action);
    setDraft(state.activeUnitId, []);
    await persistDrafts();
    renderAll();
    closeCartSheet();
    showToast('บันทึกรายการแล้ว', 'success');
    flushQueue();
  }

  async function requestCheckout(unitId) {
    const targetUnitId = Number(unitId || state.activeUnitId || 0);
    if (!targetUnitId) {
      showToast(`เลือก${getUnitTypeLabel()}ก่อน`, 'error');
      return;
    }
    const action = makeQueuedAction('REQUEST_CHECKOUT', { unitId: targetUnitId });
    await queueAction(action);
    renderAll();
    showToast('ส่งคำขอเช็คบิลแล้ว', 'success');
    flushQueue();
  }

  async function flushQueue(force = false) {
    if (!state.channel || !state.session.shopId || !isApproved()) return false;
    if (!state.queue.length) {
      postHeartbeat();
      return true;
    }
    const sentIds = [];
    const remain = [];

    for (const action of state.queue) {
      const ok = postMessage({ type: 'CLIENT_ACTION', action });
      if (ok) {
        sentIds.push(action.id);
      } else if (force) {
        remain.push(action);
      } else {
        remain.push(action);
      }
    }

    if (sentIds.length) {
      state.queue = remain;
      state.session.lastSyncAt = nowTs();
      await persistQueue();
      await persistSession();
      await state.dbApi.saveClientLastSync({ at: state.session.lastSyncAt, by: 'FLUSH_QUEUE', sent: sentIds.length });
      postMessage({ type: 'CLIENT_SYNC_CHECK_ACK', payload: { clientId: state.clientId, pendingOps: state.queue.length } });
      showToast(`ส่งคิว ${sentIds.length} รายการแล้ว`, 'success');
      renderAll();
      postHeartbeat();
      return true;
    }

    renderAll();
    return false;
  }

  function forceFlushQueue() {
    flushQueue(true);
  }

  function openCartSheet() {
    renderCartSheet();
    qs('cart-sheet')?.classList.add('open');
  }

  function closeCartSheet() {
    qs('cart-sheet')?.classList.remove('open');
  }

  function openJoinSheet() {
    if (!isApproved()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    switchClientTab('settings');
  }

  async function clientLogout() {
    const hasDrafts = Object.values(state.drafts || {}).some((rows) => Array.isArray(rows) && rows.length > 0);
    const hasQueue = pendingQueueCount() > 0;
    if (hasDrafts || hasQueue) {
      const ok = confirm('ยังมีรายการร่างหรือคิวค้างส่งอยู่ การออกตอนนี้อาจทำให้ร้านต้องตรวจเอง ต้องการออกจริงไหม?');
      if (!ok) return;
    }
    await state.dbApi.clearClientSession();
    state.session = {
      shopId: '',
      pin: '',
      approved: false,
      approvedAt: null,
      lastApprovalAt: null,
      lastSyncAt: null,
      syncKey: '',
      linkedAt: null
    };
    state.queue = [];
    await persistQueue();
    try {
      state.channel?.close();
      state.channel = null;
    } catch (_) {}
    localStorage.removeItem(LS_PENDING_PIN);
    localStorage.removeItem(LS_PENDING_SHOP_ID);
    renderAll();
    switchClientTab('units');
    showToast(hasDrafts || hasQueue ? 'ออกจากเครื่องลูกแล้ว มีรายการที่ร้านต้องตรวจเอง' : 'Logout แล้ว', hasDrafts || hasQueue ? 'error' : 'success');
  }

  function postHeartbeat(loud = false) {
    if (!state.session.shopId) return;
    bindChannel(state.session.shopId);
    const ok = postMessage({ type: 'CLIENT_HEARTBEAT', client: currentClientPayload() });
    if (loud && ok) showToast('อัปเดตสถานะเครื่องลูกแล้ว', 'click');
  }

  function startHeartbeatLoop() {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => {
      state.online = navigator.onLine;
      updateNetworkUi();
      if (state.session.shopId) postHeartbeat();
      if (state.online && isApproved() && state.queue.length) flushQueue();
    }, 4000);
  }

  function startLiveLoop() {
    clearInterval(state.liveTimer);
    state.liveTimer = setInterval(() => {
      updateHeaderTexts();
      if (state.activeTab === 'units') renderUnitsGrid();
      if (state.activeTab === 'bill') renderBillList();
    }, 1000);
  }

  function openClientScanner() {
    qs('modal-client-scanner')?.classList.add('open');
    if (!window.Html5Qrcode) {
      showToast('อุปกรณ์นี้ยังใช้สแกน QR ไม่ได้', 'error');
      return;
    }
    Promise.resolve().then(async () => {
      try {
        if (state.scanner) {
          await state.scanner.stop().catch(() => {});
          await state.scanner.clear().catch(() => {});
        }
        state.scanner = new Html5Qrcode('qr-reader-client');
        await state.scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            try {
              const data = JSON.parse(decodedText);
              if (qs('join-pin')) qs('join-pin').value = data.pin || '';
              if (qs('join-shop-id')) qs('join-shop-id').value = data.shopId || '';
            } catch (_) {
              if (qs('join-pin')) qs('join-pin').value = decodedText;
            }
            closeClientScanner();
            showToast('สแกนสำเร็จ', 'success');
          }
        );
      } catch (error) {
        console.error(error);
        showToast('เปิดกล้องไม่ได้', 'error');
      }
    });
  }

  async function closeClientScanner() {
    try {
      if (state.scanner) {
        await state.scanner.stop().catch(() => {});
        await state.scanner.clear().catch(() => {});
      }
    } finally {
      state.scanner = null;
      qs('modal-client-scanner')?.classList.remove('open');
    }
  }

  async function loadBootData() {
    state.dbApi = window.FakduDB;
    if (!state.dbApi || typeof state.dbApi.ready !== 'function') {
      throw new Error('ไม่พบ js/db.js หรือ API ฐานข้อมูลไม่พร้อม');
    }

    await state.dbApi.ready();
    state.deviceId = await state.dbApi.getDeviceId();
    state.clientId = state.deviceId;

    const [profile, session, snapshot, queue, drafts, lastSync] = await Promise.all([
      state.dbApi.loadClientProfile(),
      state.dbApi.loadClientSession(),
      state.dbApi.loadSnapshot(),
      state.dbApi.loadClientQueue(),
      state.dbApi.loadDrafts(),
      state.dbApi.loadClientLastSync()
    ]);

    state.profile = {
      name: profile?.name || `เครื่องลูก ${String(state.clientId).slice(-4)}`,
      avatar: profile?.avatar || ''
    };
    state.session = {
      shopId: session?.shopId || '',
      pin: session?.pin || '',
      approved: Boolean(session?.approved),
      approvedAt: session?.approvedAt || null,
      lastApprovalAt: session?.lastApprovalAt || null,
      lastSyncAt: session?.lastSyncAt || lastSync?.at || null,
      syncKey: session?.syncKey || '',
      linkedAt: session?.linkedAt || null
    };
    state.snapshot = snapshot || null;
    state.queue = Array.isArray(queue) ? queue : [];
    state.drafts = drafts && typeof drafts === 'object' ? drafts : {};

    const pendingPin = localStorage.getItem(LS_PENDING_PIN) || '';
    const pendingShopId = localStorage.getItem(LS_PENDING_SHOP_ID) || '';
    if (pendingPin && !state.session.pin) state.session.pin = pendingPin;
    if (pendingShopId && !state.session.shopId) state.session.shopId = pendingShopId;
    if (qs('join-pin')) qs('join-pin').value = state.session.pin || '';
    if (qs('join-shop-id')) qs('join-shop-id').value = state.session.shopId || '';

    if (state.session.shopId || state.snapshot?.shopId) {
      bindChannel(state.session.shopId || state.snapshot?.shopId);
    }
  }

  function bootPendingRequest() {
    const pendingPin = localStorage.getItem(LS_PENDING_PIN) || '';
    const pendingShopId = localStorage.getItem(LS_PENDING_SHOP_ID) || '';
    if (!pendingPin && !pendingShopId) return;
    if (qs('join-pin') && pendingPin) qs('join-pin').value = pendingPin;
    if (qs('join-shop-id') && pendingShopId) qs('join-shop-id').value = pendingShopId;
    submitJoinRequest().finally(() => {
      localStorage.removeItem(LS_PENDING_PIN);
      localStorage.removeItem(LS_PENDING_SHOP_ID);
    });
  }

  function bindWindowEvents() {
    window.addEventListener('online', () => {
      state.online = true;
      updateNetworkUi();
      postHeartbeat();
      flushQueue();
    });
    window.addEventListener('offline', () => {
      state.online = false;
      updateNetworkUi();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        postHeartbeat();
        if (state.online) flushQueue();
      }
    });
  }

  async function init() {
    try {
      await loadBootData();
      bindWindowEvents();
      renderAll();
      switchClientTab('units');
      startHeartbeatLoop();
      startLiveLoop();
      bootPendingRequest();
      if (isApproved()) {
        postHeartbeat();
        if (state.online) flushQueue();
      }
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'เปิดระบบเครื่องลูกไม่สำเร็จ', 'error');
    }
  }

  window.switchClientTab = switchClientTab;
  window.changeClientGridZoom = changeClientGridZoom;
  window.selectUnit = selectUnit;
  window.quickAddItem = quickAddItem;
  window.openCartSheet = openCartSheet;
  window.closeCartSheet = closeCartSheet;
  window.changeDraftQty = changeDraftQty;
  window.clearActiveDraft = clearActiveDraft;
  window.sendActiveOrder = sendActiveOrder;
  window.requestCheckout = requestCheckout;
  window.forceFlushQueue = forceFlushQueue;
  window.openJoinSheet = openJoinSheet;
  window.submitJoinRequest = submitJoinRequest;
  window.saveClientProfile = saveClientProfile;
  window.handleClientAvatar = handleClientAvatar;
  window.clientLogout = clientLogout;
  window.openClientScanner = openClientScanner;
  window.closeClientScanner = closeClientScanner;
  window.closeAddonModal = closeAddonModal;
  window.confirmAddonSelection = confirmAddonSelection;

  document.addEventListener('DOMContentLoaded', init);
})();
