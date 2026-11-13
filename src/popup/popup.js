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

document.querySelectorAll('.mode[data-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'capture', action: button.dataset.action });
    // A successful capture opens its own tab; the popup just gets out of the way.
    if (res?.ok) window.close();
    else showError(res?.error || 'err_generic');
  });
});

/**
 * Se há imagem na área de transferência: true, false, ou null quando não deu
 * para saber. Só a lista de tipos é lida — o conteúdo, não.
 */
async function clipboardHasImage() {
  try {
    const items = await navigator.clipboard.read();
    return items.some((item) => item.types.some((type) => type.startsWith('image/')));
  } catch {
    return null;
  }
}

// A permissão é pedida aqui, no clique, e não na instalação: só quem usa o
// recurso vê o aviso do navegador. Já concedida, o pedido responde sim na
// hora, sem perguntar de novo.
document.getElementById('paste').addEventListener('click', async () => {
  // Tem que ser a primeira coisa do clique: depois de outro await o navegador
  // já não considera o pedido como vindo da pessoa. No Firefox o popup pode
  // fechar quando o pedido aparece; tudo bem, no próximo clique a permissão
  // já está dada e o resto segue.
  let granted;
  try {
    granted = await chrome.permissions.request({ permissions: ['clipboardRead'] });
  } catch (error) {
    // O Firefox lança em vez de responder "não" em alguns casos — por
    // exemplo, se a permissão não estiver declarada como opcional. Sem isto o
    // clique simplesmente não fazia nada, sem aviso nenhum.
    console.warn('pedido de permissão falhou:', error);
    return showError('err_generic');
  }
  if (!granted) return showError('err_clipboard_denied');

  // "Não" só quando se sabe que não há imagem. Na dúvida o editor abre e
  // tenta de novo — e, se falhar, oferece o Ctrl+V.
  if ((await clipboardHasImage()) === false) return showError('err_no_clipboard_image');

  const res = await chrome.runtime.sendMessage({ type: 'capture', action: 'paste-clipboard' });
  if (res?.ok) window.close();
  else showError(res?.error || 'err_generic');
});

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.title = t('appName');
