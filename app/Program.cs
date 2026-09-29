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
            Application.Run(Abrir(ScreenCapture.ToDataUrl(image), saveAndExit: false));
            return;
        }

        // Mesma coisa, mas clicando em Salvar sozinho: confere a ponte inteira,
        // do botão da página até o arquivo no disco.
        if (args.Length >= 2 && args[0] == "--selftest-save")
        {
            using var image = new Bitmap(args[1]);
            Application.Run(Abrir(ScreenCapture.ToDataUrl(image), saveAndExit: true));
            return;
        }

        // Abre só a seleção, sobre a tela de verdade, e fecha sozinha. Serve
        // para conferir o desenho do overlay sem alguém no mouse.
        if (args.Length >= 1 && args[0] == "--selftest-area")
        {
            Rectangle bounds = ScreenCapture.CurrentBounds();
            using Bitmap shot = ScreenCapture.Capture(bounds);
            using var overlay = new SelectionOverlay(shot, bounds);
            var closer = new System.Windows.Forms.Timer { Interval = 6000 };
            closer.Tick += (_, _) => { closer.Stop(); overlay.Close(); };
            closer.Start();
            overlay.ShowDialog();
            return;
        }

        // Recorta uma área fixa e abre o editor: confere tudo o que acontece
        // depois da seleção, sem depender de alguém arrastando o mouse.
        if (args.Length >= 1 && args[0] == "--selftest-crop")
        {
            Rectangle bounds = ScreenCapture.CurrentBounds();
            using Bitmap shot = ScreenCapture.Capture(bounds);
            var area = new Rectangle(80, 80, 640, 400);
            using Bitmap crop = shot.Clone(area, shot.PixelFormat);
            Application.Run(Abrir(ScreenCapture.ToDataUrl(crop), saveAndExit: true));
            return;
        }

        // Abre só as Opções, para conferir o desenho e as linhas que somem
        // fora do navegador.
        if (args.Length >= 1 && args[0] == "--selftest-options")
        {
            Application.Run(new OptionsWindow(dumpAndExit: true));
            return;
        }

        // Tenta registrar os dois atalhos e relata quem o Windows entregou.
        // A tecla Print Screen costuma ser recusada, e saber disso sem abrir
        // interface nenhuma vale mais que supor.
        if (args.Length >= 1 && args[0] == "--selftest-hotkey")
        {
            using var probe = new HotkeyWindow();
            Log.Write($"Alt+Shift+S: {probe.Register(false)}");
            Log.Write($"Print Screen: {probe.Register(true)}");
            return;
        }

        // Relata os textos do menu da bandeja no idioma configurado.
        if (args.Length >= 1 && args[0] == "--selftest-tray")
        {
            foreach (string key in new[] { "ctx_area", "tray_screen", "options_title", "tray_exit" })
                Log.Write($"{key}: {Strings.Get(key)}");
            return;
        }

        // Duas capturas seguidas no mesmo processo. Responde a pergunta que
        // decide se vale manter uma janela viva: a segunda é barata porque o
        // WebView2 já existe, ou custa o mesmo da primeira?
        if (args.Length >= 2 && args[0] == "--selftest-perf")
        {
            using var image = new Bitmap(args[1]);
            Application.Run(new PerfRun(ScreenCapture.ToDataUrl(image)));
            return;
        }

        // Compara uma página mínima com a página do editor, para separar o
        // custo do WebView2 do custo do nosso código.
        if (args.Length >= 1 && args[0] == "--selftest-probe")
        {
            Application.Run(new ProbeWindow());
            return;
        }

        Application.Run(new TrayContext());
    }

    /// <summary>
    /// Mede o que a pessoa sente: o editor aquece enquanto ela escolhe a área,
    /// e o cronômetro começa quando ela solta o mouse. Duas rodadas, porque a
    /// segunda captura do mesmo processo não paga o que a primeira pagou.
    /// </summary>
    private sealed class PerfRun : ApplicationContext
    {
        public PerfRun(string dataUrl) => _ = RunAsync(dataUrl);

        private async Task RunAsync(string dataUrl)
        {
            // Quanto tempo a pessoa levou escolhendo a área é o que o
            // aquecimento consegue aproveitar. Zero = como era antes.
            foreach (int selecao in new[] { 0, 1500, 4000 })
            {
                EditorWindow editor = EditorWindow.StartWarm();
                if (selecao > 0) await Task.Delay(selecao);
                long ms = await editor.DeliverAndWaitAsync(dataUrl);
                Log.Write($"selecao de {selecao} ms -> da entrega ate a imagem: {ms} ms");
                editor.Close();
                await Task.Delay(700);
            }
            ExitThread();
        }
    }

    /// <summary>
    /// A mesma sequência que a bandeja usa — aquecer e depois entregar a
    /// imagem — para os modos de conferência medirem o caminho real.
    /// </summary>
    private static EditorWindow Abrir(string dataUrl, bool saveAndExit)
    {
        EditorWindow editor = EditorWindow.StartWarm(saveAndExit);
        _ = editor.OpenAsync(dataUrl);
        return editor;
    }
}
