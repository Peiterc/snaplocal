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

## 3. Decisão tomada: .NET + WebView2

Decidido em 25/09/2026.

| | Electron | Tauri | **.NET + WebView2** |
|---|---|---|---|
| Motor web | Chromium embarcado (~100 MB) | WebView2 do sistema | WebView2 do sistema |
| Linguagem da casca | JavaScript | Rust | C# |
| Empacotamento MSIX | `electron-builder`, alvo `appx` | conversão extra | nativo no Visual Studio |
| Captura de tela | API própria | biblioteca de terceiros | API do Windows |
| Reuso do editor | total | total | total |

O motor de renderização **não vai dentro do pacote**: a documentação da
Microsoft diz que o WebView2 já vem incluído no Windows 11, e que a grande
maioria das máquinas com Windows 10 também já o tem. Embarcar um Chromium
inteiro numa máquina que já tem o mesmo motor contradiz, na tela do tamanho do
download, tudo o que o produto promete ser.

A recomendação oficial da Microsoft para um app novo é WinUI 3 com o Windows
App SDK. Ela foi descartada de propósito: parte do zero, e aqui há 1.400 linhas
de editor prontas e traduzidas. WebView2 é o meio-termo da própria Microsoft
para hospedar HTML dentro de uma casca nativa.

**O que a casca em C# precisa ter**, e é só isso: janela hospedando o WebView2,
atalho global (`RegisterHotKey`), ícone na bandeja (`NotifyIcon`), captura de
tela (`Windows.Graphics.Capture`) e salvar arquivo. O editor, que é a parte
grande, continua sendo o HTML que já existe.

**Tauri continua sendo o plano B**, e o critério é um só: se um dia o app
precisar rodar em macOS ou Linux. A casca é pequena em qualquer um dos três, e
o HTML vai inteiro nos três.

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

O caminho é detectar e pedir: `RegisterHotKey` falha quando não consegue a
tecla, e aí o app explica que o Windows está usando o Print Screen para a
Ferramenta de Captura e abre a tela de configurações certa. A
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

### Fase 0 — Conta e nome — **concluída em 25/09/2026**

- [x] Conta de desenvolvedor Microsoft (Apps & Games), publisher `Peiterc`
- [x] Nome **"SnapLocal" reservado** no Partner Center. A reserva vale **três
      meses**: sem submissão até por volta de **25/12/2026**, ela cai.
- [x] Tecnologia: **.NET + WebView2** (seção 3)
- [x] **Um repositório só**, com o app em `app/`

**Por que um repositório só:** o editor é compartilhado de verdade. Em dois
repositórios, a primeira correção urgente vira cópia colada, e em poucos meses
são duas versões divergentes — com 11 idiomas para manter iguais em cada uma.

**A regra que protege o que já está publicado:** `src/` não muda de forma para
acomodar o app. Ela é o que a Mozilla revisa e o que o `build.py` empacota.
Quem se adapta é o projeto novo: o build do app **copia** o editor, as
bibliotecas e os `_locales` para dentro de `app/`.

```
src/          extensão — intocada
app/          casca em C#, o projeto .NET
tools/        build.py, check-locales.py e o script que leva o editor ao app
docs/         planos, material de loja, site
```

Duas consequências registradas aqui para não serem esquecidas:

- **Tags separadas por produto**: `ext-1.0.4` e `app-1.0.0`. Sem isso ninguém
  sabe a que "1.0.4" um commit se refere.
- **Uma frase do `BUILD.md` fica falsa** quando `app/` existir: ela diz ao
  revisor da Mozilla que "o repositório publicado é a mesma árvore que este
  pacote de código-fonte". Corrigir no mesmo commit que criar a pasta.

**Ferramentas nesta máquina**, conferido em 25/09/2026:

| Item | Situação |
|---|---|
| Runtime do WebView2 | **instalado**, 153.0.4234.48, por máquina |
| Runtime do .NET | instalado, 8.0.23, com `Microsoft.WindowsDesktop.App` |
| **SDK do .NET** | **ausente** — é o que falta para compilar |
| Empacotar MSIX | pelo Visual Studio, ou por `MakeAppx.exe` do Windows SDK |

Instalar o SDK do .NET é o único pré-requisito da Fase 1. O Visual Studio
completo não é obrigatório para compilar, só facilita o empacotamento MSIX
depois; dá para fazer as duas coisas pela linha de comando.

### Fase 1 — Protótipo do reuso — **funcionando em 25/09/2026**

1. `Alt+Shift+S` captura a tela onde está o ponteiro
2. Abre o editor que já existe, com a imagem dentro
3. Salvar grava o PNG em `Imagens\SnapLocal`

**O reuso se confirmou.** O `editor.js`, o `editor.css`, as três bibliotecas e
os 11 dicionários foram para o app **sem uma linha alterada**. O que fez a
ponte foram 82 linhas de JavaScript (`app/Assets/bridge.js`) que devolvem um
`chrome.*` suficiente: `storage.local`, `storage.session`, `runtime.getURL`,
`i18n.getUILanguage` e `downloads.download`.

O app em si:

| Arquivo | O que faz |
|---|---|
| `Program.cs` | entrada e os modos de conferência |
| `TrayContext.cs` | ícone na bandeja e o ciclo de vida |
| `HotkeyWindow.cs` | atalho global, via `RegisterHotKey` |
| `ScreenCapture.cs` | captura a tela do ponteiro |
| `EditorWindow.cs` | hospeda o WebView2 e responde à ponte |
| `Settings.cs` | o equivalente ao `chrome.storage.local`, em JSON |

**Dois modos de conferência sem interface**, porque a Fase 1 precisava ser
verificável sem alguém no teclado:

```
SnapLocal.exe --selftest      <saida.png>   captura a tela e grava
SnapLocal.exe --selftest-save <entrada.png> abre o editor, clica em Salvar e sai
```

O segundo confirmou a ponte inteira: o arquivo saiu como
`snaplocal-2026-09-25-17-01-02.png`, com o nome vindo do mesmo
`src/lib/naming.js` que nomeia os arquivos da extensão.

**Falta testar com mãos humanas:** desenhar, borrar, copiar para a área de
transferência e o atalho global. São coisas que exigem mouse e teclado de
verdade.

### Fase 2 — Camada de plataforma

O editor deixa de falar `chrome.*` diretamente. Passa a chamar um módulo
pequeno com quatro funções — ler configuração, gravar configuração, receber a
captura, salvar arquivo — com duas implementações: extensão e desktop.

**Regra:** a extensão publicada não pode mudar de comportamento. A refatoração
entra em uma versão própria, testada no Edge, no Chrome e no Firefox antes de
qualquer coisa do app.

### Fase 3 — Captura de verdade — **em andamento**

- [x] Overlay de seleção sobre a tela congelada, nos moldes do que a extensão
      faz. Congelar antes de mostrar é o ponto: nada se mexe embaixo do mouse
      enquanto a pessoa escolhe.
- [ ] **Múltiplos monitores** — hoje o overlay cobre só a tela onde está o
      ponteiro, então não dá para selecionar uma área que cruze dois monitores
- [ ] **Escalas de DPI diferentes** — a fonte de bug mais provável do projeto
      inteiro, e que exige hardware real para testar
- [ ] Captura com atraso

Conferência sem interface: `SnapLocal.exe --selftest-area` abre só a seleção e
fecha sozinha em 6 segundos, o que permite fotografá-la de outro processo.

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

**Testar DPI e múltiplos monitores.** Esta máquina é um servidor virtual, onde
não dá para simular dois monitores com escalas diferentes. Esse teste vai
precisar de hardware real, e é melhor descobrir isso agora do que na Fase 5.

**DPI e múltiplos monitores.** É o clássico desse tipo de app: a seleção sai
deslocada ou a imagem sai borrada quando os monitores têm escalas diferentes.
Mitigação: tratar isso já na Fase 3, com um monitor secundário em escala
diferente como caso de teste obrigatório.

**WebView2 ausente em alguns Windows 10.** Raro, mas existe. Mitigação: o MSIX
declara o runtime como dependência, e o app verifica a presença antes de criar
a janela, em vez de abrir uma tela branca sem explicação.

**Quatro superfícies para manter.** Cada correção no editor passa a valer para
Edge, Chrome, Firefox e Windows, cada um com sua fila de revisão. Mitigação: a
camada da Fase 2 faz a correção ser única; o que se multiplica é a publicação,
não o trabalho.

**Certificação da Store.** Um app que fica na bandeja e registra atalho global
recebe olhar mais atento. Mitigação: nenhuma permissão além do necessário e
descrição honesta do que o app faz, que é o que já funcionou nas três lojas.

---

## 8. Decisões que dependem de você

1. Reservar ou não o nome "SnapLocal" já nesta semana (recomendo reservar)
2. Se o app entra **neste repositório**, numa pasta `app/`, ou em um repositório
   separado. Recomendo o mesmo repositório: o editor é compartilhado, e código
   compartilhado em dois repositórios separados vira duas cópias em três meses.
