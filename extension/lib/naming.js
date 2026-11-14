/**
 * Nome dos arquivos salvos.
 *
 * O service worker salva direto da barra do overlay e o editor salva pelo
 * botão; os dois produziam o mesmo nome com código separado, e duas cópias da
 * mesma regra divergem no dia em que alguém mexe numa só.
 */

/** `snaplocal-2026-09-11-14-32-07.png` — ordenável por nome, sem dois arquivos
 *  colidindo dentro do mesmo segundo de uso normal. */
export function captureFilename(extension = 'png') {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `snaplocal-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
       + `-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${extension}`;
}
