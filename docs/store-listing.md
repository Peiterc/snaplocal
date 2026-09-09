# Material de submissão às lojas

Textos prontos para colar nos formulários da Microsoft Edge Add-ons, Chrome Web
Store e Firefox AMO, mais o roteiro dos screenshots.

> **O que já vem do código.** O nome e a descrição curta que as lojas exibem são
> lidos do `manifest.json` via `__MSG_appName__` e `__MSG_appDesc__`, ou seja,
> saem dos 11 dicionários em `src/_locales/`. Você não digita isso no formulário
> em nenhuma das três lojas — já está localizado.
>
> **Limites de caracteres mudam.** Os que aparecem aqui são os que valiam quando
> este documento foi escrito. Confirme no formulário; se um campo reclamar, o
> texto abaixo tem folga para cortar.

---

## 1. Metadados comuns

| Campo | Valor |
|---|---|
| Nome | `SnapLocal` |
| Categoria | Produtividade (Edge/Chrome) · Photos & Media (AMO) |
| Site | `https://github.com/Peiterc/snaplocal` |
| Política de privacidade | `https://peiterc.github.io/snaplocal/privacy.html` |
| Suporte | `https://github.com/Peiterc/snaplocal/issues` |
| Licença | GPL-3.0 |
| Idiomas | en, pt_BR, pt, es, fr, it, de, ru, pl, tr, id |

### Propósito único (exigido pela Chrome Web Store)

> SnapLocal captures screenshots of web pages and lets the user annotate, blur or
> redact them locally, then copy or save the result. It does not transmit any
> data.

---

## 2. Descrição longa — inglês

```
SnapLocal is a screenshot tool that never phones home.

Capture, annotate, blur — and nothing leaves your computer. No account, no
cloud, no tracking, and not a single network request.

── FOUR WAYS TO CAPTURE ──

• Select area — drag over any part of the page
• Visible part — exactly what is on screen right now
• Full page — scrolls the page and stitches it into one image
• Delayed — a countdown before the shot, for menus and hover states

── A REAL EDITOR ──

Rectangle, ellipse, arrow, line, pencil, highlighter and text, with colour,
thickness and font controls. Undo and redo everything, including the crop:
cropping is non-destructive, so undo brings the discarded pixels back.

Copy straight to the clipboard, or save as PNG.

── BLUR THAT TELLS YOU THE TRUTH ──

Blur and pixelate are here. But blurred text can sometimes be reconstructed,
so SnapLocal also gives you Redact: a solid block that cannot be reversed.
The first time you blur something, it says so, and offers to convert that
region to a redaction.

A privacy tool that quietly lets you leak a password is not a privacy tool.

── PRIVATE BY CONSTRUCTION, NOT BY PROMISE ──

• No network requests at all. No analytics, no crash reporting, no CDN,
  no remote code
• No account and no sign-in
• No host permissions: it can only read a page at the moment you start a
  capture on it
• Your settings stay in this browser, on this computer
• Open source under GPL-3.0 — read the code yourself, and any published fork
  has to stay open too

── AVAILABLE IN 11 LANGUAGES ──

English, Português (Brasil), Português, Español, Français, Italiano, Deutsch,
Русский, Polski, Türkçe, Bahasa Indonesia. You can pick the interface language
independently of your browser language.

── KEYBOARD SHORTCUTS ──

Alt+Shift+S — select area
Alt+Shift+V — visible part
Alt+Shift+F — full page

All three can be changed in your browser's shortcut settings.

── FREE, AND STAYING THAT WAY ──

No paid tier, no upsell, no watermark. Source code, issue tracker and
translation guide: https://github.com/Peiterc/snaplocal
```

---

## 3. Descrição longa — português

```
SnapLocal é uma ferramenta de captura de tela que nunca liga para casa.

Capture, anote, borre — e nada sai do seu computador. Sem conta, sem nuvem, sem
rastreamento e sem uma única requisição de rede.

── QUATRO FORMAS DE CAPTURAR ──

• Selecionar área — arraste sobre qualquer parte da página
• Parte visível — exatamente o que está na tela agora
• Página inteira — rola a página e junta tudo numa imagem só
• Com atraso — contagem regressiva antes do disparo, para menus e estados de
  hover

── UM EDITOR DE VERDADE ──

Retângulo, elipse, seta, linha, lápis, marca-texto e texto, com controle de cor,
espessura e fonte. Desfaz e refaz tudo, inclusive o recorte: ele é
não-destrutivo, então desfazer devolve os pixels descartados.

Copie direto para a área de transferência ou salve em PNG.

── UM BORRÃO QUE FALA A VERDADE ──

Borrar e pixelizar estão aqui. Mas texto borrado às vezes pode ser
reconstruído, então a SnapLocal também oferece a Tarja: um bloco sólido que não
pode ser revertido. Na primeira vez que você borra algo, ela avisa — e oferece
converter aquela região em tarja.

Uma ferramenta de privacidade que deixa você vazar uma senha em silêncio não é
uma ferramenta de privacidade.

── PRIVADA POR CONSTRUÇÃO, NÃO POR PROMESSA ──

• Nenhuma requisição de rede. Sem analytics, sem relatório de erros, sem CDN,
  sem código remoto
• Sem conta e sem login
• Sem permissão de host: ela só consegue ler uma página no momento em que você
  inicia uma captura nela
• Suas configurações ficam neste navegador, neste computador
• Código aberto sob GPL-3.0 — leia o código, e qualquer fork publicado também
  precisa ficar aberto

── DISPONÍVEL EM 11 IDIOMAS ──

Português (Brasil), Português, English, Español, Français, Italiano, Deutsch,
Русский, Polski, Türkçe, Bahasa Indonesia. Você pode escolher o idioma da
interface independentemente do idioma do navegador.

── ATALHOS DE TECLADO ──

Alt+Shift+S — selecionar área
Alt+Shift+V — parte visível
Alt+Shift+F — página inteira

Os três podem ser trocados nas configurações de atalhos do navegador.

── GRATUITA, E VAI CONTINUAR ──

Sem versão paga, sem upsell, sem marca d'água. Código-fonte, relato de problemas
e guia de tradução: https://github.com/Peiterc/snaplocal
```

---

## 4. Justificativa das permissões

É o campo que mais atrasa revisão. Seja literal: diga o que a permissão faz na
extensão, não o que ela permite em tese.

| Permissão | Justificativa (EN) | Justificativa (PT) |
|---|---|---|
| `activeTab` | Required to photograph the tab the user is looking at, only at the moment they invoke the extension. This is what replaces a broad host permission. | Necessária para fotografar a aba que o usuário está vendo, apenas no momento em que ele aciona a extensão. É o que substitui uma permissão ampla de host. |
| `scripting` | Required to draw the region-selection overlay on the page, and to scroll the page step by step during a full-page capture. | Necessária para desenhar o overlay de seleção sobre a página e para rolar a página passo a passo durante a captura de página inteira. |
| `storage` | Required to remember the user's preferences and to hand the capture from the background worker to the editor tab. Nothing is synced or transmitted. | Necessária para guardar as preferências e para entregar a captura do service worker à aba do editor. Nada é sincronizado nem transmitido. |
| `downloads` | Required to write the image to disk when the user clicks Save. | Necessária para gravar a imagem no disco quando o usuário clica em Salvar. |
| `contextMenus` | Required to add the right-click entries that start a capture. | Necessária para adicionar os itens de menu do botão direito que iniciam uma captura. |

**Ausência que vale destacar no formulário:** não há `host_permissions`. Se
houver campo livre, diga isso — é incomum numa extensão de captura e joga a
favor na revisão.

### Declaração de uso de dados (Chrome Web Store)

O formulário lista categorias de dados. **Nenhuma se aplica.** Marque as três
certificações finais:

- ☑️ Não vendo nem transfiro dados de usuário a terceiros, fora dos casos de uso aprovados
- ☑️ Não uso nem transfiro dados de usuário para propósitos alheios à funcionalidade principal
- ☑️ Não uso nem transfiro dados de usuário para determinar solvência ou conceder crédito

---

## 5. Roteiro dos screenshots

### Dimensões

| Loja | Tamanho | Quantidade |
|---|---|---|
| Chrome Web Store | 1280×800 | até 5 |
| Edge Add-ons | 1366×768 | pelo menos 1, mande 4–5 |
| Firefox AMO | livre; 1280×800 serve | até 10 |

Se for tirar um jogo só, use **1280×800** e mande o mesmo nas três. O corte que
o Edge faz é aceitável.

> ⚠️ **Nunca use dado real.** Screenshot de loja é público e permanente. Use
> uma página fictícia — `tools/harness.html` do próprio repositório tem um
> painel de conta falso, com CPF, token e conta bancária inventados, feito
> exatamente para isso.

### Os cinco quadros

**1. A seleção de área em ação** ← este vira a miniatura, é o mais importante

Overlay ativo sobre uma página, com o retângulo puxado, a área de fora
escurecida e a leitura `1024 × 768` visível. Vende a função principal em um
olhar.

**2. Tarja e borrão sobre dados sensíveis**

O editor com o painel de conta falso, uma região borrada e outra com tarja
sólida — lado a lado, para a diferença ficar óbvia. É o diferencial do produto.

**3. O diálogo de aviso do blur**

O modal "Borrar nem sempre é seguro" aberto. Nenhum concorrente mostra isso;
é a prova visual de que a privacidade aqui é levada a sério.

**4. O editor anotando de verdade**

Seta, retângulo, texto com contorno e marca-texto sobre uma captura, com a barra
de ferramentas inteira visível. Mostra que é editor, não só captura.

**5. A seção de privacidade nas Configurações**

As três promessas na tela, mais o seletor de idioma aberto mostrando os 11
idiomas. Fecha o argumento e sinaliza alcance internacional.

### Como regenerar

Cada quadro é montado por URL, então não é preciso lembrar onde arrastar nem
que ferramenta escolher. Abra cada uma no navegador com a extensão instalada,
pressione o atalho de **Parte visível** e salve:

| Quadro | URL |
|---|---|
| 1 | `tools/overlay-harness.html?shot=area` |
| 2 | `tools/harness.html?shot=blur` |
| 3 | `tools/harness.html?shot=warn` |
| 4 | `tools/harness.html?shot=annotate` |
| 5 | a tela de Opções da extensão, via `Win+Shift+S` |

O quadro 5 precisa da ferramenta do sistema: a SnapLocal se recusa a fotografar
páginas de extensão, incluindo as próprias.

Depois, com os arquivos numa pasta:

```bash
python -m http.server 8712
python tools/make-store-shots.py <pasta>
```

O processador corta o rodapé morto, encaixa pelo menor fator (a tela de Opções
é uma coluna em pé e seria cortada se escalasse pela largura), centraliza numa
moldura da cor do próprio fundo e gera os dois formatos.

---

## 6. Antes de submeter

```bash
python tools/build.py
```

- [ ] `GECKO_ID` definitivo em `tools/build.py` — **permanente na AMO**
- [x] Ícones definitivos e logo 300×300 em `docs/store-assets/`
- [x] Versão `1.0.0` no `src/manifest.json`
- [ ] Pacote do Firefox carregado num Firefox real — ES module em background
      script ainda não foi confirmado
- [ ] Política de privacidade respondendo na URL
- [x] Screenshots sem nenhum dado real, em `docs/store-assets/screenshots/`

---

## 7. Onde criar as contas

| Loja | Onde se cadastrar | Conta | Custo |
|---|---|---|---|
| **Edge Add-ons** | [partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge/public/login) | Microsoft | grátis |
| **Chrome Web Store** | [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) | Google | US$ 5, uma vez |
| **Firefox AMO** | [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) | Mozilla | grátis |

Documentação oficial de cada processo, se travar em algum passo:

- Edge — [learn.microsoft.com/microsoft-edge/extensions/publish/create-dev-account](https://learn.microsoft.com/microsoft-edge/extensions/publish/create-dev-account)
- Chrome — [developer.chrome.com/docs/webstore/register](https://developer.chrome.com/docs/webstore/register)
- Firefox — [extensionworkshop.com/documentation/publish/submitting-an-add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

Não é preciso e-mail corporativo, CNPJ nem empresa: as três aceitam cadastro de
pessoa física com conta comum. Vale criar um e-mail dedicado ao projeto, porque
o endereço de contato do desenvolvedor costuma aparecer na página pública.

### Particularidades por loja

**Edge Add-ons** — grátis. A verificação de identidade do publisher leva alguns
dias e trava a submissão, então **comece por ela** mesmo que o resto não esteja
pronto. Logo da loja em 300×300: já gerado em `docs/store-assets/logo-300.png`.

**Chrome Web Store** — taxa única de US$ 5, paga no próprio cadastro. Contas
novas passam por um período de confiança maior antes da primeira publicação. O
formulário de Privacy Practices é obrigatório (respostas na seção 4).

**Firefox AMO** — grátis. Como não há minificação, o código enviado já é o
código-fonte, o que satisfaz a exigência de envio de fonte da Mozilla. Reserve o
`GECKO_ID` antes de qualquer outra coisa: ele é permanente.
