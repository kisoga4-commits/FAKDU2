// Backward compatibility shim.
// Main client logic moved to js/core-client.js
if (!window.__FAKDU_CLIENT_CORE_LOADED__) {
  window.__FAKDU_CLIENT_CORE_LOADED__ = true;
  const s = document.createElement('script');
  s.src = 'js/core-client.js';
  document.head.appendChild(s);
}
