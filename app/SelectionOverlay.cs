using System.Drawing.Drawing2D;

namespace SnapLocal;

/// <summary>
/// A seleção de área: uma janela sem bordas, por cima de tudo, mostrando a
/// tela já congelada. A pessoa arrasta sobre a imagem parada, então nada se
/// mexe embaixo do mouse enquanto ela escolhe — que é o motivo de capturar
/// primeiro e só depois mostrar a seleção.
/// </summary>
sealed class SelectionOverlay : Form
{
    private readonly Bitmap frozen;
    private Point origin;
    private bool dragging;

    /// <summary>A área escolhida, em coordenadas da imagem congelada.</summary>
    public Rectangle Selection { get; private set; } = Rectangle.Empty;

    public SelectionOverlay(Bitmap screenshot, Rectangle screenBounds)
    {
        frozen = screenshot;

        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = screenBounds;
        TopMost = true;
        ShowInTaskbar = false;
        Cursor = Cursors.Cross;
        DoubleBuffered = true;
        KeyPreview = true;
        BackColor = Color.Black;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode = PixelOffsetMode.Half;
        g.DrawImage(frozen, new Rectangle(0, 0, ClientSize.Width, ClientSize.Height));

        // Escurece tudo, menos o que está selecionado: é o que faz a área
        // escolhida saltar aos olhos.
        using var shade = new SolidBrush(Color.FromArgb(120, 0, 0, 0));
        Rectangle area = Normalized();
        if (area.Width > 0 && area.Height > 0)
        {
            using var outside = new Region(ClientRectangle);
            outside.Exclude(area);
            g.FillRegion(shade, outside);

            using var border = new Pen(Color.FromArgb(230, 37, 99, 235), 1.5f);
            g.DrawRectangle(border, area);
            DrawSizeTag(g, area);
        }
        else
        {
            g.FillRectangle(shade, ClientRectangle);
            DrawHint(g);
        }
    }

    private void DrawHint(Graphics g)
    {
        const string hint = "Drag to select an area    ·    Esc to cancel";
        using var font = new Font(SystemFonts.MessageBoxFont!.FontFamily, 12f);
        SizeF size = g.MeasureString(hint, font);
        var box = new RectangleF(
            (ClientSize.Width - size.Width) / 2 - 14,
            ClientSize.Height / 2f - size.Height / 2 - 8,
            size.Width + 28, size.Height + 16);

        using var background = new SolidBrush(Color.FromArgb(200, 17, 24, 39));
        g.FillRectangle(background, box);
        g.DrawString(hint, font, Brushes.White, box.X + 14, box.Y + 8);
    }

    private void DrawSizeTag(Graphics g, Rectangle area)
    {
        string label = $"{area.Width} × {area.Height}";
        using var font = new Font(SystemFonts.MessageBoxFont!.FontFamily, 9f);
        SizeF size = g.MeasureString(label, font);

        // Acima da seleção, ou dentro dela quando não há espaço em cima.
        float y = area.Top - size.Height - 6;
        if (y < 2) y = area.Top + 4;

        var box = new RectangleF(area.Left, y, size.Width + 10, size.Height + 4);
        using var background = new SolidBrush(Color.FromArgb(220, 17, 24, 39));
        g.FillRectangle(background, box);
        g.DrawString(label, font, Brushes.White, box.X + 5, box.Y + 2);
    }

    private Rectangle Normalized()
    {
        // Fora do arraste vale o que já foi escolhido — e nada, antes do
        // primeiro arraste. Calcular a partir da origem aqui desenhava um
        // retângulo fantasma do canto da tela até o ponteiro, sem ninguém ter
        // arrastado coisa nenhuma.
        if (!dragging) return Selection;

        Point now = PointToClient(Cursor.Position);
        return Rectangle.FromLTRB(
            Math.Min(origin.X, now.X), Math.Min(origin.Y, now.Y),
            Math.Max(origin.X, now.X), Math.Max(origin.Y, now.Y));
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        dragging = true;
        origin = e.Location;
        Selection = Rectangle.Empty;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (dragging) Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || !dragging) return;
        dragging = false;
        Rectangle area = Normalized();

        // Um clique sem arrastar não é uma seleção de 1 pixel, é desistência.
        if (area.Width < 8 || area.Height < 8)
        {
            Selection = Rectangle.Empty;
            DialogResult = DialogResult.Cancel;
        }
        else
        {
            Selection = area;
            DialogResult = DialogResult.OK;
        }
        Close();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Escape)
        {
            Selection = Rectangle.Empty;
            DialogResult = DialogResult.Cancel;
            Close();
        }
    }
}
