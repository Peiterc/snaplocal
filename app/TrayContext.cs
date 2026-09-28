namespace SnapLocal;

/// <summary>
/// O app vive na bandeja: não tem janela principal, só o ícone, o atalho
/// global e as janelas de editor que forem abrindo.
/// </summary>
sealed class TrayContext : ApplicationContext
{
    private readonly NotifyIcon tray;
    private readonly HotkeyWindow hotkey = new();

    public TrayContext()
    {
        hotkey.Pressed += (_, _) => CaptureAndEdit();

        var menu = new ContextMenuStrip();
        menu.Items.Add("Capture an area", null, (_, _) => CaptureAndEdit());
        menu.Items.Add("Capture this screen", null, (_, _) => CaptureAndEdit(wholeScreen: true));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitThread());

        tray = new NotifyIcon
        {
            Icon = AppAssets.Icon(),
            Text = "SnapLocal",
            Visible = true,
            ContextMenuStrip = menu
        };
        // Clique simples captura, como fazia o Lightshot: é o que a pessoa
        // tenta primeiro. O botão direito abre o menu sozinho, pelo
        // ContextMenuStrip.
        tray.MouseUp += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) CaptureAndEdit();
        };

        if (!hotkey.Register())
        {
            // Falha silenciosa aqui seria o pior dos mundos: a pessoa aperta o
            // atalho, nada acontece, e ela conclui que o app está quebrado.
            tray.ShowBalloonTip(
                8000,
                "SnapLocal",
                "Alt+Shift+S is already taken by another program. Use the tray icon, or free the shortcut.",
                ToolTipIcon.Warning);
        }
    }

    // Um clique duplo no ícone chega como dois cliques simples, e sem isto
    // abriria dois editores.
    private DateTime lastCapture = DateTime.MinValue;

    private void CaptureAndEdit(bool wholeScreen = false)
    {
        if (DateTime.Now - lastCapture < TimeSpan.FromMilliseconds(600)) return;
        lastCapture = DateTime.Now;

        Rectangle bounds = ScreenCapture.CurrentBounds();
        using Bitmap shot = ScreenCapture.Capture(bounds);
        Log.Write($"captura {shot.Width}x{shot.Height} de {bounds}");

        Bitmap? chosen = wholeScreen ? shot : Choose(shot, bounds);
        if (chosen is null)
        {
            Log.Write("selecao cancelada");
            return;
        }

        string dataUrl = ScreenCapture.ToDataUrl(chosen);
        Log.Write($"recorte {chosen.Width}x{chosen.Height}, dataUrl {dataUrl.Length} chars");
        if (!ReferenceEquals(chosen, shot)) chosen.Dispose();

        Open(dataUrl);
    }

    /// <summary>
    /// Abre o editor e traz para a frente. Sem o Activate, a janela nova pode
    /// nascer atrás da que estava em foco — e para quem está usando, "não
    /// abriu" e "abriu atrás de tudo" são a mesma coisa.
    /// </summary>
    private static void Open(string dataUrl)
    {
        var editor = new EditorWindow(dataUrl);
        editor.Show();
        editor.Activate();
        Log.Write("editor aberto");
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
        }
        base.Dispose(disposing);
    }
}
