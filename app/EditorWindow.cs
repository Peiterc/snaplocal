using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace SnapLocal;

/// <summary>
/// A janela do editor: um WebView2 mostrando exatamente a mesma página que a
/// extensão usa. Esta classe é a casca — responde ao que a página pede através
/// do contrato descrito em src/lib/platform.js.
/// </summary>
sealed class EditorWindow : WebHostWindow
{
    protected override string Page => "editor/editor.html";

    // A janela nasce sem imagem e **já carrega a página**: o processo de
    // renderização do WebView2 leva cerca de dois segundos para existir, e
    // esses dois segundos são os mesmos em que a pessoa está arrastando a
    // seleção. Quando a captura chega, a página já está de pé esperando por
    // ela.
    private readonly TaskCompletionSource captureReady = new();

    private readonly JsonObject session = new();
    protected override JsonObject Session => session;

    // Conferência automática: clica em Salvar assim que a página carrega e
    // fecha. Existe para a ponte com o C# poder ser testada sem alguém no
    // mouse — é o caminho novo do projeto, e o que mais merece teste.
    private readonly bool saveAndExit;

    // Desenha um borrão e uma tarja sozinho, para a imagem da loja mostrar o
    // editor fazendo o que o produto promete — em vez de um editor vazio.
    // Pelo construtor, e não como propriedade: o WinForms exige metadado de
    // designer em propriedade pública de Form.
    private readonly bool demoAnnotations;

    private EditorWindow(bool saveAndExit, bool demoAnnotations = false)
    {
        this.saveAndExit = saveAndExit;
        this.demoAnnotations = demoAnnotations;

        Text = "SnapLocal";
        Width = 1280;
        Height = 820;
    }

    /// <summary>
    /// Começa a subir o WebView2 sem ter imagem ainda. Chamada quando a
    /// captura começa: o navegador embutido leva segundos para existir, e
    /// esses segundos são os mesmos em que a pessoa está arrastando a seleção.
    ///
    /// A janela nasce fora da tela em vez de escondida porque o WebView2 só
    /// inicializa com a janela criada de verdade.
    /// </summary>
    public static EditorWindow StartWarm(bool saveAndExit = false, bool demoAnnotations = false)
    {
        var editor = new EditorWindow(saveAndExit, demoAnnotations)
        {
            StartPosition = FormStartPosition.Manual,
            Location = new Point(-32000, -32000),
            ShowInTaskbar = false
        };
        editor.Show();
        return editor;
    }

    /// <summary>Entrega a captura e traz a janela para a frente.</summary>
    public async Task OpenAsync(string captureDataUrl)
    {
        // O editor lê a captura da sessão, como na extensão.
        session["lastCapture"] = new JsonObject
        {
            ["dataUrl"] = captureDataUrl,
            ["title"] = "",
            ["url"] = "",
            ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
        captureReady.TrySetResult();

        await Warm;

        ShowInTaskbar = true;
        Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
        Location = new Point(
            area.X + (area.Width - Width) / 2,
            area.Y + (area.Height - Height) / 2);
        Show();
        Activate();
    }

    /// <summary>
    /// Entrega a captura e espera a imagem aparecer no canvas. Só existe para
    /// os modos de conferência: é a medida que interessa ao usuário, o tempo
    /// entre soltar o mouse e ver o editor pronto.
    /// </summary>
    public async Task<long> DeliverAndWaitAsync(string captureDataUrl)
    {
        var clock = Stopwatch.StartNew();
        await OpenAsync(captureDataUrl);

        while (clock.ElapsedMilliseconds < 15000)
        {
            // O canvas nasce com 300x150 por padrão, então "existe" não serve
            // de sinal: o editor só o redimensiona quando a captura carrega.
            string pronto = await View.CoreWebView2.ExecuteScriptAsync(
                "(() => { const b = document.getElementById('board'); return !!b && b.width > 600; })()");
            if (pronto == "true") break;
            await Task.Delay(25);
        }
        return clock.ElapsedMilliseconds;
    }

    /// <summary>
    /// A leitura da captura é a única resposta que pode ficar pendurada: o
    /// editor pergunta por ela durante a carga, e a resposta só existe quando
    /// a pessoa termina de escolher a área. Segurar a promessa é o que permite
    /// a página inteira carregar antes disso.
    /// </summary>
    protected override async Task<JsonNode?> HandleAsync(string type, JsonObject payload)
    {
        bool querCaptura = type == "storage.get"
            && payload["area"]?.GetValue<string>() == "session"
            && (payload["keys"]?.AsArray().Any(k => k?.GetValue<string>() == "lastCapture") ?? false);

        if (querCaptura) await captureReady.Task;
        return HandleCommon(type, payload);
    }

    protected override Task ReadyAsync(CoreWebView2 core)
    {
        if (saveAndExit)
            core.NavigationCompleted += async (_, _) => await ClickSaveAndExitAsync(core);
        if (demoAnnotations)
            core.NavigationCompleted += async (_, _) => await AnnotateAsync(core);
        return Task.CompletedTask;
    }

    private const string DemoScript = @"
      (() => {
        const board = document.getElementById('board');
        const r = board.getBoundingClientRect();
        const at = (fx, fy) => ({ x: r.left + r.width * fx, y: r.top + r.height * fy });

        // Eventos sintéticos não têm ponteiro ativo, e setPointerCapture
        // lançaria NotFoundError no meio do traço.
        HTMLElement.prototype.setPointerCapture = function () {};

        const drag = (a, b) => {
          const base = p => ({ bubbles: true, cancelable: true, pointerId: 1,
                               pointerType: 'mouse', isPrimary: true,
                               clientX: p.x, clientY: p.y, buttons: 1 });
          board.dispatchEvent(new PointerEvent('pointerdown', base(a)));
          board.dispatchEvent(new PointerEvent('pointermove', base(b)));
          board.dispatchEvent(new PointerEvent('pointerup', { ...base(b), buttons: 0 }));
        };

        const diag = { board: [board.width, board.height],
                       rect: [Math.round(r.left), Math.round(r.top),
                              Math.round(r.width), Math.round(r.height)] };

        document.querySelector('[data-tool=""blur""]').click();
        drag(at(0.15, 0.07), at(0.44, 0.21));    // o CPF

        document.querySelector('[data-tool=""redact""]').click();
        drag(at(0.15, 0.54), at(0.62, 0.68));    // o token de acesso

        // Sem isto a última forma fica selecionada, com alças à mostra.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.querySelector('[data-tool=""move""]').click();
        return JSON.stringify(diag);
      })()";

    private async Task AnnotateAsync(CoreWebView2 core)
    {
        for (int attempt = 0; attempt < 60; attempt++)
        {
            if (await core.ExecuteScriptAsync(
                    // 300x150 é o tamanho padrão de um canvas vazio: esperar
                    // "maior que zero" aceitaria a tela antes da captura chegar.
                    "(() => { const b = document.getElementById('board'); " +
                    "return !!b && (b.width !== 300 || b.height !== 150); })()") == "true")
                break;
            await Task.Delay(100);
        }
        Log.Write("demo de anotacoes: " + await core.ExecuteScriptAsync(DemoScript));
    }

    private async Task ClickSaveAndExitAsync(CoreWebView2 core)
    {
        // O editor monta a interface depois de carregar a captura, então não
        // basta a navegação ter terminado: o botão pode ainda não existir.
        for (int attempt = 0; attempt < 40; attempt++)
        {
            if (await core.ExecuteScriptAsync("!!document.getElementById('save')") == "true") break;
            await Task.Delay(100);
        }
        Log.Write("perf navegacao: " + await core.ExecuteScriptAsync(
            "(() => { const n = performance.getEntriesByType('navigation')[0]; return JSON.stringify({" +
            "resposta: Math.round(n.responseEnd), domInterativo: Math.round(n.domInteractive)," +
            "domPronto: Math.round(n.domContentLoadedEventEnd), carga: Math.round(n.loadEventEnd) }); })()"));
        Log.Write("perf recursos: " + await core.ExecuteScriptAsync(
            "JSON.stringify(performance.getEntriesByType('resource')" +
            ".map(r => [r.name.split('/').pop().slice(0,18), Math.round(r.startTime), Math.round(r.duration)])" +
            ".sort((a, b) => b[2] - a[2]).slice(0, 6))"));
        Log.Write("clicando em Salvar");
        await core.ExecuteScriptAsync("document.getElementById('save').click()");
        await Task.Delay(1500);
        Close();
    }

    protected override JsonNode? HandleOwn(string type, JsonObject payload) =>
        type == "save" ? Save(payload) : null;

    private JsonNode Save(JsonObject payload)
    {
        string name = payload["filename"]?.GetValue<string>() ?? "snaplocal.png";
        byte[] png = Convert.FromBase64String(payload["base64"]?.GetValue<string>() ?? "");

        // A extensão salva na pasta de downloads do navegador. Aqui o
        // equivalente é Imagens\SnapLocal, e o nome do arquivo continua vindo
        // do mesmo código: src/lib/naming.js.
        string folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "SnapLocal");
        Directory.CreateDirectory(folder);

        string target = Path.Combine(folder, Path.GetFileName(name));

        // askSaveLocation, a mesma configuração da extensão. O padrão continua
        // sendo salvar direto; quem liga a opção quer escolher a pasta.
        if (payload["saveAs"]?.GetValue<bool>() == true)
        {
            using var dialog = new SaveFileDialog
            {
                InitialDirectory = folder,
                FileName = Path.GetFileName(name),
                Filter = "PNG image|*.png",
                DefaultExt = "png",
                OverwritePrompt = true
            };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                // Desistir não é falhar: quem chamou precisa da diferença para
                // não anunciar um erro que não houve.
                Log.Write("save cancelado pelo usuario");
                return new JsonObject { ["ok"] = false, ["canceled"] = true };
            }
            target = dialog.FileName;
        }

        try
        {
            File.WriteAllBytes(target, png);
        }
        catch (Exception error)
        {
            Log.Write($"save falhou: {error.Message}");
            return new JsonObject { ["ok"] = false };
        }
        return new JsonObject { ["ok"] = true, ["path"] = target };
    }
}
