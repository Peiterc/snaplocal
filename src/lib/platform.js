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
 * Quem mexer aqui tem que mexer nas duas: as funções abaixo são o contrato, e
 * as duas implementações precisam exportar **todos** os nomes, mesmo os que um
 * dos lados nunca usa. `import` de módulo ES é resolvido na carga: uma
 * exportação faltando derruba a página inteira, não só a linha que a chamaria.
 */

/** Lê configurações persistentes. `defaults` define as chaves e os padrões. */
export async function getSettings(defaults) {
  return chrome.storage.local.get(defaults);
}

/**
 * Grava configurações e devolve `{ ok }`. O resultado existe porque no desktop
 * algumas dependem do sistema aceitar — tomar a tecla Print Screen, por
 * exemplo, pode ser recusado pelo Windows. Aqui, gravar sempre dá certo.
 */
export async function setSettings(items) {
  await chrome.storage.local.set(items);
  return { ok: true };
}

/** O mesmo, para o que vive só enquanto o navegador está aberto. */
export async function getSession(defaults) {
  return chrome.storage.session.get(defaults);
}

export async function setSession(items) {
  await chrome.storage.session.set(items);
}

/**
 * O que existe neste ambiente. A tela de Opções esconde as linhas que não se
 * aplicam, em vez de manter duas páginas quase iguais — e declarar isso aqui
 * evita que a página tenha que adivinhar onde está rodando.
 */
export const features = {
  desktop: false,
  browserShortcuts: true,   // a página de atalhos do próprio navegador
  hideFixed: true,          // esconder elementos fixos na página inteira
  areaConfirm: true         // perguntar antes de capturar a área escolhida
};

/** Versão do produto, para a seção Sobre. */
export async function appInfo() {
  return { version: chrome.runtime.getManifest().version };
}

/** Abre onde o usuário edita os atalhos. Só existe onde há navegador. */
export function openShortcutSettings() {
  // O editor de atalhos fica numa página interna cujo esquema muda por
  // navegador: o Edge recusa chrome://, e o Chrome não tem edge://.
  const scheme = navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome';
  chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
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
