using Microsoft.Win32;
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
    /// Registra o atalho: Alt+Shift+S, o mesmo da extensão, ou a tecla Print
    /// Screen quando o usuário pediu. Devolve false quando o Windows não
    /// entrega a combinação — com o Print Screen isso é o caso comum, porque o
    /// Windows 11 dá essa tecla à Ferramenta de Captura por padrão.
    /// </summary>
    public bool Register(bool usePrintScreen)
    {
        Unregister();

        // Perguntar ao Windows antes de registrar, porque o registro mente: com
        // a Ferramenta de Captura ligada no Print Screen, o RegisterHotKey
        // devolve true e a tecla nunca chega aqui — o shell a consome primeiro.
        // Sem esta verificação a opção ficava marcada, sem aviso nenhum, e a
        // tecla não fazia nada. Foi o que o usuário relatou.
        if (usePrintScreen && SnippingToolOwnsPrintScreen()) return registered = false;

        registered = usePrintScreen
            ? RegisterHotKey(Handle, HotkeyId, MOD_NOREPEAT, (uint)Keys.PrintScreen)
            : RegisterHotKey(Handle, HotkeyId, MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, (uint)Keys.S);
        return registered;
    }

    /// <summary>
    /// Se a opção "Usar o botão Print Screen para abrir a captura de tela" está
    /// ligada no Windows 11.
    ///
    /// Só leitura: empacotado em MSIX, escrever aqui seria virtualizado para
    /// dentro do pacote e o Windows nunca veria — foi o que aconteceu com a
    /// chave Run do "iniciar com o Windows". Desligar a opção é do usuário, nas
    /// configurações do Windows; nosso trabalho é dizer que é preciso.
    /// </summary>
    public static bool SnippingToolOwnsPrintScreen()
    {
        using RegistryKey? teclado = Registry.CurrentUser.OpenSubKey(@"Control Panel\Keyboard");
        object? valor = teclado?.GetValue("PrintScreenKeyForSnippingEnabled");

        // O Windows grava como DWORD, mas já apareceu como texto no campo:
        // ler os dois evita concluir "desligado" por causa do tipo.
        return valor switch
        {
            int numero => numero != 0,
            string texto => texto is not ("0" or ""),
            _ => false
        };
    }

    private void Unregister()
    {
        if (!registered) return;
        UnregisterHotKey(Handle, HotkeyId);
        registered = false;
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
        Unregister();
        DestroyHandle();
    }
}
