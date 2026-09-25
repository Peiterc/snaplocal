using System.Runtime.InteropServices;

namespace SnapLocal;

/// <summary>
/// Janela invisível só para receber o atalho global. O Windows entrega
/// WM_HOTKEY a uma janela, então é preciso existir uma, mesmo que ninguém a
/// veja.
/// </summary>
sealed class HotkeyWindow : NativeWindow, IDisposable
{
    private const int WM_HOTKEY = 0x0312;
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_SHIFT = 0x0004;
    // Sem isto, segurar o atalho dispara uma captura atrás da outra.
    private const uint MOD_NOREPEAT = 0x4000;
    private const int HotkeyId = 1;

    // DllImport, e não LibraryImport: o gerador do LibraryImport exige
    // AllowUnsafeBlocks no projeto inteiro, e ligar código não seguro num app
    // que se vende por privacidade, por causa de duas chamadas, é um mau
    // negócio. O ganho de desempenho do gerador aqui é irrelevante: são duas
    // chamadas na vida do processo.
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    private bool registered;

    public event EventHandler? Pressed;

    public HotkeyWindow()
    {
        CreateHandle(new CreateParams());
    }

    /// <summary>
    /// Alt+Shift+S, o mesmo atalho da extensão. Devolve false quando outro
    /// programa já ficou com a combinação — o que vai acontecer de verdade
    /// quando a opção de usar o Print Screen existir, porque o Windows 11 dá
    /// essa tecla à Ferramenta de Captura.
    /// </summary>
    public bool Register()
    {
        registered = RegisterHotKey(Handle, HotkeyId, MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, (uint)Keys.S);
        return registered;
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HotkeyId)
        {
            Pressed?.Invoke(this, EventArgs.Empty);
            return;
        }
        base.WndProc(ref m);
    }

    public void Dispose()
    {
        if (registered)
        {
            UnregisterHotKey(Handle, HotkeyId);
            registered = false;
        }
        DestroyHandle();
    }
}
