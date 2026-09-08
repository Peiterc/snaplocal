import { initI18n, applyI18n, availableLocales, t } from '../lib/i18n.js';

const toast = document.getElementById('toast');
const languageSelect = document.getElementById('language');
const themeSelect = document.getElementById('theme');
const delaySelect = document.getElementById('delay');

function flashSaved() {
  toast.textContent = t('toast_settings_saved');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Strings that are built at runtime rather than pulled from a data-i18n node. */
function renderDynamicText() {
  for (const option of delaySelect.options) {
    option.textContent = t('opt_seconds_value', option.value);
  }
  document.getElementById('version').textContent =
    t('about_version', chrome.runtime.getManifest().version);
}

async function buildLanguagePicker(selected) {
  const locales = await availableLocales();
  languageSelect.replaceChildren();

  const auto = new Option(t('opt_language_auto'), 'auto');
  languageSelect.append(auto);
  // Each locale is labelled in its own language, read from its locale_name key,
  // so the list is legible to someone who cannot read the current UI language.
  for (const { code, name } of locales) languageSelect.append(new Option(name, code));

  languageSelect.value = selected;
}

const areaSelect = document.getElementById('areaConfirm');
const hideFixedInput = document.getElementById('hideFixed');

const settings = await chrome.storage.local.get({
  language: 'auto',
  theme: 'auto',
  delaySeconds: 3,
  areaConfirm: 'instant',
  hideFixed: true
});

await initI18n();
applyI18n();
renderDynamicText();
applyTheme(settings.theme);
await buildLanguagePicker(settings.language);
themeSelect.value = settings.theme;
delaySelect.value = String(settings.delaySeconds);
areaSelect.value = settings.areaConfirm;
hideFixedInput.checked = settings.hideFixed;

languageSelect.addEventListener('change', async () => {
  await chrome.storage.local.set({ language: languageSelect.value });
  // Re-resolve and repaint in place: no reload, so the user sees the whole page
  // switch language at once, which is the fastest way to spot a bad string.
  await initI18n();
  applyI18n();
  renderDynamicText();
  await buildLanguagePicker(languageSelect.value);
  flashSaved();
});

themeSelect.addEventListener('change', async () => {
  applyTheme(themeSelect.value);
  await chrome.storage.local.set({ theme: themeSelect.value });
  flashSaved();
});

delaySelect.addEventListener('change', async () => {
  await chrome.storage.local.set({ delaySeconds: Number(delaySelect.value) });
  flashSaved();
});

areaSelect.addEventListener('change', async () => {
  await chrome.storage.local.set({ areaConfirm: areaSelect.value });
  flashSaved();
});

hideFixedInput.addEventListener('change', async () => {
  await chrome.storage.local.set({ hideFixed: hideFixedInput.checked });
  flashSaved();
});

document.getElementById('shortcuts').addEventListener('click', () => {
  // The shortcut editor lives on an internal page whose scheme differs per
  // browser: Edge refuses chrome://, Chrome has no edge://.
  const scheme = navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome';
  chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
});

document.title = t("appName");
