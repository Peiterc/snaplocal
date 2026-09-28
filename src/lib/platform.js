/**
 * Tudo o que o editor precisa do mundo lá fora: configurações, a captura
 * pendente, o idioma da interface e salvar um arquivo.
 *
 * Esta é a implementação de extensão, escrita sobre `chrome.*`. O app de
 * desktop tem outra, em `app/platform-desktop.js`, escrita sobre a ponte com o
 * processo em C#, e `tools/sync-app-assets.py` põe uma no lugar da outra ao
 * montar o app. Por isso o editor importa sempre o mesmo caminho e nenhum dos
 * dois pacotes carrega o código do outro.
 *
 * Quem mexer aqui tem que mexer nas duas: as funções abaixo são o contrato.
 */

/** Lê configurações persistentes. `defaults` define as chaves e os padrões. */
export async function getSettings(defaults) {
  return chrome.storage.local.get(defaults);
}

export async function setSettings(items) {
  await chrome.storage.local.set(items);
}

/** O mesmo, para o que vive só enquanto o navegador está aberto. */
export async function getSession(defaults) {
  return chrome.storage.session.get(defaults);
}

export async function setSession(items) {
  await chrome.storage.session.set(items);
}

/** Endereço de um arquivo que veio dentro do pacote. */
export function assetUrl(path) {
  return chrome.runtime.getURL(path);
}

/** O idioma do navegador, usado quando o usuário não escolheu um. */
export function uiLanguage() {
  return chrome.i18n.getUILanguage();
}

/**
 * Grava a imagem. Devolve `{ ok }`, e `{ ok: false, canceled: true }` quando a
 * pessoa fechou o diálogo de salvar — desistir não é falhar, e quem chama
 * precisa saber a diferença para não anunciar um erro que não houve.
 */
export async function saveImage(blob, filename, { ask = false } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: ask });
    return { ok: true };
  } catch (error) {
    // O Chrome não expõe um código para isso: a desistência chega como
    // mensagem de erro, e é pelo texto que dá para distingui-la.
    const canceled = /cancel/i.test(String(error?.message ?? error));
    return { ok: false, canceled };
  } finally {
    // O download lê a blob de forma assíncrona, então a URL precisa
    // sobreviver um tempo depois daqui.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
