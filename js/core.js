// js/core.js - Master Node Logic (FAKDU v9.42) - FULL PERFECT VERSION

// ==========================================
// 1. DATABASE & STATE (IndexedDB)
// ==========================================
const DB_NAME = 'FAKDU_DB';
const DB_VERSION = 1;
let dbInstance = null;

let appState = {
    cart: [],
    currentUnitId: null,
    currentUnitType: 'โต๊ะ',
    unitCount: 4,
    menus: [],
    orders: {}, 
    sales: []
};

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('menus')) db.createObjectStore('menus', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'unitId' });
            if (!db.objectStoreNames.contains('sales')) db.createObjectStore('sales', { keyPath: 'id' });
        };
        request.onsuccess = (e) => { dbInstance = e.target.result; resolve(); };
        request.onerror = (e) => reject(e.target.error);
    });
}

async function dbPut(storeName, data) {
    return new Promise((resolve) => {
        const tx = dbInstance.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(data);
        tx.oncomplete = () => resolve(true);
    });
}
async function dbGetAll(storeName) {
    return new Promise((resolve) => {
        const tx = dbInstance.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
    });
}
async function dbDelete(storeName, key) {
    return new Promise((resolve) => {
        const tx = dbInstance.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
    });
}

// ==========================================
// 2. MODALS & DIALOGS
// ==========================================
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }
function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }

function showCustomDialog({ title, msg, type = 'alert', inputPlaceholder = '', onConfirm = null }) {
    document.getElementById('custom-dialog-title').innerText = title;
    document.getElementById('custom-dialog-msg').innerText = msg;
    const inputField = document.getElementById('custom-dialog-input');
    const cancelBtn = document.getElementById('custom-dialog-cancel');
    const confirmBtn = document.getElementById('custom-dialog-confirm');

    inputField.classList.add('hidden'); inputField.value = '';
    cancelBtn.classList.add('hidden');
    
    if (type === 'prompt') {
        inputField.classList.remove('hidden'); inputField.placeholder = inputPlaceholder;
        cancelBtn.classList.remove('hidden'); inputField.focus();
    } else if (type === 'confirm') {
        cancelBtn.classList.remove('hidden');
    }

    confirmBtn.onclick = () => {
        closeModal('modal-custom-dialog');
        if (onConfirm) type === 'prompt' ? onConfirm(inputField.value) : onConfirm(true);
    };
    cancelBtn.onclick = () => {
        closeModal('modal-custom-dialog');
        if (type === 'confirm' && onConfirm) onConfirm(false);
    };
    openModal('modal-custom-dialog');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.className = "fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-5 py-3 rounded-full shadow-xl text-sm font-black z-[100] transition-opacity duration-300";
    setTimeout(() => toast.className = "hidden", 1500);
}

// ==========================================
// 3. NAVIGATION TABS
// ==========================================
function switchTab(tabId, el = null) {
    document.querySelectorAll('.screen').forEach(scr => { scr.classList.add('hidden'); scr.classList.remove('active'); });
    document.querySelectorAll('.nav-tab').forEach(nav => nav.classList.remove('active'));
    
    const target = document.getElementById(`screen-${tabId}`);
    if(target) { target.classList.remove('hidden'); target.classList.add('active'); }
    
    if(el) {
        el.classList.add('active');
    } else {
        const activeTab = document.getElementById(`tab-${tabId}`);
        if(activeTab) activeTab.classList.add('active');
    }

    if (tabId === 'customer') renderUnits();
    if (tabId === 'shop') renderShopQueue();
    if (tabId === 'manage') renderDashboard();
}

function switchManageSub(subId, el) {
    document.querySelectorAll('.manage-tab').forEach(t => t.classList.remove('active', 'bg-white', 'text-gray-800'));
    el.classList.add('active', 'bg-white', 'text-gray-800');
    document.getElementById('sub-dash').classList.add('hidden');
    document.getElementById('sub-menu').classList.add('hidden');
    document.getElementById(`sub-${subId}`).classList.remove('hidden');
}

// ==========================================
// 4. TABLE & QUEUE LOGIC
// ==========================================
let gridZoom = 1;
function changeGridZoom(step) {
    gridZoom += step;
    if (gridZoom > 2) gridZoom = 2;
    if (gridZoom < 0) gridZoom = 0;
    const sizes = ['S', 'M', 'L'];
    document.getElementById('zoom-level-text').innerText = sizes[gridZoom];
    renderUnits();
}

function renderUnits() {
    const grid = document.getElementById('grid-units');
    grid.innerHTML = '';
    grid.className = `grid gap-4 ${gridZoom === 0 ? 'grid-cols-3' : gridZoom === 1 ? 'grid-cols-2' : 'grid-cols-1'}`;

    for (let i = 1; i <= appState.unitCount; i++) {
        const uid = i.toString();
        const hasOrder = appState.orders[uid] && appState.orders[uid].length > 0;
        // ถ้ามีออร์เดอร์ โต๊ะเปลี่ยนเป็นสีส้มชัดเจน
        const colorClass = hasOrder ? 'bg-orange-500 text-white shadow-orange-300 border-orange-600' : 'bg-white text-gray-700 shadow-sm border border-gray-100';
        
        const btn = document.createElement('button');
        btn.className = `p-6 rounded-3xl font-black text-2xl shadow-lg active:scale-95 transition-all flex flex-col items-center justify-center border-2 ${colorClass}`;
        btn.onclick = () => openOrderScreen(uid);
        btn.innerHTML = `<span class="text-[10px] font-bold uppercase mb-1 ${hasOrder ? 'text-white/80' : 'opacity-70'}">${appState.currentUnitType}</span>${uid}`;
        grid.appendChild(btn);
    }
}

function updateUnits() {
    const count = parseInt(document.getElementById('config-unit-count').value);
    const type = document.getElementById('config-unit-type').value;
    
    if (count > 4 && typeof window.checkProStatus !== 'undefined' && !checkProStatus()) {
        openModal('modal-pro-unlock');
        document.getElementById('config-unit-count').value = 4;
        return;
    }
    appState.unitCount = count;
    appState.currentUnitType = type;
    document.querySelectorAll('.lbl-unit').forEach(el => el.innerText = type);
    dbPut('settings', { key: 'unitConfig', count: count, type: type });
    showCustomDialog({ title: 'สำเร็จ', msg: 'อัปเดตจำนวนโต๊ะ/คิวแล้ว' });
    renderUnits();
}

// ==========================================
// 5. MENU & CART LOGIC (หน้าร้าน)
// ==========================================
let currentAddonMenu = null; 
let currentAddonQty = 1;

function openOrderScreen(unitId) {
    appState.currentUnitId = unitId.toString();
    document.getElementById('active-unit-id').innerText = unitId;
    appState.cart = []; 
    updateCartUI();
    renderMenuItems();
    switchTab('order');
}

function renderMenuItems() {
    const list = document.getElementById('item-list');
    list.innerHTML = '';
    
    if (appState.menus.length === 0) {
        list.innerHTML = `<div class="text-center text-gray-400 font-bold text-xs mt-10">ยังไม่มีเมนู (เพิ่มที่หลังร้าน)</div>`;
        return;
    }

    appState.menus.forEach(menu => {
        const div = document.createElement('div');
        div.className = 'bg-white p-3 rounded-2xl flex items-center justify-between border shadow-sm active:scale-95 transition-transform cursor-pointer';
        div.onclick = () => handleMenuClick(menu); // เช็ค Addon ก่อน
        
        div.innerHTML = `
            <div class="flex items-center gap-3">
                ${menu.img ? `<img src="${menu.img}" class="w-12 h-12 rounded-xl object-cover border">` : `<div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl">🍽️</div>`}
                <div>
                    <div class="font-black text-sm text-gray-800">${menu.name}</div>
                    <div class="theme-text font-black text-sm">฿${menu.price}</div>
                </div>
            </div>
            <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg">+</div>
        `;
        list.appendChild(div);
    });
}

function handleMenuClick(menu) {
    if (menu.addons && menu.addons.length > 0) {
        // มี Add-on ให้เปิด Modal
        openAddonModal(menu);
    } else {
        // ไม่มี Add-on โยนลงตะกร้าเลย จบปิ๊ง
        addToCart({ id: menu.id, name: menu.name, price: menu.price, qty: 1, note: '' });
        showToast(`🛒 เพิ่ม ${menu.name} แล้ว`);
    }
}

function openAddonModal(menu) {
    currentAddonMenu = JSON.parse(JSON.stringify(menu)); 
    currentAddonMenu.selectedAddons = []; 
    currentAddonQty = 1;
    
    document.getElementById('addon-modal-name').innerText = currentAddonMenu.name;
    document.getElementById('addon-qty-display').innerText = currentAddonQty;
    
    const list = document.getElementById('addon-options-list');
    list.innerHTML = '';
    
    currentAddonMenu.addons.forEach((addon, idx) => {
        list.innerHTML += `
            <label class="flex justify-between items-center p-3 bg-white border rounded-xl active:bg-gray-50 cursor-pointer mb-2">
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="w-5 h-5 accent-blue-600" onchange="toggleAddon(${idx}, this.checked)">
                    <span class="font-bold text-sm text-gray-700">${addon.name}</span>
                </div>
                <span class="font-black text-blue-600">+฿${addon.price}</span>
            </label>
        `;
    });
    
    updateAddonModalPrice();
    openModal('modal-addon-select');
}

function toggleAddon(idx, isChecked) {
    const addon = currentAddonMenu.addons[idx];
    if (isChecked) currentAddonMenu.selectedAddons.push(addon);
    else currentAddonMenu.selectedAddons = currentAddonMenu.selectedAddons.filter(a => a.name !== addon.name);
    updateAddonModalPrice();
}

function updateAddonModalPrice() {
    let addonPrice = 0;
    currentAddonMenu.selectedAddons.forEach(a => addonPrice += a.price);
    document.getElementById('addon-modal-price').innerText = (currentAddonMenu.price + addonPrice) * currentAddonQty;
}

function adjustAddonQty(step) {
    currentAddonQty += step;
    if (currentAddonQty < 1) currentAddonQty = 1;
    document.getElementById('addon-qty-display').innerText = currentAddonQty;
    updateAddonModalPrice();
}

function confirmAddonSelection() {
    let addonPrice = 0, addonNames = [];
    currentAddonMenu.selectedAddons.forEach(a => { addonPrice += a.price; addonNames.push(a.name); });
    
    addToCart({
        id: currentAddonMenu.id,
        name: currentAddonMenu.name,
        price: currentAddonMenu.price + addonPrice,
        qty: currentAddonQty,
        note: addonNames.length > 0 ? addonNames.join(', ') : ''
    });
    showToast(`🛒 เพิ่ม ${currentAddonMenu.name} แล้ว`);
    closeModal('modal-addon-select');
}

function addToCart(item) {
    appState.cart.push(item);
    updateCartUI();
}

function updateCartUI() {
    let total = 0;
    appState.cart.forEach(item => total += (item.price * item.qty));
    document.getElementById('cart-count').innerText = appState.cart.length;
    document.getElementById('cart-total').innerText = total;
}

function reviewCart() {
    if (appState.cart.length === 0) {
        showCustomDialog({ title: 'ตะกร้าว่าง', msg: 'กรุณาเลือกเมนูก่อนส่งออร์เดอร์' }); return;
    }
    
    document.getElementById('review-unit-id').innerText = appState.currentUnitId;
    const list = document.getElementById('review-list');
    list.innerHTML = ''; let total = 0;
    
    appState.cart.forEach((item, idx) => {
        total += item.price * item.qty;
        list.innerHTML += `
            <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <div>
                    <span class="text-blue-600 mr-2">${item.qty}x</span> <span class="text-gray-800 font-bold">${item.name}</span>
                    ${item.note ? `<br><span class="text-[10px] text-gray-500 font-normal">- ${item.note}</span>` : ''}
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-bold text-gray-800">฿${item.price * item.qty}</span>
                    <button onclick="removeFromCart(${idx})" class="w-7 h-7 bg-red-50 rounded-lg text-red-500 font-black border border-red-100 active:scale-95">X</button>
                </div>
            </div>
        `;
    });
    document.getElementById('review-total-price').innerText = total;
    openModal('modal-review');
}

function removeFromCart(idx) {
    appState.cart.splice(idx, 1);
    reviewCart(); updateCartUI();
}

async function confirmOrderSend() {
    const unitId = appState.currentUnitId;
    if (!appState.orders[unitId]) appState.orders[unitId] = [];
    appState.orders[unitId] = appState.orders[unitId].concat(appState.cart);
    await dbPut('orders', { unitId: unitId, items: appState.orders[unitId] });
    
    appState.cart = [];
    closeModal('modal-review');
    switchTab('customer'); 
    showCustomDialog({ title: 'ส่งออร์เดอร์สำเร็จ 🚀', msg: `โต๊ะ ${unitId} สั่งอาหารเรียบร้อย` });
}

// ==========================================
// 6. CHECKOUT LOGIC & ORDER MANAGEMENT
// ==========================================
function renderShopQueue() {
    const queue = document.getElementById('shop-queue');
    queue.innerHTML = '';
    let hasOrders = false;
    
    for (const [unitId, items] of Object.entries(appState.orders)) {
        if (items && items.length > 0) {
            hasOrders = true;
            let total = 0;
            items.forEach(i => total += (i.price * i.qty));
            
            queue.innerHTML += `
                <div class="bg-white p-4 rounded-3xl border shadow-sm flex justify-between items-center mb-3">
                    <div>
                        <span class="text-[10px] font-bold text-gray-400 uppercase">${appState.currentUnitType}</span>
                        <div class="font-black text-2xl text-gray-800">${unitId}</div>
                        <div class="text-xs font-bold text-blue-600 mt-1">${items.length} รายการ</div>
                    </div>
                    <div class="text-right">
                        <div class="font-black text-2xl theme-text">฿${total}</div>
                        <button onclick="openCheckout('${unitId}')" class="mt-2 theme-bg text-white px-6 py-2 rounded-xl font-black text-xs active:scale-95 shadow-md">เช็คบิล</button>
                    </div>
                </div>
            `;
        }
    }
    if (!hasOrders) queue.innerHTML = `<div class="text-center text-gray-400 font-bold text-xs mt-10">ยังไม่มีคิวค้างชำระ</div>`;
}

async function openCheckout(unitId) {
    appState.currentUnitId = unitId.toString();
    const items = appState.orders[unitId] || [];
    let total = 0;
    
    document.getElementById('checkout-unit-id').innerText = unitId;
    const list = document.getElementById('checkout-item-list');
    list.innerHTML = '';
    
    // โชว์นาฬิกา
    const timeNow = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    list.innerHTML += `<div class="text-[10px] text-gray-400 font-bold mb-3 text-center border-b pb-2">🕒 พิมพ์บิลเวลา ${timeNow} น.</div>`;
    
    // เช็คสิทธิ์แอดมิน (sessionStorage จาก vault.js)
    const isAdmin = sessionStorage.getItem('FAKDU_ADMIN_ACTIVE') === 'true';

    items.forEach((item, index) => {
        total += item.price * item.qty;
        // ปุ่มลบรายการตอนเช็คบิล (เฉพาะแอดมิน)
        const deleteBtn = isAdmin ? `<button onclick="removeSentItem('${unitId}', ${index})" class="ml-3 text-red-500 font-black px-2.5 py-1 bg-red-50 rounded border border-red-100 active:scale-95">ลบ</button>` : '';

        list.innerHTML += `
            <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <div class="flex-1">
                    <span class="text-blue-600 mr-1">${item.qty}x</span> <span class="text-gray-800 font-bold text-sm">${item.name}</span>
                    ${item.note ? `<br><span class="text-[10px] text-gray-500 font-normal">- ${item.note}</span>` : ''}
                </div>
                <div class="flex items-center">
                    <span class="font-bold text-gray-800">฿${item.price * item.qty}</span> ${deleteBtn}
                </div>
            </div>
        `;
    });
    
    document.getElementById('checkout-total').innerText = total;

    // แสดง QR Code และ Promptpay
    const settings = await dbGetAll('settings');
    const ppaySetting = settings.find(s => s.key === 'shopPromptPay');
    const bankSetting = settings.find(s => s.key === 'shopBank');
    const qrSetting = settings.find(s => s.key === 'qrImage');

    let ppayText = 'ยังไม่ได้ตั้งค่าพร้อมเพย์ (ไปที่โหมดระบบ)';
    if (ppaySetting && ppaySetting.value) {
        ppayText = `${bankSetting && bankSetting.value ? bankSetting.value + ' : ' : ''}${ppaySetting.value}`;
    }
    document.getElementById('qr-status-text').innerText = ppayText;
    
    const qrImg = document.getElementById('qr-offline-img');
    if (qrSetting && qrSetting.value) {
        qrImg.src = qrSetting.value;
        qrImg.classList.remove('hidden');
    } else {
        qrImg.classList.add('hidden');
    }

    openModal('modal-checkout');
}

// ฟังก์ชันลบรายการ (เฉพาะ Admin)
async function removeSentItem(unitId, itemIndex) {
    if (sessionStorage.getItem('FAKDU_ADMIN_ACTIVE') !== 'true') {
        showCustomDialog({ title: 'สิทธิ์ไม่เพียงพอ', msg: 'ต้องเป็นผู้ดูแลระบบ (Admin) เท่านั้นถึงจะแก้ไขบิลได้' });
        return;
    }

    showCustomDialog({
        title: 'ยืนยันการลบ',
        msg: 'ต้องการลบรายการนี้ออกจากบิลใช่หรือไม่?',
        type: 'confirm',
        onConfirm: async (isYes) => {
            if (isYes) {
                appState.orders[unitId].splice(itemIndex, 1);
                
                if (appState.orders[unitId].length === 0) {
                    delete appState.orders[unitId];
                    await dbDelete('orders', unitId);
                    closeModal('modal-checkout');
                    renderShopQueue();
                    renderUnits();
                } else {
                    await dbPut('orders', { unitId: unitId, items: appState.orders[unitId] });
                    openCheckout(unitId); 
                    renderShopQueue();
                }
            }
        }
    });
}

async function confirmPayment(method) {
    const unitId = appState.currentUnitId;
    const items = appState.orders[unitId];
    let total = 0;
    items.forEach(i => total += (i.price * i.qty));

    const saleRecord = {
        id: Date.now().toString(),
        unitId: unitId,
        date: new Date().toISOString(),
        total: total,
        method: method,
        items: items
    };

    appState.sales.push(saleRecord);
    await dbPut('sales', saleRecord);
    
    delete appState.orders[unitId];
    await dbDelete('orders', unitId);

    closeModal('modal-checkout');
    renderShopQueue();
    renderUnits(); 
    showCustomDialog({ title: 'ชำระเงินสำเร็จ ✅', msg: `ปิดบิลโต๊ะ ${unitId} เรียบร้อยแล้ว` });
}

// ==========================================
// 7. DASHBOARD LOGIC 
// ==========================================
function renderDashboard() {
    let today = 0;
    const todayDate = new Date().toISOString().split('T')[0];
    const historyList = document.getElementById('sales-history');
    historyList.innerHTML = '';

    const sortedSales = [...appState.sales].reverse();
    sortedSales.forEach(sale => {
        const saleDate = sale.date.split('T')[0];
        if (saleDate === todayDate) today += sale.total;
        
        historyList.innerHTML += `
            <div class="py-2 border-b border-gray-100 last:border-0">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-black text-gray-800">โต๊ะ ${sale.unitId}</span>
                    <span class="font-black text-green-600">+฿${sale.total}</span>
                </div>
                <div class="text-[10px] text-gray-400 flex justify-between">
                    <span>${new Date(sale.date).toLocaleTimeString('th-TH')} | ${sale.method === 'cash' ? '💵 เงินสด' : '📱 โอน'}</span>
                    <span>${sale.items.length} รายการ</span>
                </div>
            </div>
        `;
    });

    document.getElementById('stat-today').innerText = today;
    if (sortedSales.length === 0) historyList.innerHTML = `<div class="text-center text-gray-400 py-4">ยังไม่มียอดขาย</div>`;
}

// ==========================================
// 8. SYSTEM SETTINGS, MENUS (หลังร้าน) & HYDRATE
// ==========================================
let tempMenuImageBase64 = '';

function openMenuModal(menuItem = null) {
    const preview = document.getElementById('form-menu-preview');
    const addonContainer = document.getElementById('addon-fields-container');

    if (menuItem) {
        document.getElementById('form-menu-id').value = menuItem.id;
        document.getElementById('form-menu-name').value = menuItem.name;
        document.getElementById('form-menu-price').value = menuItem.price;
        tempMenuImageBase64 = menuItem.img || '';
        if (tempMenuImageBase64) { preview.src = tempMenuImageBase64; preview.classList.remove('hidden'); } 
        else { preview.classList.add('hidden'); }
        
        addonContainer.innerHTML = '';
        if (menuItem.addons) menuItem.addons.forEach(addon => addAddonField(addon));
    } else {
        document.getElementById('form-menu-id').value = '';
        document.getElementById('form-menu-name').value = '';
        document.getElementById('form-menu-price').value = '';
        tempMenuImageBase64 = '';
        preview.classList.add('hidden');
        addonContainer.innerHTML = '';
    }
    openModal('modal-menu-form');
}

function handleImage(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64 = e.target.result;
        if (type === 'temp') {
            tempMenuImageBase64 = base64;
            const preview = document.getElementById('form-menu-preview');
            preview.src = base64; preview.classList.remove('hidden');
        } else if (type === 'logo') {
            document.getElementById('shop-logo').src = base64;
            await dbPut('settings', { key: 'shopLogo', value: base64 });
            showCustomDialog({ title: 'สำเร็จ', msg: 'เปลี่ยนโลโก้ร้านเรียบร้อย' });
        } else if (type === 'qr') {
            const qrImg = document.getElementById('qr-offline-img');
            if (qrImg) { qrImg.src = base64; qrImg.classList.remove('hidden'); }
            await dbPut('settings', { key: 'qrImage', value: base64 });
            showCustomDialog({ title: 'สำเร็จ', msg: 'อัปเดตรูป QR รับเงินเรียบร้อย' });
        }
    };
    reader.readAsDataURL(file);
}

function addAddonField(addon = { name: '', price: '' }) {
    const container = document.getElementById('addon-fields-container');
    const div = document.createElement('div');
    div.className = 'flex gap-2 addon-row mb-2';
    div.innerHTML = `
        <input type="text" placeholder="ชื่อ (เช่น ไข่ดาว)" class="w-full border p-2 rounded-lg text-xs font-bold outline-none addon-name" value="${addon.name || ''}">
        <input type="number" placeholder="ราคา (+บาท)" class="w-24 border p-2 rounded-lg text-xs font-bold outline-none text-center addon-price" value="${addon.price !== undefined ? addon.price : ''}">
        <button onclick="this.parentElement.remove()" class="bg-red-50 text-red-500 px-3 rounded-lg font-black text-xs border border-red-100">X</button>
    `;
    container.appendChild(div);
}

async function saveMenuItem() {
    const id = document.getElementById('form-menu-id').value || Date.now().toString();
    const name = document.getElementById('form-menu-name').value.trim();
    const price = parseFloat(document.getElementById('form-menu-price').value);

    if (!name || isNaN(price)) { showCustomDialog({ title: 'ข้อมูลไม่ครบ', msg: 'กรุณากรอกชื่อและราคาให้ถูกต้อง' }); return; }

    const addons = [];
    document.querySelectorAll('.addon-row').forEach(row => {
        const addonName = row.querySelector('.addon-name').value.trim();
        const addonPrice = parseFloat(row.querySelector('.addon-price').value) || 0;
        if (addonName) addons.push({ name: addonName, price: addonPrice });
    });

    const newMenu = { id, name, price, img: tempMenuImageBase64, addons };
    const existingIndex = appState.menus.findIndex(m => m.id === id);
    if (existingIndex >= 0) appState.menus[existingIndex] = newMenu;
    else appState.menus.push(newMenu);

    await dbPut('menus', newMenu);
    closeModal('modal-menu-form');
    renderAdminMenuList();
    showCustomDialog({ title: 'สำเร็จ', msg: 'บันทึกเมนูเรียบร้อยแล้ว' });
}

function renderAdminMenuList() {
    const list = document.getElementById('admin-menu-list');
    const countSpan = document.getElementById('menu-count');
    if (!list) return;

    list.innerHTML = '';
    if (countSpan) countSpan.innerText = appState.menus.length;

    if (appState.menus.length === 0) {
        list.innerHTML = `<div class="text-center text-gray-400 font-bold text-xs py-5">ยังไม่มีรายการเมนู</div>`; return;
    }

    appState.menus.forEach(menu => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-3 rounded-2xl border mb-3';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                ${menu.img ? `<img src="${menu.img}" class="w-10 h-10 rounded-xl object-cover border">` : `<div class="w-10 h-10 rounded-xl bg-white border flex items-center justify-center text-sm">🍽️</div>`}
                <div>
                    <div class="font-black text-sm text-gray-800">${menu.name}</div>
                    <div class="theme-text font-black text-xs">฿${menu.price} ${menu.addons && menu.addons.length ? `<span class="text-gray-400 ml-1">(${menu.addons.length} เสริม)</span>` : ''}</div>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick='openMenuModal(${JSON.stringify(menu).replace(/'/g, "\\'")})' class="bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg font-black text-xs active:scale-95">แก้</button>
                <button onclick="deleteMenuItem('${menu.id}')" class="bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-black text-xs active:scale-95">ลบ</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function deleteMenuItem(id) {
    showCustomDialog({
        title: 'ยืนยันการลบ', msg: 'คุณแน่ใจหรือไม่ที่จะลบเมนูนี้?', type: 'confirm',
        onConfirm: async (isYes) => {
            if (isYes) {
                appState.menus = appState.menus.filter(m => m.id !== id);
                await dbDelete('menus', id);
                renderAdminMenuList(); 
                showCustomDialog({ title: 'ลบแล้ว', msg: 'ลบเมนูเรียบร้อย' });
            }
        }
    });
}

async function saveSystemSettings() {
    const name = document.getElementById('sys-shop-name').value;
    const bank = document.getElementById('sys-bank').value;
    const ppay = document.getElementById('sys-ppay').value;
    const pin = document.getElementById('sys-pin').value;
    
    document.getElementById('display-shop-name').innerText = name || 'FAKDU';
    await dbPut('settings', { key: 'shopName', value: name });
    await dbPut('settings', { key: 'shopBank', value: bank });
    await dbPut('settings', { key: 'shopPromptPay', value: ppay });
    
    if (pin.trim() !== '') {
        await dbPut('settings', { key: 'adminPin', value: pin.trim() });
        document.getElementById('sys-pin').value = ''; 
    }
    showCustomDialog({ title: 'สำเร็จ', msg: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว' });
}

async function hydrateApp() {
    await initDB();
    
    const settingsData = await dbGetAll('settings');
    settingsData.forEach(s => {
        if (s.key === 'shopName') {
            const inputName = document.getElementById('sys-shop-name');
            const dispName = document.getElementById('display-shop-name');
            if (inputName) inputName.value = s.value;
            if (dispName) dispName.innerText = s.value || 'FAKDU';
        }
        if (s.key === 'unitConfig') {
            appState.unitCount = s.count || 4; appState.currentUnitType = s.type || 'โต๊ะ';
            const inputCount = document.getElementById('config-unit-count');
            const inputType = document.getElementById('config-unit-type');
            if (inputCount) inputCount.value = appState.unitCount;
            if (inputType) inputType.value = appState.currentUnitType;
        }
        if (s.key === 'shopLogo') document.getElementById('shop-logo').src = s.value;
        if (s.key === 'qrImage') {
            const qrImg = document.getElementById('qr-offline-img');
            if (qrImg) { qrImg.src = s.value; qrImg.classList.remove('hidden'); }
        }
        if (s.key === 'shopBank') {
            const bankInput = document.getElementById('sys-bank');
            if (bankInput) bankInput.value = s.value;
        }
        if (s.key === 'shopPromptPay') {
            const ppayInput = document.getElementById('sys-ppay');
            if (ppayInput) ppayInput.value = s.value;
        }
    });

    const menusData = await dbGetAll('menus');
    appState.menus = menusData || [];

    const ordersData = await dbGetAll('orders');
    ordersData.forEach(o => { appState.orders[o.unitId] = o.items; });

    const salesData = await dbGetAll('sales');
    appState.sales = salesData || [];

    renderUnits();
    renderAdminMenuList();
}

// ==========================================
// 9. INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => { hydrateApp(); });