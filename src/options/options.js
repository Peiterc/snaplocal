import { initI18n, applyI18n, availableLocales, t } from '../lib/i18n.js';
import {
  features, appInfo, getSettings, setSettings, openShortcutSettings
} from '../lib/platform.js';

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
  document.getElementById('version').textContent = t('about_version', version);
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
const askSaveInput = document.getElementById('askSaveLocation');
const printScreenInput = document.getElementById('usePrintScreen');
const startupInput = document.getElementById('startWithWindows');

// Uma página só para os dois ambientes: cada linha declara a que mundo
// pertence, e o que não existe aqui simplesmente não aparece.
for (const row of document.querySelectorAll('[data-only]')) {
  row.hidden = !features[row.dataset.only];
}

const { version } = await appInfo();

const settings = await getSettings({
  language: 'auto',
  theme: 'auto',
  delaySeconds: 3,
  areaConfirm: 'instant',
  hideFixed: true,
  askSaveLocation: false,
  usePrintScreen: false,
  startWithWindows: false
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
askSaveInput.checked = settings.askSaveLocation;
printScreenInput.checked = settings.usePrintScreen;
startupInput.checked = settings.startWithWindows;

languageSelect.addEventListener('change', async () => {
  await setSettings({ language: languageSelect.value });
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
  await setSettings({ theme: themeSelect.value });
  flashSaved();
});

delaySelect.addEventListener('change', async () => {
  await setSettings({ delaySeconds: Number(delaySelect.value) });
  flashSaved();
});

areaSelect.addEventListener('change', async () => {
  await setSettings({ areaConfirm: areaSelect.value });
  flashSaved();
});

hideFixedInput.addEventListener('change', async () => {
  await setSettings({ hideFixed: hideFixedInput.checked });
  flashSaved();
});

askSaveInput.addEventListener('change', async () => {
  await setSettings({ askSaveLocation: askSaveInput.checked });
  flashSaved();
});

document.getElementById('shortcuts').addEventListener('click', openShortcutSettings);

printScreenInput.addEventListener('change', async () => {
  const { ok } = await setSettings({ usePrintScreen: printScreenInput.checked });
  // Quem decide se a tecla pode ser tomada é o Windows, não nós: quando ele
  // não devolve a tecla, a opção volta sozinha e a pessoa é avisada do porquê.
  if (ok === false) {
    printScreenInput.checked = false;
    toast.textContent = t('opt_printscreen_busy');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 6000);
    return;
  }
  flashSaved();
});

startupInput.addEventListener('change', async () => {
  await setSettings({ startWithWindows: startupInput.checked });
  flashSaved();
});

document.title = t('appName');
