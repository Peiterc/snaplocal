using System.Diagnostics;
using System.Text.Json.Nodes;

namespace SnapLocal;

/// <summary>
/// Conferência de desempenho: abre uma página mínima e cronometra até o
/// primeiro sinal de vida dela. Serve para separar o que o WebView2 custa do
/// que o nosso código custa.
/// </summary>
sealed class ProbeWindow : WebHostWindow
{
    protected override string Page => "probe.html";

    private readonly Stopwatch clock = Stopwatch.StartNew();

    // A página é escrita aqui, e não guardada no projeto, porque a pasta web
    // é reconstruída do zero a partir de src/ a cada sync.
    private const string Html =
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>probe</title></head><body>" +
        "<script>window.chrome.webview.postMessage({ id: 1, type: 'probe', payload: {} });</script>" +
        "</body></html>";

    public ProbeWindow()
    {
        File.WriteAllText(Path.Combine(AppAssets.WebFolder(), "probe.html"), Html);

        StartPosition = FormStartPosition.Manual;
        Location = new Point(-32000, -32000);
        ShowInTaskbar = false;
        Width = 600;
        Height = 400;
    }

    protected override JsonNode? HandleOwn(string type, JsonObject payload)
    {
        if (type == "probe")
        {
            Log.Write($"pagina minima falou em {clock.ElapsedMilliseconds} ms");
            BeginInvoke(Close);
        }
        return null;
    }
}
