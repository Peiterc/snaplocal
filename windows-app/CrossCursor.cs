using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace SnapLocal;

/// <summary>
/// A cruz da seleção de área. A do sistema (Cursors.Cross) é uma linha fina
/// preta e some sobre a tela escurecida; esta é branca com contorno preto, o
/// mesmo desenho do cursor da extensão, e aparece sobre qualquer fundo.
///
/// O Windows mostra um cursor feito a partir de bitmap no tamanho exato do
/// bitmap, sem escalar, então ele é desenhado já no DPI do monitor.
/// </summary>
sealed class CrossCursor : IDisposable
{
    [StructLayout(LayoutKind.Sequential)]
    private struct IconInfo
    {
        [MarshalAs(UnmanagedType.Bool)] public bool fIcon;
        public int xHotspot;
        public int yHotspot;
        public IntPtr hbmMask;
        public IntPtr hbmColor;
    }

    // DllImport pelo mesmo motivo de HotkeyWindow.cs.
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetIconInfo(IntPtr hIcon, out IconInfo info);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr CreateIconIndirect(ref IconInfo info);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyCursor(IntPtr hCursor);

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteObject(IntPtr hObject);

    private IntPtr handle;

    /// <summary>
    /// Null se o Windows recusar criar o cursor; quem usa fica com a cruz do
    /// sistema, que é pior de ver mas funciona.
    /// </summary>
    public Cursor? Cursor { get; }

    public CrossCursor(int dpi)
    {
        float scale = Math.Max(1f, dpi / 96f);
        int size = (int)Math.Round(32 * scale);
        int line = Math.Max(1, (int)Math.Round(scale));
        int center = size / 2;
        int start = center - line / 2;

        using var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bitmap))
        {
            g.Clear(Color.Transparent);
            // Contorno: a linha mais uma de cada lado. O miolo branco por cima,
            // recuado o mesmo tanto nas pontas. Os braços são medidos a partir
            // do miolo, para terem o mesmo comprimento dos dois lados mesmo
            // quando a linha tem largura par.
            int edge = line;
            int far = 2 * start;   // a margem da ponta direita espelha a da esquerda
            int outer = far - line;
            int inner = far - line - 2 * edge;
            g.FillRectangle(Brushes.Black, start - edge, line, line + 2 * edge, outer);
            g.FillRectangle(Brushes.Black, line, start - edge, outer, line + 2 * edge);
            g.FillRectangle(Brushes.White, start, line + edge, line, inner);
            g.FillRectangle(Brushes.White, line + edge, start, inner, line);
        }

        IntPtr icon = bitmap.GetHicon();
        try
        {
            if (!GetIconInfo(icon, out IconInfo info)) return;
            try
            {
                // Um ícone tem o ponto quente fixo no centro do bitmap, que
                // cai meio pixel fora do miolo; um cursor aceita o ponto exato.
                info.fIcon = false;
                info.xHotspot = start;
                info.yHotspot = start;
                handle = CreateIconIndirect(ref info);
            }
            finally
            {
                DeleteObject(info.hbmMask);
                DeleteObject(info.hbmColor);
            }
        }
        finally
        {
            DestroyIcon(icon);
        }

        // new Cursor(IntPtr) não toma posse do handle: destruí-lo é com o Dispose.
        if (handle != IntPtr.Zero) Cursor = new Cursor(handle);
    }

    public void Dispose()
    {
        if (handle == IntPtr.Zero) return;
        DestroyCursor(handle);
        handle = IntPtr.Zero;
    }
}
