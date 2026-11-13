using System.Drawing.Imaging;

namespace SnapLocal;

static class ScreenCapture
{
    /// <summary>
    /// A tela onde o ponteiro está. Com vários monitores, é a escolha que
    /// corresponde ao que a pessoa está olhando quando aperta o atalho.
    /// </summary>
    public static Bitmap CaptureCurrentScreen() => Capture(CurrentBounds());

    /// <summary>Os limites da tela onde o ponteiro está.</summary>
    public static Rectangle CurrentBounds() => Screen.FromPoint(Cursor.Position).Bounds;

    /// <summary>
    /// A área de trabalho inteira, somando todos os monitores — e com origem
    /// negativa quando um deles fica à esquerda ou acima do principal.
    ///
    /// É o que a seleção cobre. Antes ela cobria só a tela onde estava o
    /// ponteiro, e com dois monitores metade da área de trabalho ficava fora
    /// do alcance: não dava para escolher nada no outro monitor, nem arrastar
    /// de um para o outro.
    /// </summary>
    public static Rectangle AllScreens() => SystemInformation.VirtualScreen;

    public static Bitmap Capture(Rectangle bounds)
    {

        var shot = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        using var canvas = Graphics.FromImage(shot);
        canvas.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
        return shot;
    }

    /// <summary>
    /// A imagem da área de transferência, ou null. É o "Colar imagem" do app:
    /// aqui não há permissão a pedir — o Windows entrega a área de transferência
    /// a qualquer programa —, então basta ler. Só imagem: texto copiado nunca é
    /// lido, igual à extensão.
    /// </summary>
    public static Bitmap? FromClipboard()
    {
        try
        {
            if (!Clipboard.ContainsImage()) return null;
            using Image? image = Clipboard.GetImage();
            return image is null ? null : new Bitmap(image);
        }
        catch (System.Runtime.InteropServices.ExternalException error)
        {
            // Outro programa está com a área de transferência aberta naquele
            // instante. Não é erro do usuário; a próxima tentativa costuma dar.
            Log.Write($"area de transferencia ocupada: {error.Message}");
            return null;
        }
    }

    /// <summary>O editor recebe a imagem como data URL, igual à extensão.</summary>
    public static string ToDataUrl(Bitmap image)
    {
        using var buffer = new MemoryStream();
        image.Save(buffer, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(buffer.ToArray());
    }
}
