# Contribuindo com a SnapLocal

Obrigado pelo interesse. O jeito mais útil de ajudar hoje é **traduzir**.

## Adicionar um idioma

Toda a interface vem de um único arquivo por idioma. Não é preciso saber
programar nem rodar a extensão.

1. Copie [`src/_locales/en/messages.json`](src/_locales/en/messages.json) para
   `src/_locales/<codigo>/messages.json`.
   Códigos aceitos hoje: `es`, `ru`, `de`, `fr`, `it`, `id`, `tr`, `pl`, `pt`.
   Para outro idioma, abra uma issue antes — o código precisa ser adicionado à
   lista `SUPPORTED` em `src/lib/i18n.js`.

2. Traduza apenas o valor de cada `"message"`.

3. Apague todos os campos `"description"` da sua cópia. Eles existem só no `en`,
   que é a referência, e são instruções para você — não texto de interface.

4. Traduza `locale_name` para o nome do idioma **escrito nesse idioma**
   (`Deutsch`, `Русский`, `Türkçe`). É o que aparece no seletor de idiomas.

### O que nunca se traduz

| Item | Motivo |
|---|---|
| `SnapLocal` em `appName`, `appShortName`, `ctx_parent` | É o nome da marca, idêntico em todo lugar |
| `Esc` em `overlay_hint_cancel` | É o nome físico da tecla |
| `PNG`, `JPEG` | Nomes de formato |
| `{date}` `{time}` `{title}` `{domain}` `{counter}` | São código, copie exatamente |
| `$WIDTH$` `$COUNT$` `$FILENAME$` e o bloco `placeholders` | O texto quebra sem eles |

### Cuidados que fazem diferença

- **`appDesc` tem limite rígido de 132 caracteres.** É a descrição que aparece
  nas lojas e o envio é rejeitado se estourar.
- **Termos que precisam bater entre si:** `tool_redact` aparece de novo em
  `blur_warning_switch`, e `tool_blur` em `blur_warning_keep`. Use a mesma
  palavra nos dois lugares.
- **Alemão e russo costumam ficar ~30% mais longos** que o inglês. Textos de
  botão e da mini-barra flutuante precisam ficar curtos ou a interface quebra.
- **O aviso do blur é uma mensagem de segurança real**, não marketing. Traduza
  de forma direta e sem suavizar.

### Antes de abrir o PR

```bash
python tools/check-locales.py
```

Ele falha se faltar ou sobrar chave, se um placeholder divergir do inglês, se o
arquivo tiver BOM ou se `appDesc` passar de 132 caracteres. É a mesma verificação
que roda no build.

## Reportar um problema

[Abra uma issue](https://github.com/Peiterc/snaplocal/issues) dizendo navegador,
versão e o que aconteceu. Se for um problema visual na captura, o print ajuda
muito — e dá para tirá-lo com a própria SnapLocal.

## Mexer no código

Leia o [README](README.md): ele explica a estrutura, como carregar sem pacote e
os harnesses em `tools/` que rodam o editor e o overlay fora da extensão.

Duas regras que valem para qualquer alteração:

- **Nenhum texto fixo na interface.** Toda string passa por `t('chave')` e por
  `_locales`. É o que mantém os idiomas em dia.
- **Nenhuma requisição de rede.** Nada de CDN, analytics ou fonte remota. É a
  promessa central do produto e está na política de privacidade.
