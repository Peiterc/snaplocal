# SnapLocal para Windows — plano de ação

App de desktop publicado na Microsoft Store, reaproveitando o editor que já
existe. Este documento é o plano; nada aqui foi executado ainda.

---

## 1. Por que fazer, e o que isso muda

A extensão só enxerga abas de navegador. Um app captura **qualquer coisa na
tela**: o Explorer, o Outlook, um PDF, uma janela de erro, um menu do Windows.
Ganha também atalho global, que funciona com o navegador fechado, e ícone na
bandeja. Era isso que o Lightshot fazia e é a parte que a extensão, por
construção, nunca vai cobrir.

O que **não** muda: a promessa de privacidade. Nada de conta, nada de nuvem,
nada de rede. O app é a mesma ideia num lugar onde ela vale ainda mais, porque
passa a haver captura de conteúdo que nem sequer está num navegador.

O que o app **não** vai disputar: a captura em si. O Windows 11 já tem a
Ferramenta de Captura no `Win+Shift+S`. O diferencial continua sendo o editor
com borrão e tarja, e o aviso de que borrão não é seguro.

---

## 2. O tamanho real do reuso

Medido, não estimado:

| Arquivo | Linhas | Chamadas `chrome.*` |
|---|---|---|
| `src/editor/editor.js` | 944 | **8** |
| `src/editor/editor.css` | 210 | 0 |
| `src/lib/imaging.js` | 87 | 0 |
| `src/lib/naming.js` | 16 | 0 |
| `src/lib/i18n.js` | 113 | 3 |

São 11 chamadas ao navegador em ~1.400 linhas reaproveitáveis, e todas do mesmo
tipo: ler e gravar configuração, entregar a imagem ao editor, salvar arquivo.

O que **não** se reaproveita é a camada de captura: `captureVisibleTab`, o
overlay injetado na página e a rolagem da página inteira. Isso vira captura de
tela do sistema operacional, e é código novo.

---

## 3. Decisão pendente: Electron ou Tauri

| | Electron | Tauri |
|---|---|---|
| Download | ~100 MB | ~10 MB |
| Reuso do editor | direto | direto |
| Captura de tela | API própria (`desktopCapturer`) | biblioteca Rust (`xcap`) |
| Atalho global e bandeja | API própria | plugins oficiais |
| Linguagem a mais | nenhuma | Rust |
| Empacotamento MSIX | `electron-builder`, alvo `appx` | `tauri build`, alvo `msi`/`nsis` + conversão |

**Recomendação: começar por Electron.** O motivo não é gosto, é risco: no
Electron a captura, o atalho global e a bandeja são API de primeira parte e
documentada, então a Fase 1 vira um teste honesto do reuso em vez de uma
pesquisa sobre bibliotecas de terceiros. Se o tamanho do download incomodar
depois, a migração para Tauri mexe só na casca — a parte em HTML e JavaScript,
que é a maior, vai inteira.

**Decisão sua, e é a única que trava o começo.**

---

## 4. Escopo da 1.0 do app

**Entra:**

- Captura de **área selecionada**, com overlay sobre a tela congelada
- Captura de **tela inteira**, por monitor
- Captura **com atraso**
- O **editor completo** que já existe: borrão, tarja, formas, seta, lápis,
  marca-texto, texto, recorte não destrutivo, undo/redo
- **Copiar** e **salvar como PNG**
- **Atalho global** configurável
- **Bandeja** com as ações e as Opções
- Os **11 idiomas** já traduzidos

**Fica fora, de propósito:**

- **Página inteira com rolagem.** Fora do navegador não existe "página": não há
  como rolar o conteúdo de um app alheio de forma confiável. Na extensão isso
  continua existindo.
- Captura de vídeo, GIF, OCR, histórico de capturas, upload. Nada disso combina
  com a promessa do produto ou com o tamanho desta primeira versão.
- **Captura de janela específica**: fica para depois da 1.0, porque dá para
  chegar perto recortando a tela inteira.

### A tecla Print Screen

O app **pode** assumir o `Print Screen`, e era isso que o Lightshot fazia. Só
que desde a build 22621.1928 o Windows 11 dá essa tecla à Ferramenta de Captura
por padrão, num ajuste por usuário guardado em
`HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled`.

**Não mexer nesse registro pelo app.** Num pacote MSIX as escritas de registro
são virtualizadas dentro do pacote, então provavelmente nem teriam efeito, e
mudar configuração do sistema sem o usuário pedir é o tipo de coisa que atrai
olhar na certificação da Store.

O caminho é detectar e pedir: `globalShortcut.register` devolve `false` quando
não consegue a tecla, e aí o app explica que o Windows está usando o Print
Screen para a Ferramenta de Captura e abre a tela de configurações certa. A
mesma mensagem serve para o outro caso de disputa: outro app de captura
instalado (ShareX, Greenshot) que tenha registrado a tecla antes.

Decisões que vêm junto:

- O padrão na instalação **não** é o Print Screen, e sim `Alt+Shift+S`. Hoje a
  tecla copia a tela inteira para a área de transferência em silêncio, e tomar
  isso de alguém sem avisar é hostil.
- "Usar a tecla Print Screen" vira uma opção nas Configurações, desligada por
  padrão, com a explicação acima ao lado.

---

## 5. Fases

Cada fase termina com algo que roda e que você consegue testar. Nenhuma fase
mexe no que já está publicado sem que isso esteja dito.

### Fase 0 — Conta e nome

- Conta de desenvolvedor Microsoft (Apps & Games) verificada, publisher
  `Peiterc`
- **Reservar o nome "SnapLocal"** no Partner Center. É grátis, leva um minuto e
  impede que alguém registre o nome antes. Deve ser feito **agora**, mesmo que
  o código não comece hoje.
- Decidir Electron ou Tauri (seção 3)

### Fase 1 — Protótipo do reuso

Uma janela, um atalho, nada bonito:

1. `Alt+Shift+S` captura a tela inteira
2. Abre o editor que já existe, com a imagem dentro
3. Salvar gera um PNG no disco

**Critério de pronto:** desenhar, borrar e salvar funcionam, usando o
`editor.js` atual com o mínimo de mudança. Se isso custar muito mais do que as
11 chamadas medidas sugerem, o plano volta para a mesa antes de continuar.

### Fase 2 — Camada de plataforma

O editor deixa de falar `chrome.*` diretamente. Passa a chamar um módulo
pequeno com quatro funções — ler configuração, gravar configuração, receber a
captura, salvar arquivo — com duas implementações: extensão e desktop.

**Regra:** a extensão publicada não pode mudar de comportamento. A refatoração
entra em uma versão própria, testada no Edge, no Chrome e no Firefox antes de
qualquer coisa do app.

### Fase 3 — Captura de verdade

- Overlay de seleção sobre a tela congelada, nos moldes do que a extensão faz
- **Múltiplos monitores** e **escalas de DPI diferentes** — a fonte de bug mais
  provável do projeto inteiro
- Captura com atraso

### Fase 4 — App de verdade

- Bandeja, atalhos configuráveis, iniciar com o Windows (desligado por padrão)
- Tela de Opções reaproveitando os 11 idiomas
- Onde ficam as configurações fora do navegador

### Fase 5 — Empacotamento

- MSIX, ícones em todos os tamanhos que a Store pede, teste de instalação limpa
  numa máquina sem nada instalado
- Atualização automática: **não escrever nada**. Quem atualiza é a Store.

### Fase 6 — Submissão

Ficha da loja, classificação etária, capturas, política de privacidade.

---

## 6. O que a Microsoft Store exige

| Item | Situação |
|---|---|
| Conta de desenvolvedor | **Sem taxa** desde o fluxo novo; exige documento com foto e selfie |
| Caminho de cadastro | Tem que começar em `storedeveloper.microsoft.com`; entrar pelo Partner Center cai no fluxo antigo |
| Formato do pacote | MSIX (a Store assina, então não é preciso comprar certificado) ou instalador `.exe`/`.msi` |
| Política de privacidade | Já existe e está no ar |
| Classificação etária | Questionário IARC, automático |
| Capturas de tela | Novas, no formato da Store — as da extensão não servem |
| Descrição | A descrição em inglês serve de base, mas precisa falar de app, não de extensão |
| Licença GPL-3.0 | Sem impedimento; o código continua público |

---

## 7. Riscos

**DPI e múltiplos monitores.** É o clássico desse tipo de app: a seleção sai
deslocada ou a imagem sai borrada quando os monitores têm escalas diferentes.
Mitigação: tratar isso já na Fase 3, com um monitor secundário em escala
diferente como caso de teste obrigatório.

**Tamanho do download no Electron.** ~100 MB num app que se vende como leve.
Mitigação: medir na Fase 5 e decidir com número na mão, sabendo que a migração
para Tauri preserva a maior parte do código.

**Quatro superfícies para manter.** Cada correção no editor passa a valer para
Edge, Chrome, Firefox e Windows, cada um com sua fila de revisão. Mitigação: a
camada da Fase 2 faz a correção ser única; o que se multiplica é a publicação,
não o trabalho.

**Certificação da Store.** Um app que fica na bandeja e registra atalho global
recebe olhar mais atento. Mitigação: nenhuma permissão além do necessário e
descrição honesta do que o app faz, que é o que já funcionou nas três lojas.

---

## 8. Decisões que dependem de você

1. **Electron ou Tauri** (recomendo Electron para a Fase 1)
2. Reservar ou não o nome "SnapLocal" já nesta semana (recomendo reservar)
3. Se o app entra **neste repositório**, numa pasta `app/`, ou em um repositório
   separado. Recomendo o mesmo repositório: o editor é compartilhado, e código
   compartilhado em dois repositórios separados vira duas cópias em três meses.
