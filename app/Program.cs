using System.Drawing.Imaging;

namespace SnapLocal;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        // Modo de conferência, sem interface: captura a tela, grava o PNG e
        // sai. Existe para a captura poder ser verificada sem alguém no
        // teclado — inclusive por quem estiver construindo o projeto.
        if (args.Length >= 2 && args[0] == "--selftest")
        {
            using var shot = ScreenCapture.CaptureCurrentScreen();
            shot.Save(args[1], ImageFormat.Png);
            return;
        }

        // Abre o editor direto com um PNG do disco, sem passar pelo atalho.
        // É o que torna a Fase 1 verificável de fora: quem estiver construindo
        // o projeto consegue ver o editor carregar sem ter as mãos no teclado.
        if (args.Length >= 2 && args[0] == "--open-editor")
        {
            using var image = new Bitmap(args[1]);
            Application.Run(new EditorWindow(ScreenCapture.ToDataUrl(image)));
            return;
        }

        // Mesma coisa, mas clicando em Salvar sozinho: confere a ponte inteira,
        // do botão da página até o arquivo no disco.
        if (args.Length >= 2 && args[0] == "--selftest-save")
        {
            using var image = new Bitmap(args[1]);
            Application.Run(new EditorWindow(ScreenCapture.ToDataUrl(image), saveAndExit: true));
            return;
        }

        Application.Run(new TrayContext());
    }
}
