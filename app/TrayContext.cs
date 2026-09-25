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
        menu.Items.Add("Capture this screen", null, (_, _) => CaptureAndEdit());
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

    private void CaptureAndEdit()
    {
        if (DateTime.Now - lastCapture < TimeSpan.FromMilliseconds(600)) return;
        lastCapture = DateTime.Now;

        string dataUrl;
        using (Bitmap shot = ScreenCapture.CaptureCurrentScreen())
            dataUrl = ScreenCapture.ToDataUrl(shot);

        new EditorWindow(dataUrl).Show();
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
