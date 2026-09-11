import { initI18n, applyI18n, t } from '../lib/i18n.js';

const toast = document.getElementById('toast');

function showError(key) {
  toast.textContent = t(key);
  toast.classList.add('show', 'error');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

async function applyTheme() {
  const { theme = 'auto' } = await chrome.storage.local.get('theme');
  if (theme !== 'auto') document.documentElement.dataset.theme = theme;
}

await initI18n();
applyI18n();
await applyTheme();

document.querySelectorAll('.mode').forEach((button) => {
  button.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'capture', action: button.dataset.action });
    // A successful capture opens its own tab; the popup just gets out of the way.
    if (res?.ok) window.close();
    else showError(res?.error || 'err_generic');
  });
});

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.title = t('appName');
