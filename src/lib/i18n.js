/**
 * Hybrid i18n layer.
 *
 * The manifest keeps using __MSG_*__ so the stores pull a localized name and
 * description straight from _locales. Everything inside the UI goes through
 * this module instead of chrome.i18n.getMessage(), because that API is locked
 * to the browser language and we want a manual override in Options.
 *
 * Both mechanisms read the exact same _locales/<locale>/messages.json files.
 */

/** Locales shipped in v1. Add a folder under _locales/ and list it here. */
export const SUPPORTED = [
  'en', 'pt_BR', 'pt', 'es', 'ru', 'de', 'fr', 'it', 'id', 'tr', 'pl'
];

const FALLBACK = 'en';

let current = FALLBACK;
let dict = null;
let fallbackDict = null;

/** 'pt-BR' -> 'pt_BR'; 'pt-PT' -> 'pt'; 'es-419' -> 'es'; unknown -> 'en'. */
export function normalize(tag) {
  if (!tag) return FALLBACK;
  const full = String(tag).replace('-', '_');
  if (SUPPORTED.includes(full)) return full;
  const base = full.split('_')[0];
  return SUPPORTED.includes(base) ? base : FALLBACK;
}

async function fetchDict(locale) {
  const res = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
  if (!res.ok) throw new Error(`locale not bundled: ${locale}`);
  return res.json();
}

/**
 * Resolves the active locale and loads its dictionary.
 * Works in the popup, the options page and the service worker alike.
 */
export async function initI18n() {
  const { language = 'auto' } = await chrome.storage.local.get('language');
  current = language === 'auto'
    ? normalize(chrome.i18n.getUILanguage())
    : normalize(language);

  fallbackDict = await fetchDict(FALLBACK);
  dict = current === FALLBACK
    ? fallbackDict
    : await fetchDict(current).catch(() => fallbackDict);

  return current;
}

export function getLocale() {
  return current;
}

/**
 * Looks a key up and fills its placeholders positionally: t('toast_saved', name)
 * feeds $1, so it maps to whichever placeholder declares "content": "$1".
 * A missing key returns the key itself, so it is loud during development
 * instead of rendering an empty button.
 */
export function t(key, ...subs) {
  const entry = (dict && dict[key]) || (fallbackDict && fallbackDict[key]);
  if (!entry) return key;

  let msg = entry.message;
  for (const [name, def] of Object.entries(entry.placeholders || {})) {
    const index = parseInt(String(def.content).replace('$', ''), 10) - 1;
    const value = subs[index] ?? '';
    msg = msg.replace(new RegExp(`\\$${name}\\$`, 'gi'), value);
  }
  return msg;
}

/**
 * Walks the DOM and fills every element carrying an i18n attribute.
 * Keeping this attribute-driven is what stops hardcoded strings from
 * creeping back into the HTML.
 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.documentElement.lang = current.replace('_', '-');
}

/**
 * Reads locale_name from every bundled locale so the Options picker can build
 * its own list. Locales not yet translated simply 404 and drop out, which means
 * the picker grows on its own as translations land.
 */
export async function availableLocales() {
  const found = [];
  for (const locale of SUPPORTED) {
    try {
      const data = await fetchDict(locale);
      found.push({ code: locale, name: data.locale_name.message });
    } catch {
      // not bundled yet
    }
  }
  return found;
}
