/**
 * A implementação de desktop do contrato definido em `src/lib/platform.js`.
 * `tools/sync-app-assets.py` copia este arquivo por cima daquele ao montar o
 * app, então o editor importa o mesmo caminho nos dois mundos e nenhum pacote
 * carrega o código do outro.
 *
 * Do outro lado da conversa está `app/EditorWindow.cs`.
 */

// O canal com o processo em C#. É o único ponto de contato com o WebView2.
const webview = globalThis.chrome?.webview;

let seq = 0;
const waiting = new Map();

webview?.addEventListener('message', (event) => {
  const reply = event.data;
  const resolve = waiting.get(reply?.id);
  if (resolve) {
    waiting.delete(reply.id);
    resolve(reply.result);
  }
});

function ask(type, payload) {
  if (!webview) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    webview.postMessage({ id, type, payload });
  });
}

async function read(area, defaults) {
  const stored = await ask('storage.get', { area, keys: Object.keys(defaults) });
  return { ...defaults, ...stored };
}

export async function getSettings(defaults) {
  return read('local', defaults);
}

export async function setSettings(items) {
  await ask('storage.set', { area: 'local', items });
}

/**
 * No desktop, "sessão" é a vida do processo: a captura pendente e o aviso do
 * borrão morrem quando o app fecha, como morrem com o navegador na extensão.
 */
export async function getSession(defaults) {
  return read('session', defaults);
}

export async function setSession(items) {
  await ask('storage.set', { area: 'session', items });
}

export function assetUrl(path) {
  // As páginas vêm de um host virtual servido pelo próprio app, então o
  // caminho relativo à origem é o equivalente de chrome.runtime.getURL.
  return new URL(path, `${location.origin}/`).href;
}

export function uiLanguage() {
  return navigator.language;
}

export async function saveImage(blob, filename, { ask: askWhere = false } = {}) {
  // O C# não consegue ler uma blob: URL, então a conversão acontece aqui, do
  // lado onde a blob existe.
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });

  const result = await ask('save', { filename, base64, saveAs: askWhere });
  return { ok: Boolean(result?.ok), canceled: Boolean(result?.canceled) };
}
