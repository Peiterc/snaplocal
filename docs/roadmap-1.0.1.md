# Plano da 1.0.1

A 1.0.0 está publicada na Microsoft Edge Add-ons:
<https://microsoftedge.microsoft.com/addons/detail/bpenklkjkfmcmkbeggldokggnjpgfndn>

**Nada aqui toca a 1.0.0.** Tudo entra numa `1.0.1`, porque o número de versão só
pode subir nas lojas. Os itens vieram de uma revisão de código feita depois da
submissão, e cada um foi confirmado no fonte antes de entrar nesta lista.

Ordem sugerida: a **Fase 0** primeiro, porque não depende de código e há coisas
publicamente desatualizadas. Depois a **Fase 1**, que é o miolo da 1.0.1.

---

## Fase 0 — a publicação (sem código) ✅

A extensão está no ar e nada no projeto aponta para ela.

| # | O quê | Onde |
|---|---|---|
| 0.1 | Trocar o bloco "em análise" pelo link real da loja | `docs/index.html` |
| 0.2 | Atualizar o estado do projeto | `README.md` |
| 0.3 | Marcar a 1.0.0 como publicada no histórico de envios | `docs/store-listing.md` |
| 0.4 | Adicionar o link da loja ao repositório | descrição/About no GitHub |

**0.5 — Submeter à Chrome Web Store.** Estava esperando a resposta do Edge, que
chegou. O pacote `dist/snaplocal-chrome-1.0.0.zip`, os textos, os cinco
screenshots e as duas imagens promocionais já existem. Custo: US$ 5 e o
preenchimento do formulário.

> Decisão a tomar: submeter a `1.0.0` ao Chrome agora, ou esperar a `1.0.1` e
> mandar a versão corrigida? Mandar agora começa o período de confiança da conta
> mais cedo, que é lento para publisher novo. Nenhum bug da Fase 1 é grave o
> bastante para justificar segurar.

---

## Fase 1 — bugs que o usuário sente ✅

Feita. Quatro itens, mais uma consequência que apareceu ao implementar: como a
captura com atraso passou a rodar destacada do popup, o `!` no ícone precisou
aprender a **dizer o motivo** — senão o erro novo seria tão mudo quanto o bug
que ele corrige. `reportFailure` agora põe a mensagem no tooltip do ícone, o
que melhora também a página inteira e a área.

Falta verificar no Edge: 1.1, 1.2 e 1.4 dependem de APIs reais. O 1.3 foi
verificado no harness — a classe acompanha o zoom em 33%, 100%, 195% e 51%.

### 1.1 ✅ — "Perguntar onde salvar" não existe na interface

`askSaveLocation` é lido em dois lugares e nunca pode ser ligado:

```
background/service-worker.js:216   salvar direto do overlay
editor/editor.js:793               salvar pelo editor
```

Não há controle em `options.html`. A string `opt_ask_location` está traduzida
nos 11 idiomas e nunca aparece na tela. Resultado: a opção é sempre `false`.

**Correção:** um checkbox na seção Captura, espelhando o de `hideFixed`, mais
leitura e gravação em `options.js`. É o mesmo padrão já usado ali.

### 1.2 ✅ — Captura com atraso trava o popup e quebra se a aba mudar

Dois defeitos no mesmo fluxo.

`run()` faz `await captureDelayed()`, então o popup fica congelado por até 10
segundos antes de fechar. A captura de página inteira já foi desacoplada com
fire-and-forget; o atraso ficou para trás.

E `captureDelayed()` valida a aba **no início** e chama `captureVisible()` no
**fim**, que consulta a aba ativa de novo. Trocar de aba durante a contagem
captura a aba errada, ou falha com `err_capture_failed` genérico — porque a nova
aba não tem `activeTab` concedido.

**Correção:** falhar rápido em `run()`, disparar sem `await` como a página
inteira faz, guardar o `tab.id` antes da contagem e comparar no fim. Se mudou,
abortar com mensagem específica.

> Requer **uma chave nova** (`err_tab_changed`) nos 11 idiomas. É a única string
> nova prevista nesta versão.

### 1.3 ✅ — O editor mostra o print pior do que ele é

`#board` tem `image-rendering: pixelated` sem condição
(`editor/editor.css:166`). A regra existe para o zoom acima de 100%, mas o
editor **abre em "ajustar à janela"**, tipicamente entre 70% e 95%. Nesse regime
`pixelated` faz vizinho-mais-próximo na redução: o texto serrilha.

O usuário abre a ferramenta e vê a captura degradada logo no primeiro contato.

**Correção:** alternar uma classe em `applyZoom()` conforme `state.zoom >= 1`, e
mover a regra para essa classe.

### 1.4 ✅ — Falha na captura de área é silenciosa

Em `service-worker.js`, o `.catch` de `handleAreaSelected` só limpa o badge. Se
`captureVisibleTab` estourar a quota ou o recorte falhar, o overlay some e **não
acontece nada** — sem badge, sem mensagem, sem aba.

A página inteira já tem `reportFailure()` para exatamente isso.

**Correção:** usar `reportFailure` no mesmo `catch`.

---

## Fase 2 — robustez

Nada aqui é visível no uso normal, mas cada um é uma falha esperando condição.

### 2.1 — Histórico de undo sem teto

Cada entrada de `pushHistory()` é o JSON de **todas** as formas, e um traço de
lápis guarda centenas de pontos. Sessão longa cresce sem limite.

**Correção:** teto de ~100 entradas, descartando as mais antigas e ajustando o
`historyIndex`.

### 2.2 — Seta e linha invertem ao redimensionar

As frações `a`/`b` só são recalculadas no `pointermove` de desenho
(`editor.js:578`). Arrastar uma alça para além da borda oposta normaliza a
caixa mas não a direção: a ponta da seta troca de lado.

**Correção:** detectar a inversão no resize e trocar as frações junto.

### 2.3 — Manifesto sem versão mínima

O código usa `storage.session` (Chrome 102+), `crypto.randomUUID` (92+) e
`OffscreenCanvas` no service worker. Num Chromium antigo a extensão instala e
quebra em silêncio.

**Correção:** `"minimum_chrome_version": "102"`. Aproveitar e adicionar
`homepage_url`, que agora existe.

### 2.4 — Firefox nunca foi carregado num Firefox

`background.type: "module"` é o maior risco do pacote AMO e segue não
verificado. O `strict_min_version` está em `128.0` por estimativa, não por
teste.

**Correção:** carregar `dist/snaplocal-firefox-1.0.1.zip` via `about:debugging`,
exercitar os quatro modos de captura e o editor, e ajustar a versão mínima
conforme o resultado. **Bloqueia a submissão à AMO**, nada mais.

---

## Fase 3 — higiene

Não muda nada para o usuário. Faz diferença para quem mantém.

### 3.1 — Chaves de i18n sem uso

39 das 143 não são referenciadas em `src/`. Mas a maioria **não é lixo**: são
recursos planejados (`export_format_*`, `opt_reset*`, `prop_opacity`) ou passam
a ser usadas pelas próprias correções acima — `opt_ask_location` pelo item 1.1 e
`about_rate` pelo item 0.1, que finalmente tem para onde apontar.

**Correção:** acrescentar um aviso de "chave sem uso" ao `check-locales.py` —
**aviso, não falha**, porque planejar strings antes de implementar foi
deliberado e funcionou. Decidir a remoção caso a caso, depois das Fases 0 a 2,
quando a lista já tiver encolhido sozinha.

### 3.2 — Swatches de cor sem nome acessível

Os oito botões de cor do editor não têm `aria-label`. Um leitor de tela anuncia
"botão" oito vezes seguidas.

### 3.3 — `captureName()` e `filename()` duplicados

Mesma lógica de nome de arquivo no service worker e no editor. Cabe em
`lib/imaging.js` ou num `lib/naming.js`.

### 3.4 — Miudezas

- `import re` sem uso em `tools/build.py`
- `document.title = t("appName")` com aspas duplas em `popup.js` e `options.js`,
  único lugar do projeto — resíduo do `printf` que inseriu a linha

---

## Como trabalhar

Branch `1.0.1` a partir de `main`, um commit por item, com o número na mensagem.

**Onde testar cada coisa**

| Item | Onde |
|---|---|
| 1.1, 2.3, 3.x | Edge, carregando `src/` sem pacote |
| 1.2, 1.4, 2.4 | Edge — envolvem service worker e APIs reais |
| 1.3, 2.1, 2.2 | `tools/harness.html`, que roda o editor fora da extensão |

**Antes de submeter**

```bash
python tools/check-locales.py
python tools/build.py
```

Os screenshots não precisam ser refeitos: nenhuma correção muda a aparência do
que eles mostram.

> **A versão sobe no primeiro commit de código, não na submissão.** O plano
> original mandava subir por último; isso estava errado. Enquanto o manifesto
> diz `1.0.0`, o build local e o pacote publicado têm o mesmo número e código
> diferente, e não há como distinguir os dois ao carregar sem pacote. O número
> da versão existe justamente para isso.

---

## O que ficou de fora de propósito

**Botão de doação.** Continua sendo pós-1.0 e não é correção. Quando entrar:
Pix com chave e QR embutidos mais Ko-fi ou GitHub Sponsors, link discreto nas
Opções, **nunca** abrindo sozinho na instalação — isso é motivo de remoção da
loja.

**Revisão nativa de alemão, russo, polonês, turco e indonésio.** As traduções
estão corretas mas mereceriam olhos nativos, sobretudo no diálogo de aviso do
blur. Agora que o repositório é público, o `CONTRIBUTING.md` já convida para
isso — é trabalho de comunidade, não de versão.
