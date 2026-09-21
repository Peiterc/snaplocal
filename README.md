# SnapLocal

Extensão de captura de tela com anotação e borrão. Tudo local: sem conta, sem
nuvem, sem rastreamento, sem nenhuma requisição de rede.

**[Instalar no Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/bpenklkjkfmcmkbeggldokggnjpgfndn)** · **[Instalar no Chrome](https://chromewebstore.google.com/detail/lbiffdmehabmombfigmpmfgidngiphnh)** · [Site do projeto](https://peiterc.github.io/snaplocal/) · [Política de privacidade](https://peiterc.github.io/snaplocal/privacy.html)

Estado atual: publicada na **Microsoft Edge Add-ons** (desde 11/09/2026) e na
**Chrome Web Store** (desde 21/09/2026). Firefox AMO em revisão.

As quatro capturas — área selecionada, parte visível, página inteira e com
atraso — e o editor completo estão prontos: borrar, tarja, retângulo, elipse,
seta, linha, lápis, marca-texto, texto, recorte, undo/redo e exportação. A
interface vem em 11 idiomas.

O histórico de envios a cada loja está em
[docs/store-listing.md](docs/store-listing.md).

## Testar no Edge

1. Abra `edge://extensions`
2. Ligue **Modo de desenvolvedor** (canto inferior esquerdo)
3. **Carregar sem pacote** → selecione a pasta `src`
4. Fixe o ícone na barra e clique nele

No Chrome o caminho é o mesmo em `chrome://extensions`.

Depois de qualquer alteração no código, volte em `edge://extensions` e clique em
**Atualizar** no cartão da extensão. Mudanças no `manifest.json` ou no service
worker exigem esse recarregamento; mudanças em HTML/CSS de páginas bastam
reabrir a página.

### O que dá para verificar agora

| Verificação | Onde |
|---|---|
| Nome e descrição localizados vindos do `_locales` | cartão em `edge://extensions` |
| Popup traduzido | clique no ícone |
| Troca de idioma em tempo real | Configurações → Idioma |
| Tema claro/escuro | Configurações → Tema |
| Captura da parte visível | popup → *Parte visível* |
| Seleção de área com overlay, mira e leitura de dimensões | popup → *Selecionar área* |
| Captura direto ao soltar o mouse (padrão) | popup → *Selecionar área* |
| Barra de confirmação com Salvar/Cancelar | Configurações → *Depois de selecionar a área* |
| Captura com atraso + contagem no ícone | popup → *Captura com atraso* |
| Página inteira com rolagem e costura, progresso no ícone | popup → *Página inteira* |
| Ocultar cabeçalhos fixos na página inteira | Configurações → *Ocultar cabeçalhos flutuantes* |
| Borrar / pixelizar / tarja sobre o print | editor |
| Formas, texto, marca-texto e lápis | editor |
| Recortar, com desfazer devolvendo os pixels | editor, ferramenta de recorte |
| Selecionar, mover e redimensionar uma região | editor, ferramenta seta |
| Undo/redo (`Ctrl+Z` / `Ctrl+Y`), `Delete`, `Esc` | editor |
| Aviso de privacidade na primeira região borrada | editor |
| Copiar para a área de transferência e salvar em PNG | editor |
| Menu de contexto traduzido | botão direito em qualquer página |
| Atalhos `Alt+Shift+V` / `S` / `F` | `edge://extensions/shortcuts` |
| Erro em página restrita | tente capturar em `edge://extensions` |

## Estrutura

```
src/
  manifest.json          MV3, __MSG_* para nome/descrição, permissões mínimas
  _locales/<loc>/        11 idiomas; en é a referência com notas de tradução
  lib/i18n.js            carregador híbrido + troca manual de idioma
  lib/imaging.js         recorte e costura, sem depender de chrome.*
  lib/ui.css             tokens de tema e componentes compartilhados
  background/            service worker: captura, menus, atalhos
  content/overlay.js     overlay de seleção, em shadow root fechado
  popup/ options/        interface
  editor/                canvas, modelo de objetos, borrar/tarja, undo/redo
tools/
  check-locales.py       paridade de chaves, placeholders, limite do appDesc
  build-strings-preview.py   gera a folha de revisão EN × PT-BR
  make-icons.py          ícones PNG provisórios
  harness.html           roda o editor fora da extensão, para testes rápidos
  overlay-harness.html   roda o overlay de seleção sobre uma página hostil
  stitch-harness.html    asserções da costura de página inteira
  build.py               empacota para Edge, Chrome e Firefox
```

## Harness do editor

Sobe o editor real num servidor local, com `chrome.*` stubado e um print
sintético cheio de dados sensíveis. Serve para exercitar ferramentas, undo/redo
e exportação sem recarregar a extensão a cada alteração.

```bash
python -m http.server 8712
```

Depois abra `http://localhost:8712/tools/harness.html`. Ele carrega o
`editor.html`, o `editor.css` e o `editor.js` de verdade — não uma cópia — então
o que passa ali é o mesmo código que roda na extensão.

Fora do escopo dele: as APIs reais do navegador (área de transferência,
downloads, captura) e os menus de contexto. Isso só se testa no Edge.

## Empacotar

```bash
python tools/build.py
```

Gera `dist/edge/`, `dist/chrome/` e `dist/firefox/` mais um `.zip` de cada, a
partir de um código-fonte só. Roda a verificação dos dicionários antes e aborta
se ela falhar. Use `--no-zip` para só as pastas, ou passe um alvo
(`python tools/build.py firefox`).

Edge e Chrome saem idênticos ao `src`. O Firefox recebe três ajustes, todos
aplicados no build e nenhum no código-fonte:

| Ajuste | Por quê |
|---|---|
| Background vira *event page* | MV3 no Firefox não tem service worker |
| Shim `chrome = browser` | O namespace `chrome` do Firefox é baseado em callback; o projeto inteiro usa `await chrome.*` |
| `browser_specific_settings.gecko` | A AMO exige um id declarado, e ele é permanente |

### Verificação isolada dos dicionários

```bash
python tools/check-locales.py
```

Falha se algum locale tiver chave faltando ou sobrando, placeholder divergente,
BOM no arquivo ou `appDesc` acima de 132 caracteres.

## Pendências conhecidas

- alemão, russo, polonês, turco e indonésio precisam de revisão nativa,
  principalmente o diálogo de aviso do blur (`blur_warning_*`)
- o botão de doação fica para depois da 1.0; a string `about_donate` já existe no
  dicionário, mas o link está fora da interface enquanto não houver destino

O plano completo da próxima versão está em
[docs/roadmap-1.0.1.md](docs/roadmap-1.0.1.md).

## Licença

GPL-3.0. Veja [LICENSE](LICENSE).

Copyright (C) 2026 Peiterc

Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo sob os
termos da GNU General Public License, versão 3, publicada pela Free Software
Foundation. Ele é distribuído na esperança de ser útil, mas SEM NENHUMA GARANTIA.

A GPL foi escolhida de propósito: quem publicar uma versão derivada é obrigado a
abrir o código dela também. Num produto cujo argumento central é privacidade
auditável, isso impede que alguém pegue a SnapLocal, adicione rastreamento e
publique um clone fechado.

## Submissão às lojas

Textos prontos, justificativa das permissões, roteiro dos screenshots e onde
criar as contas: [docs/store-listing.md](docs/store-listing.md).

## Privacidade

A política está em [docs/privacy.html](docs/privacy.html), publicada via GitHub
Pages em `https://peiterc.github.io/snaplocal/privacy.html`. É exigência das três
lojas, e a URL já está referenciada na tela de Opções da extensão.
