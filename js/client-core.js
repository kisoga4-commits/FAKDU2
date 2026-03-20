// js/client-core.js - Client Node Logic (FAKDU v9.42)

// ==========================================
// 1. CLIENT INITIALIZATION & STATE OPEN
// ==========================================
let clientConfig = {
    name: 'พนักงาน 1 (เครื่องลูก)',
    avatar: '',
    masterPin: null
};

function initClient() {
    const saved = localStorage.getItem('FAKDU_CLIENT_CONFIG');
    if (saved) {
        clientConfig = JSON.parse(saved);
        
        // อัปเดต UI หน้าเครื่องลูก
        const nameEl = document.getElementById('client-device-name');
        const avatarEl = document.getElementById('client-avatar');
        const inputNameEl = document.getElementById('sys-client-name');

        if (nameEl) nameEl.innerText = clientConfig.name;
        if (inputNameEl) inputNameEl.value = clientConfig.name;
        if (avatarEl && clientConfig.avatar) avatarEl.src = clientConfig.avatar;
    }
}
// ==========================================
// 1. CLIENT INITIALIZATION & STATE CLOSE
// ==========================================


// ==========================================
// 2. CLIENT SETTINGS & PROFILE OPEN
// ==========================================
function handleClientImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            const avatarEl = document.getElementById('client-avatar');
            if (avatarEl) avatarEl.src = base64;
            clientConfig.avatar = base64;
        };
        reader.readAsDataURL(file);
    }
}

function saveClientSettings() {
    const nameInput = document.getElementById('sys-client-name').value.trim();
    if (!nameInput) {
        showCustomDialog({ title: 'แจ้งเตือน', msg: 'กรุณากรอกชื่อเครื่องลูกหรือชื่อพนักงาน' });
        return;
    }
    
    clientConfig.name = nameInput;
    localStorage.setItem('FAKDU_CLIENT_CONFIG', JSON.stringify(clientConfig));
    
    const nameEl = document.getElementById('client-device-name');
    if (nameEl) nameEl.innerText = clientConfig.name;
    
    showCustomDialog({ title: 'บันทึกสำเร็จ', msg: 'อัปเดตโปรไฟล์เครื่องลูกเรียบร้อยแล้ว' });
}
// ==========================================
// 2. CLIENT SETTINGS & PROFILE CLOSE
// ==========================================


// ==========================================
// 3. CONNECTION TO MASTER OPEN
// ==========================================
// ฟังก์ชันนี้ถูกเรียกจากหน้า index.html เวลากด "เปลี่ยนเครื่องนี้เป็นเครื่องลูก"
function connectAsClient() {
    const pin = document.getElementById('client-pin-input').value.trim();
    if (!pin) {
        showCustomDialog({ title: 'ผิดพลาด', msg: 'กรุณากรอก PIN ที่ได้จากเครื่องแม่' });
        return;
    }
    
    showCustomDialog({ title: 'กำลังเชื่อมต่อ... ⏳', msg: `กำลังค้นหาเครื่องแม่รหัส [${pin}] ผ่าน Cloud` });
    
    // จำลองการจับคู่กับเครื่องแม่ (รอเชื่อม Firebase ใน vault.js)
    setTimeout(() => {
        closeModal('modal-custom-dialog');
        closeModal('modal-connection-hub');
        
        clientConfig.masterPin = pin;
        localStorage.setItem('FAKDU_CLIENT_CONFIG', JSON.stringify(clientConfig));
        
        // เด้งไปหน้าจอเครื่องลูก
        window.location.href = 'client.html';
    }, 1500);
}

function startClientQRScanner() {
    // โค้ด HTML5 QRCode จะถูกเรียกใช้ตรงนี้ (เปิดกล้อง)
    showCustomDialog({ title: 'สแกน QR', msg: 'กำลังเปิดกล้องเพื่อสแกน QR Code จากเครื่องแม่...' });
}
// ==========================================
// 3. CONNECTION TO MASTER CLOSE
// ==========================================


// ==========================================
// 4. CLIENT LOGOUT & CLEAR CACHE OPEN
// ==========================================
function clientLogout() {
    showCustomDialog({
        title: '⚠️ โซนอันตราย (ออกจากระบบ)',
        msg: 'ระบบจะส่งออร์เดอร์ที่ค้างอยู่ให้เสร็จ แล้วล้างแคชเครื่องนี้ทั้งหมดเพื่อป้องกันเมนูค้าง ยืนยันหรือไม่?',
        type: 'confirm',
        onConfirm: (confirmed) => {
            if (confirmed) {
                // 1. จำลองการ Sync ข้อมูลออร์เดอร์สุดท้ายไปเครื่องแม่
                const dot = document.getElementById('online-status-dot');
                if (dot) dot.className = 'absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white bg-orange-500 shadow-sm z-20 animate-ping';
                
                setTimeout(() => {
                    // 2. ล้างข้อมูลเครื่องลูกทิ้งทั้งหมด (Clear Cache)
                    localStorage.removeItem('FAKDU_CLIENT_CONFIG');
                    
                    // หากมีการใช้ IndexedDB แยกสำหรับเครื่องลูก ก็สั่งลบตรงนี้
                    // indexedDB.deleteDatabase('FAKDU_CLIENT_DB');
                    
                    showCustomDialog({ title: 'ล้างข้อมูลสำเร็จ 🧹', msg: 'ระบบกำลังพากลับไปหน้าจอหลัก...' });
                    
                    // 3. ดีดกลับไปหน้า Index
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 1500);
                }, 2000);
            }
        }
    });
}
// ==========================================
// 4. CLIENT LOGOUT & CLEAR CACHE CLOSE
// ==========================================


// ==========================================
// 5. ANTI-CHEAT RESTRICTIONS OPEN
// ==========================================
// Override ฟังก์ชันเปิดหน้าเช็คบิล (สำหรับเครื่องลูกเท่านั้น)
// เพื่อไม่ให้พนักงานแอบกดยกเลิกบิล หรือรับเงินเองโดยไม่ผ่านแม่
const originalOpenCheckout = window.openCheckout;

window.openCheckoutClient = function(unitId) {
    // ตรวจสอบว่าอยู่หน้า client.html หรือไม่
    if (window.location.pathname.includes('client.html')) {
        // ให้เรียกใช้ UI เช็คบิลเดิมจาก core.js ก่อน
        if (typeof originalOpenCheckout === 'function') {
            originalOpenCheckout(unitId);
        } else if (typeof openCheckout === 'function') {
            openCheckout(unitId);
        }

        // 🚨 ดัดแปลงปุ่มชำระเงิน: เครื่องลูกรับเงินสด/ลบบิลไม่ได้ ทำได้แค่ทวงถาม/ส่งสลิป
        const paymentButtonsArea = document.getElementById('checkout-payment-buttons');
        if (paymentButtonsArea) {
            paymentButtonsArea.innerHTML = `
                <button onclick="notifyMasterPayment()" class="w-full bg-blue-600 text-white py-4 rounded-[20px] font-black shadow-lg text-sm active:scale-95">
                    🔔 แจ้งเครื่องแม่ว่าลูกค้าโอนแล้ว
                </button>
            `;
        }
    }
};

function notifyMasterPayment() {
    showCustomDialog({ 
        title: 'ส่งสัญญาณสำเร็จ 📡', 
        msg: 'แจ้งเตือนไปยังเครื่องแม่แล้ว กรุณาให้เครื่องแม่ (แคชเชียร์) เป็นผู้กดยืนยันปิดบิล' 
    });
    closeModal('modal-checkout');
}
// ==========================================
// 5. ANTI-CHEAT RESTRICTIONS CLOSE
// ==========================================


// ==========================================
// 6. INIT TRIGGER
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // เช็คว่าเปิดไฟล์ client.html อยู่หรือเปล่า
    if (window.location.pathname.includes('client.html')) {
        initClient();
        
        // แก้ไขปุ่มเช็คบิลในหน้า shop-queue ให้เรียก openCheckoutClient แทน
        // (ลอจิกนี้จะไปคลุมทับการ Render ของ core.js ตอนที่อยู่เครื่องลูก)
        const observer = new MutationObserver(() => {
            const checkoutBtns = document.querySelectorAll('button[onclick^="openCheckout("]');
            checkoutBtns.forEach(btn => {
                const attr = btn.getAttribute('onclick');
                const newAttr = attr.replace('openCheckout', 'openCheckoutClient');
                btn.setAttribute('onclick', newAttr);
            });
        });
        
        const shopQueue = document.getElementById('shop-queue');
        if(shopQueue) {
            observer.observe(shopQueue, { childList: true, subtree: true });
        }
    }
});