using System.Text.Json.Nodes;

namespace SnapLocal;

/// <summary>
/// O app vive na bandeja: não tem janela principal, só o ícone, o atalho
/// global e as janelas que forem abrindo.
/// </summary>
sealed class TrayContext : ApplicationContext
{
    private readonly NotifyIcon tray;
    private readonly HotkeyWindow hotkey = new();
    private OptionsWindow? options;

    public TrayContext()
    {
        hotkey.Pressed += (_, _) => CaptureAndEdit();

        tray = new NotifyIcon
        {
            Icon = AppAssets.Icon(),
            Text = "SnapLocal",
            Visible = true
        };
        // Clique simples captura, como fazia o Lightshot: é o que a pessoa
        // tenta primeiro. O botão direito abre o menu.
        tray.MouseUp += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) CaptureAndEdit();
        };

        BuildMenu();

        // Trocar o idioma nas Opções tem que trocar o menu junto, senão fica
        // metade do app num idioma e metade no outro.
        AppSettings.ApplyHotkeyMode = mode => { BuildMenu(); return ApplyHotkey(mode); };

        coolDown.Tick += (_, _) => Cool();

        bool usePrintScreen = Settings.All()["usePrintScreen"]?.GetValue<bool>() ?? false;
        ApplyHotkey(usePrintScreen);
    }

    private void BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(Strings.Get("ctx_area"), null, (_, _) => CaptureAndEdit());
        menu.Items.Add(Strings.Get("tray_screen"), null, (_, _) => CaptureAndEdit(wholeScreen: true));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Strings.Get("options_title"), null, (_, _) => ShowOptions());
        menu.Items.Add(Strings.Get("tray_exit"), null, (_, _) => ExitThread());

        tray.ContextMenuStrip?.Dispose();
        tray.ContextMenuStrip = menu;
    }

    /// <summary>
    /// Registra o atalho e avisa se não conseguiu. Falha silenciosa aqui seria
    /// o pior dos mundos: a pessoa aperta, nada acontece, e conclui que o app
    /// está quebrado.
    /// </summary>
    private bool ApplyHotkey(bool usePrintScreen)
    {
        if (hotkey.Register(usePrintScreen)) return true;

        Log.Write($"atalho recusado (printScreen={usePrintScreen})");
        tray.ShowBalloonTip(
            8000,
            "SnapLocal",
            Strings.Get(usePrintScreen ? "opt_printscreen_busy" : "tray_hotkey_busy"),
            ToolTipIcon.Warning);

        // Sem a tecla pedida, volta para a combinação que costuma estar livre:
        // ficar sem atalho nenhum seria pior do que ficar com o padrão.
        if (usePrintScreen) hotkey.Register(false);
        return false;
    }

    private void ShowOptions()
    {
        if (options is { IsDisposed: false })
        {
            options.Activate();
            return;
        }
        options = new OptionsWindow();
        options.FormClosed += (_, _) => options = null;
        options.Show();
        options.Activate();
    }

    // Um clique duplo no ícone chega como dois cliques simples, e sem isto
    // abriria dois editores.
    private DateTime lastCapture = DateTime.MinValue;

    // A janela que já está subindo o WebView2. Sobrevive a uma desistência:
    // quem apertou Esc costuma tentar de novo em seguida, e o trabalho já
    // estaria feito.
    private EditorWindow? warming;

    // Um editor pronto custa por volta de 190 MB, medido. Vale a pena
    // enquanto a pessoa está usando o app — a captura seguinte abre em
    // milissegundos —, e não vale nada num programa parado na bandeja desde
    // ontem. Por isso a janela quente se desfaz sozinha depois de um tempo sem
    // uso, e é refeita na próxima captura.
    // SNAPLOCAL_KEEP_WARM_SECONDS encurta a espera: sem isso, conferir o
    // descarte custaria cinco minutos parado a cada tentativa.
    private static int KeepWarmMs =>
        int.TryParse(Environment.GetEnvironmentVariable("SNAPLOCAL_KEEP_WARM_SECONDS"), out int seconds)
            ? seconds * 1000
            : 5 * 60 * 1000;

    private readonly System.Windows.Forms.Timer coolDown = new() { Interval = KeepWarmMs };

    private void CaptureAndEdit(bool wholeScreen = false)
    {
        if (DateTime.Now - lastCapture < TimeSpan.FromMilliseconds(600)) return;
        lastCapture = DateTime.Now;

        Rectangle bounds = ScreenCapture.CurrentBounds();
        using Bitmap shot = ScreenCapture.Capture(bounds);
        Log.Write($"captura {shot.Width}x{shot.Height} de {bounds}");

        // O navegador embutido leva segundos para existir, e esses segundos
        // são exatamente os que a pessoa gasta escolhendo a área. Subir os
        // dois ao mesmo tempo é de graça.
        Warm();

        Bitmap? chosen = wholeScreen ? shot : Choose(shot, bounds);
        if (chosen is null)
        {
            Log.Write("selecao cancelada");
            return;
        }

        string dataUrl = ScreenCapture.ToDataUrl(chosen);
        Log.Write($"recorte {chosen.Width}x{chosen.Height}, dataUrl {dataUrl.Length} chars");
        if (!ReferenceEquals(chosen, shot)) chosen.Dispose();

        EditorWindow editor = warming!;
        warming = null;
        coolDown.Stop();

        // Quando esta janela fechar, deixa outra pronta: a captura seguinte
        // costuma vir logo depois, e aí ela abre instantaneamente.
        editor.FormClosed += (_, _) => { Warm(); coolDown.Start(); };
        _ = editor.OpenAsync(dataUrl);
    }

    private void Warm()
    {
        if (warming is null or { IsDisposed: true }) warming = EditorWindow.StartWarm();
    }

    private void Cool()
    {
        coolDown.Stop();
        if (warming is null or { IsDisposed: true }) return;
        Log.Write("janela quente descartada por falta de uso");
        warming.Dispose();
        warming = null;
    }

    /// <summary>
    /// Mostra a seleção sobre a tela congelada e devolve o recorte, ou null se
    /// a pessoa apertou Esc ou só clicou sem arrastar.
    /// </summary>
    private static Bitmap? Choose(Bitmap shot, Rectangle bounds)
    {
        using var overlay = new SelectionOverlay(shot, bounds);
        DialogResult answer = overlay.ShowDialog();
        Log.Write($"selecao: {answer}, area {overlay.Selection}");
        if (answer != DialogResult.OK) return null;

        try
        {
            return shot.Clone(overlay.Selection, shot.PixelFormat);
        }
        catch (Exception error)
        {
            // Clone com retângulo fora da imagem estoura aqui, e o GDI+ chama
            // isso de falta de memória, o que confunde quem lê o erro.
            Log.Write($"recorte falhou em {overlay.Selection}: {error.GetType().Name} {error.Message}");
            return null;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            tray.Visible = false;   // sem isto o ícone fica fantasma na bandeja
            tray.Dispose();
            hotkey.Dispose();
            coolDown.Dispose();
            warming?.Dispose();
        }
        base.Dispose(disposing);
    }
}
