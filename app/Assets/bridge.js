/**
 * Ponte entre o editor, escrito para as APIs de extensão, e a casca de
 * desktop. Injetada antes de qualquer script da página, então `chrome.*` já
 * existe quando o editor.js roda.
 *
 * Fase 1: só o suficiente para o editor abrir, carregar os idiomas, ler as
 * configurações e salvar um PNG. A camada de plataforma de verdade, com o
 * editor deixando de falar `chrome.*`, é a Fase 2 — e quando ela existir este
 * arquivo encolhe para quase nada.
 */
(() => {
  // A única coisa que não pode ser perdida ao redefinir window.chrome: é por
  // aqui que a página fala com o processo em C#.
  const webview = window.chrome && window.chrome.webview;
  if (!webview) return;

  let seq = 0;
  const waiting = new Map();

  webview.addEventListener('message', (event) => {
    const reply = event.data;
    const resolve = waiting.get(reply && reply.id);
    if (resolve) {
      waiting.delete(reply.id);
      resolve(reply.result);
    }
  });

  const ask = (type, payload) => new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    webview.postMessage({ id, type, payload });
  });

  /** chrome.storage aceita string, array ou objeto com padrões. */
  const wantedKeys = (query) => {
    if (typeof query === 'string') return [query];
    if (Array.isArray(query)) return query;
    if (query && typeof query === 'object') return Object.keys(query);
    return [];
  };

  const area = (name) => ({
    async get(query) {
      const stored = await ask('storage.get', { area: name, keys: wantedKeys(query) });
      // Os padrões do chamador valem para o que não existe, como na API real.
      const defaults = (query && typeof query === 'object' && !Array.isArray(query)) ? query : {};
      return { ...defaults, ...stored };
    },
    async set(items) {
      await ask('storage.set', { area: name, items });
    }
  });

  window.chrome = {
    webview,
    storage: { local: area('local'), session: area('session') },
    runtime: {
      // As páginas são servidas por um host virtual, então o caminho relativo
      // ao próprio site é o equivalente exato de chrome.runtime.getURL.
      getURL: (path) => new URL(path, `${location.origin}/`).href
    },
    i18n: {
      getUILanguage: () => navigator.language
    },
    downloads: {
      // O editor entrega uma blob: URL, que o processo em C# não consegue ler.
      // A conversão para base64 acontece aqui, onde a blob existe.
      async download({ url, filename, saveAs }) {
        const blob = await (await fetch(url)).blob();
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(blob);
        });
        const result = await ask('save', { filename, base64, saveAs: Boolean(saveAs) });
        if (!result || !result.ok) throw new Error('save failed');
        return 1;
      }
    }
  };
})();
