using System.Drawing.Imaging;

namespace SnapLocal;

static class ScreenCapture
{
    /// <summary>
    /// A tela onde o ponteiro está. Com vários monitores, é a escolha que
    /// corresponde ao que a pessoa está olhando quando aperta o atalho.
    /// </summary>
    public static Bitmap CaptureCurrentScreen()
    {
        Screen screen = Screen.FromPoint(Cursor.Position);
        Rectangle bounds = screen.Bounds;

        var shot = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        using var canvas = Graphics.FromImage(shot);
        canvas.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
        return shot;
    }

    /// <summary>O editor recebe a imagem como data URL, igual à extensão.</summary>
    public static string ToDataUrl(Bitmap image)
    {
        using var buffer = new MemoryStream();
        image.Save(buffer, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(buffer.ToArray());
    }
}
