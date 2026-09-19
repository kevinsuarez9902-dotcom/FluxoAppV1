// ═══════════════════════════════════════════════════════
// PWA
// ── VERSION: cambia este número cada vez que subas cambios ──
// ═══════════════════════════════════════════════════════
const APP_VERSION = '1.5';

// ── Install prompt ────────────────────────────────────
let deferredInstallPrompt = null;

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

function isAppInstalled() {
  return isStandalone;
}

function updateInstallButton() {
  const btn = document.getElementById('install-btn');
  if (!btn) return;
  if (isAppInstalled()) {
    btn.classList.remove('visible');
    return;
  }
  if (deferredInstallPrompt) {
    btn.classList.add('visible');
    btn.textContent = '📲 Instalar app';
    btn.onclick = triggerInstall;
  } else if (isIOS) {
    btn.classList.add('visible');
    btn.textContent = '📲 Cómo instalar';
    btn.onclick = showIOSInstallGuide;
  }
}

function showIOSInstallGuide() {
  const message = 'Para instalar FluxoApp en iPhone/iPad: toca Compartir en Safari y selecciona “Añadir a pantalla de inicio”.';
  if (typeof showToast === 'function') showToast(message);
  else window.alert(message);
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButton();
});

function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(() => {
    deferredInstallPrompt = null;
    updateInstallButton();
  });
}

// ── Service Worker ────────────────────────────────────
updateInstallButton();
window.addEventListener('load', updateInstallButton);
window.addEventListener('pageshow', updateInstallButton);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.update();
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }
      });
    });
  }).catch(() => {});

  // Revisa versión guardada vs actual
  const savedVer = localStorage.getItem('app_version');
  if (savedVer && savedVer !== APP_VERSION) showUpdateBanner();
  localStorage.setItem('app_version', APP_VERSION);
}

// ── Update banner ─────────────────────────────────────
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:linear-gradient(90deg,#14532d,#166534);
    border-bottom:1px solid #4ade80;
    padding:10px 14px;display:flex;align-items:center;justify-content:space-between;
    font-family:'Outfit',sans-serif;font-size:13px;color:#dcfce7;
  `;
  banner.innerHTML = `
    <span>🎉 <b>Nueva versión disponible</b></span>
    <button onclick="applyUpdate()" style="
      background:#16a34a;border:1px solid #4ade80;color:#dcfce7;
      border-radius:8px;padding:5px 14px;font-size:12px;font-weight:700;
      cursor:pointer;font-family:'Outfit',sans-serif;
    ">Actualizar</button>
  `;
  document.body.prepend(banner);
}

function applyUpdate() {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
  });
  window.location.reload();
}
