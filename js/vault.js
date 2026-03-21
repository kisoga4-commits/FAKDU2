(() => {
  'use strict';

  const SECRET = 'FAKDU_VAULT_BIND_V10';

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function makeBinding(shopId, deviceId) {
    return sha256(`${SECRET}|${String(shopId || '').trim().toUpperCase()}|${String(deviceId || '').trim()}`);
  }

  async function activateProKey({ key, shopId, deviceId, db }) {
    const normalized = String(key || '').trim();
    if (!normalized.startsWith('FKL-')) return { valid: false, message: 'รูปแบบคีย์ไม่ถูกต้อง' };
    const expected = (await makeBinding(shopId, deviceId)).slice(0, 20).toUpperCase();
    const got = normalized.replace('FKL-', '').toUpperCase();
    if (got !== expected) return { valid: false, message: 'คีย์ไม่ตรงกับ Shop ID/เครื่องนี้' };
    if (db) {
      db.licenseToken = normalized;
      db.licenseActive = true;
      db.licenseBound = { shopId, deviceId, at: Date.now() };
    }
    return { valid: true, token: normalized };
  }

  async function isProActive(db) {
    if (!db?.licenseToken || !db?.licenseBound) return false;
    const expected = `FKL-${(await makeBinding(db.licenseBound.shopId, db.licenseBound.deviceId)).slice(0, 20).toUpperCase()}`;
    return db.licenseToken === expected && db.licenseActive === true;
  }

  window.FakduVault = { activateProKey, isProActive };
})();
