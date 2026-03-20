// js/vault.js - Security & Cloud Sync (FAKDU v9.42)

// MACHINE ID GENERATOR
function getMachineID() {
    let hwid = localStorage.getItem('FAKDU_HWID');
    if (!hwid) {
        // สร้าง ID สุ่มจากเวลา + ตัวเลข (จำลองรหัสเครื่อง)
        const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
        hwid = `FD-${Date.now().toString().slice(-6)}-${rand}`;
        localStorage.setItem('FAKDU_HWID', hwid);
    }
    return hwid;
}

// DIGITAL SIGNATURE & PRO LICENSE
function checkProStatus() {
    const savedToken = localStorage.getItem('FAKDU_LICENSE');
    if (!savedToken) return false;
    
    // ตรวจสอบลายเซ็น (จำลองการ Validate PublicKey + HWID)
    // ของจริงจะต้องใช้ jwt.verify หรือ subtle crypto
    const hwid = getMachineID();
    const expectedToken = btoa(hwid + "_FAKDU_SECRET_KEY_999").substring(0, 16).toUpperCase();
    return savedToken === expectedToken;
}

function openProModal() {
    document.getElementById('display-hwid').innerText = getMachineID();
    openModal('modal-pro-unlock');
}

function validateProKey() {
    const inputKey = document.getElementById('pro-key-input').value.trim();
    const hwid = getMachineID();
    const expectedToken = btoa(hwid + "_FAKDU_SECRET_KEY_999").substring(0, 16).toUpperCase();

    if (inputKey === expectedToken) {
        localStorage.setItem('FAKDU_LICENSE', inputKey);
        closeModal('modal-pro-unlock');
        document.getElementById('trial-badge').classList.add('hidden'); // ซ่อนปุ่มทดลอง
        showCustomDialog({ title: '👑 UNLOCKED!', msg: 'ปลดล็อค PRO สำเร็จ ขอบคุณที่อุดหนุนครับ' });
        // ปลดล็อคฟีเจอร์ต่างๆ
        document.querySelectorAll('.locked-feature').forEach(el => el.classList.remove('locked-feature'));
    } else {
        showCustomDialog({ title: 'ผิดพลาด', msg: 'รหัสปลดล็อคไม่ถูกต้อง หรือไม่ใช่ของเครื่องนี้' });
    }
}

function handleLockedFeatureClick() {
    if (!checkProStatus()) {
        openProModal();
    }
}

// ADMIN AUTHENTICATION (แก้บัค F5 แล้วหลุด)
let targetTab = null;

function attemptAdmin(tabId, el) {
    // เช็คจาก sessionStorage แทน เพื่อให้ F5 ไม่หลุด
    if (sessionStorage.getItem('FAKDU_ADMIN_ACTIVE') === 'true') {
        switchTab(tabId, el);
    } else {
        targetTab = { id: tabId, el: el };
        document.getElementById('admin-pin-input').value = '';
        openModal('modal-admin-pin');
    }
}

async function verifyAdminPin() {
    const inputPin = document.getElementById('admin-pin-input').value;
    const settings = await dbGetAll('settings');
    let savedPin = 'admin'; // รหัสเริ่มต้น
    
    const pinSetting = settings.find(s => s.key === 'adminPin');
    if (pinSetting) savedPin = pinSetting.value;

    if (inputPin === savedPin) {
        // ให้เบราว์เซอร์จำไว้ชั่วคราวว่าเข้าระบบแล้ว
        sessionStorage.setItem('FAKDU_ADMIN_ACTIVE', 'true');
        closeModal('modal-admin-pin');
        if (targetTab) {
            switchTab(targetTab.id, targetTab.el);
            targetTab = null;
        }
    } else {
        showCustomDialog({ title: 'ปฏิเสธการเข้าถึง', msg: 'รหัส PIN ไม่ถูกต้อง!' });
    }
}

function adminLogout() {
    // ลบความจำทิ้งตอนล็อกเอาท์
    sessionStorage.removeItem('FAKDU_ADMIN_ACTIVE');
    switchTab('customer', document.getElementById('tab-customer'));
    showCustomDialog({ title: 'ล็อคระบบ', msg: 'ออกจากโหมดแอดมินเรียบร้อย' });
}

// RECOVERY SYSTEM (3 QUESTIONS)
function openRecoveryModal() {
    closeModal('modal-admin-pin');
    openModal('modal-recovery');
}

// ตรงส่วน Recovery System นี่ผมดูแล้วเฮียเขียนมาโอเคเลยครับ ลอจิกแน่นปึ้ก!
async function saveRecoveryData() {
    if (!checkProStatus()) {
        showCustomDialog({ title: 'เฉพาะ PRO', msg: 'ต้องปลดล็อค PRO ก่อนตั้งค่าระบบกันลืมรหัส' });
        return;
    }

    const phone = document.getElementById('setup-rec-phone').value;
    const color = document.getElementById('setup-rec-color').value;
    const animal = document.getElementById('setup-rec-animal').value;

    if (!phone || !color || !animal) {
        showCustomDialog({ title: 'ข้อมูลไม่ครบ', msg: 'กรุณากรอกข้อมูลให้ครบทั้ง 3 ช่อง' });
        return;
    }

    const recoveryHash = btoa(`${phone}-${color}-${animal}`);
    await dbPut('settings', { key: 'recoveryHash', value: recoveryHash });
    
    closeModal('modal-recovery-setup');
    showCustomDialog({ title: 'สำเร็จ', msg: 'บันทึกข้อมูลช่วยจำเรียบร้อยแล้ว ห้ามลืมเด็ดขาด!' });
}

async function executeRecovery() {
    const phone = document.getElementById('rec-ans-phone').value;
    const color = document.getElementById('rec-ans-color').value;
    const animal = document.getElementById('rec-ans-animal').value;

    const inputHash = btoa(`${phone}-${color}-${animal}`);
    
    const settings = await dbGetAll('settings');
    const savedHashObj = settings.find(s => s.key === 'recoveryHash');
    
    if (!savedHashObj) {
        showCustomDialog({ title: 'ไม่พบข้อมูล', msg: 'คุณยังไม่เคยตั้งค่าระบบกู้คืนรหัสผ่าน' });
        return;
    }

    if (inputHash === savedHashObj.value) {
        const pinSetting = settings.find(s => s.key === 'adminPin');
        const currentPin = pinSetting ? pinSetting.value : 'admin'; // แก้นิดนึงให้ตรงกับ default ด้านบน
        closeModal('modal-recovery');
        showCustomDialog({ title: 'กู้คืนสำเร็จ 🎉', msg: `รหัส PIN ปัจจุบันของคุณคือ: ${currentPin}` });
    } else {
        showCustomDialog({ title: 'ข้อมูลไม่ตรง', msg: 'คำตอบไม่ถูกต้อง ระบบไม่อนุญาตให้กู้รหัส' });
    }
}

// CLOUD SYNC & ANTI-THEFT
let syncStatus = 0; // 0=Off, 1=Connecting, 2=Syncing, 3=Synced, 4=Lost

function forceSyncNow() {
    if (!checkProStatus()) {
        openProModal();
        return;
    }
    
    const dot = document.getElementById('online-status-dot');
    dot.className = 'absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full border-2 border-white bg-orange-500 shadow-sm z-20 animate-ping'; // ไฟส้มกะพริบ
    
    // จำลองการซิงค์ Firebase 2 วินาที
    setTimeout(() => {
        dot.className = 'absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full border-2 border-white bg-green-500 shadow-sm z-20'; // ไฟเขียว
        showCustomDialog({ title: 'ซิงค์สำเร็จ', msg: 'ข้อมูลอัปเดตตรงกับ Cloud แล้ว' });
        
        // หลังจาก 10 วิ ไฟเขียวกลายเป็นขาว (Idle)
        setTimeout(() => {
            dot.className = 'absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full border-2 border-gray-200 bg-white shadow-sm z-20';
        }, 10000);
    }, 2000);
}

// CLIENT CONNECTION HUB
function requestNewSyncKey() {
    // ระบบขอ PIN ใหม่ (จำกัด 3 ครั้งต่อวัน)
    const today = new Date().toISOString().split('T')[0];
    let pinRequests = JSON.parse(localStorage.getItem('FAKDU_PIN_REQS')) || { date: today, count: 0 };

    if (pinRequests.date !== today) {
        pinRequests = { date: today, count: 0 };
    }

    if (pinRequests.count >= 3) {
        showCustomDialog({ title: 'โควตาเต็ม', msg: 'คุณขอ PIN ใหม่ครบ 3 ครั้งแล้วสำหรับวันนี้ กรุณาลองใหม่พรุ่งนี้' });
        return;
    }

    pinRequests.count += 1;
    localStorage.setItem('FAKDU_PIN_REQS', JSON.stringify(pinRequests));

    const newPin = Math.floor(100000 + Math.random() * 900000); // สุ่ม 6 หลัก
    
    // แสดงผลบนหน้าจอ
    const displayElement = document.getElementById('display-sync-key');
    if(displayElement) displayElement.innerText = newPin;

    // จำลองการสร้าง QR Code ด้วยตัวหนังสือไปก่อน (ใช้งานจริงอาจใช้ qrcode.js)
    const qrArea = document.getElementById('sync-qr-area');
    if(qrArea) qrArea.innerHTML = `<div class="text-[8px] leading-tight text-center break-all text-blue-800">SCAN<br>FAKDU<br>${newPin}</div>`;
    
    showCustomDialog({ title: 'สร้าง PIN ใหม่', msg: `เปลี่ยน PIN สำเร็จ (เหลือโควตา ${3 - pinRequests.count} ครั้ง)` });
}

// PWA INSTALLER
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-install-banner').classList.remove('hidden');
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                document.getElementById('pwa-install-banner').classList.add('hidden');
            }
            deferredPrompt = null;
        });
    }
}

// INIT VAULT
window.addEventListener('DOMContentLoaded', () => {
    // เช็ค License ตอนเปิดแอป
    if (checkProStatus()) {
        const trialBadge = document.getElementById('trial-badge');
        if(trialBadge) trialBadge.classList.add('hidden');
        document.querySelectorAll('.locked-feature').forEach(el => el.classList.remove('locked-feature'));
    }
});