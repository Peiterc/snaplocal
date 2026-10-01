import { initI18n, applyI18n, availableLocales, t } from '../lib/i18n.js';
import {
  features, appInfo, getSettings, setSettings, openShortcutSettings, closeWindow
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

/**
 * Trechos cuja redação muda fora do navegador. O texto padrão fica no HTML,
 * como em toda a página; aqui só se troca o que o app precisa dizer de outro
 * jeito — "neste navegador" não significa nada num aplicativo.
 */
function applyPlatformText() {
  if (!features.desktop) return;
  for (const node of document.querySelectorAll('[data-i18n-desktop]')) {
    node.textContent = t(node.dataset.i18nDesktop);
  }
}

/** Aviso que fica mais tempo na tela: explica por que algo não aconteceu. */
function warn(key) {
  toast.textContent = t(key);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 7000);
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

  // No app não existe navegador: quem dá o idioma ali é o sistema.
  const autoLabel = features.desktop ? 'opt_language_auto_system' : 'opt_language_auto';
  const auto = new Option(t(autoLabel), 'auto');
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
applyPlatformText();
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
  applyPlatformText();
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
    warn('opt_printscreen_busy');
    return;
  }
  flashSaved();
});

startupInput.addEventListener('change', async () => {
  const { ok } = await setSettings({ startWithWindows: startupInput.checked });
  // Quem desativou o app na lista de inicialização do Windows mandou, e só de
  // lá dá para religar. Fingir que deu certo deixaria a opção ligada sem
  // efeito nenhum.
  if (ok === false) {
    startupInput.checked = false;
    warn('opt_startup_blocked');
    return;
  }
  flashSaved();
});

// Esc fecha a janela das Opções, como em qualquer caixa de diálogo do
// Windows. Dentro de um campo aberto — um select mostrando a lista — o Esc é
// de quem está escolhendo, e o navegador trata antes de chegar aqui.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeWindow();
});

document.title = t('appName');
