import { initI18n, t } from '../lib/i18n.js';
import { cropCapture, stitchTiles } from '../lib/imaging.js';

/**
 * Pages where browsers refuse to run extensions. Hitting one is not a bug, so
 * we detect it up front and show err_restricted_page instead of a raw failure.
 */
const RESTRICTED = new RegExp([
  '^(chrome|edge|about|devtools|view-source|chrome-extension|moz-extension|blob|data):',
  '^https?://chromewebstore\\.google\\.com',
  '^https?://chrome\\.google\\.com/webstore',
  '^https?://microsoftedge\\.microsoft\\.com/addons',
  '^https?://addons\\.mozilla\\.org'
].join('|'), 'i');

const MENUS = [
  ['capture-area', 'ctx_area'],
  ['capture-visible', 'ctx_visible'],
  ['capture-fullpage', 'ctx_fullpage'],
  ['capture-delay', 'ctx_delay']
];

async function buildMenus() {
  await initI18n();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'root', title: t('ctx_parent'), contexts: ['page', 'image', 'selection'] });
  for (const [id, key] of MENUS) {
    chrome.contextMenus.create({ id, parentId: 'root', title: t(key), contexts: ['page', 'image', 'selection'] });
  }
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

// The picker in Options changes the language at runtime, so the native menus
// have to be rebuilt: unlike the DOM, they cannot be re-rendered on the fly.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.language) buildMenus();
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('err_no_active_tab');
  if (RESTRICTED.test(tab.url || '')) throw new Error('err_restricted_page');
  return tab;
}

function captureName() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `snaplocal-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
       + `-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`;
}

async function openEditor(dataUrl, tab) {
  await chrome.storage.session.set({
    lastCapture: { dataUrl, title: tab?.title || '', url: tab?.url || '', at: Date.now() }
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
}

/* ---------------- full page ---------------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// captureVisibleTab is rate limited to a couple of calls per second; going
// faster earns a quota error instead of a screenshot.
const CAPTURE_GAP = 550;
// Pause after each scroll so lazy-loaded images and scroll-triggered layout
// have a chance to settle before the tile is taken.
const SETTLE = 400;
let lastCaptureAt = 0;

async function captureThrottled(windowId) {
  const since = Date.now() - lastCaptureAt;
  if (since < CAPTURE_GAP) await wait(CAPTURE_GAP - since);
  lastCaptureAt = Date.now();
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

/* The three functions below are serialised and run inside the page. They must
   stay self contained, and they share state through a single global on the
   isolated world, which survives between executeScript calls. */

function fpPrepare() {
  const doc = document.documentElement;
  globalThis.__snapLocalFull = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    behavior: doc.style.scrollBehavior,
    hidden: [],
    seen: new Set()
  };
  // Smooth scrolling would leave every tile caught mid animation.
  doc.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);

  const height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
  return {
    height,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    maxScrollY: Math.max(0, height - window.innerHeight)
  };
}

function fpHideFixed(bottomOnly) {
  const store = globalThis.__snapLocalFull;
  if (!store) return;
  const half = window.innerHeight / 2;
  for (const el of document.querySelectorAll('body *')) {
    if (store.seen.has(el)) continue;
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    // On the first tile only the lower furniture goes away: a floating footer
    // or chat bubble would otherwise be baked into the middle of the page,
    // while the header genuinely belongs at the top.
    if (bottomOnly && el.getBoundingClientRect().top < half) continue;
    store.seen.add(el);
    store.hidden.push([el, el.style.visibility]);
    el.style.visibility = 'hidden';
  }
}

function fpScroll(y) {
  window.scrollTo(0, y);
  return window.scrollY;
}

function fpRestore() {
  const store = globalThis.__snapLocalFull;
  if (!store) return;
  for (const [el, visibility] of store.hidden) el.style.visibility = visibility;
  document.documentElement.style.scrollBehavior = store.behavior;
  window.scrollTo(store.scrollX, store.scrollY);
  delete globalThis.__snapLocalFull;
}

/**
 * A detached capture has no popup left to report to, so the toolbar icon is the
 * only channel. The badge catches the eye; the tooltip carries the reason,
 * because a bare "!" tells the user nothing about what to do differently.
 */
async function reportFailure(error) {
  const message = String(error?.message ?? '');
  const key = message.startsWith('err_') ? message : 'err_capture_failed';
  await initI18n();

  await chrome.action.setBadgeBackgroundColor({ color: '#b42318' });
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setTitle({ title: `${t('appName')} — ${t(key)}` });

  await wait(6000);
  await chrome.action.setBadgeText({ text: '' });
  // Empty restores the name from the manifest.
  await chrome.action.setTitle({ title: '' });
}

async function captureFullPage() {
  const tab = await activeTab();
  const target = { tabId: tab.id };
  const { hideFixed = true } = await chrome.storage.local.get('hideFixed');
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });

  const [{ result: page }] = await chrome.scripting.executeScript({ target, func: fpPrepare });
  const step = Math.max(1, page.viewportH);
  const total = Math.max(1, Math.ceil((page.maxScrollY + page.viewportH) / step));
  const tiles = [];

  try {
    if (hideFixed) {
      await chrome.scripting.executeScript({ target, func: fpHideFixed, args: [true] });
    }
    for (let i = 0; i < total; i++) {
      const [{ result: y }] = await chrome.scripting.executeScript({
        target, func: fpScroll, args: [Math.min(i * step, page.maxScrollY)]
      });
      await wait(SETTLE);
      tiles.push({ y, shot: await captureThrottled(tab.windowId) });
      await chrome.action.setBadgeText({ text: `${Math.round(((i + 1) / total) * 100)}%` });

      if (i === 0 && hideFixed) {
        await chrome.scripting.executeScript({ target, func: fpHideFixed, args: [false] });
      }
    }
  } finally {
    await chrome.scripting.executeScript({ target, func: fpRestore }).catch(() => {});
    await chrome.action.setBadgeText({ text: '' });
  }

  await openEditor(await stitchTiles(tiles, page), tab);
}

/** Injects the selection overlay, with its strings already resolved: the
 *  content script is a plain script and cannot import the i18n module. */
async function captureArea() {
  const tab = await activeTab();
  await initI18n();
  const strings = {
    hint: t('overlay_hint'),
    fullscreen: t('overlay_hint_fullscreen'),
    cancel: t('overlay_hint_cancel'),
    capture: t('overlay_action_capture'),
    save: t('overlay_action_save'),
    cancelAction: t('overlay_action_cancel'),
    // Tokens the overlay swaps for the live numbers as the selection changes.
    dimensions: t('overlay_dimensions', '{w}', '{h}')
  };

  const { areaConfirm = 'instant' } = await chrome.storage.local.get('areaConfirm');
  const options = { instant: areaConfirm === 'instant' };

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (s, o) => globalThis.__snapLocalArea.open(s, o),
    args: [strings, options]
  });
}

async function handleAreaSelected(message, sender) {
  const tab = sender.tab;
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const cropped = await cropCapture(shot, message.rect, message.viewport);

  if (message.action === 'save') {
    const { askSaveLocation = false } = await chrome.storage.local.get('askSaveLocation');
    await chrome.downloads.download({ url: cropped, filename: captureName(), saveAs: askSaveLocation });
    return;
  }
  await openEditor(cropped, tab);
}

async function captureVisible(known) {
  const tab = known ?? await activeTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

  // storage.session keeps the capture out of disk and dies with the browser.
  // It also survives the service worker being torn down mid-flow, which a
  // module-level variable would not.
  await openEditor(dataUrl, tab);
}

async function captureDelayed() {
  const { delaySeconds = 3 } = await chrome.storage.local.get('delaySeconds');
  // The tab is pinned before the countdown, not after it. captureVisibleTab
  // always photographs whatever is active *now*, so without this the user could
  // switch tabs mid-countdown and get a picture of the wrong page — or a bare
  // failure, since activeTab was never granted on the new one.
  const tab = await activeTab();
  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });

  try {
    for (let left = delaySeconds; left > 0; left--) {
      await chrome.action.setBadgeText({ text: String(left) });
      await wait(1000);
    }
  } finally {
    await chrome.action.setBadgeText({ text: '' });
  }

  const current = await activeTab();
  if (current.id !== tab.id) throw new Error('err_tab_changed');
  await captureVisible(current);
}

async function run(action) {
  try {
    if (action === 'capture-visible') return { ok: true, ...(await captureVisible()) };
    if (action === 'capture-area') return { ok: true, ...(await captureArea()) };

    // These two take seconds. Both check the page first, so a restricted tab
    // still reports through the popup, and only then detach: holding the popup
    // open for the whole countdown or scroll would just look frozen. The badge
    // reports progress, and reportFailure reports anything that goes wrong.
    if (action === 'capture-delay') {
      await activeTab();
      captureDelayed().catch(reportFailure);
      return { ok: true };
    }
    if (action === 'capture-fullpage') {
      await activeTab();
      captureFullPage().catch(reportFailure);
      return { ok: true };
    }
    return { ok: false, error: 'dev_coming_soon' };
  } catch (err) {
    await chrome.action.setBadgeText({ text: '' });
    const known = String(err.message).startsWith('err_');
    return { ok: false, error: known ? err.message : 'err_capture_failed' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'capture') {
    run(msg.action).then(sendResponse);
    return true; // keeps the message channel open for the async reply
  }
  if (msg?.type === 'area-selected') {
    // The overlay waits for this reply before removing itself, so the page is
    // left untouched only once the capture has actually been taken.
    handleAreaSelected(msg, sender)
      .catch(reportFailure)
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => run(command));
chrome.contextMenus.onClicked.addListener((info) => run(info.menuItemId));
