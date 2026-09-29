using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SnapLocal;

/// <summary>
/// Base das janelas que hospedam uma página do pacote: o editor e as opções.
/// Ela cuida do WebView2, do host virtual e da conversa com a página; cada
/// janela só diz que página abrir e o que fazer com as mensagens próprias.
/// </summary>
abstract class WebHostWindow : Form
{
    // Host virtual em https: a página precisa de origem segura para a área de
    // transferência funcionar, e file:// não serve.
    protected const string VirtualHost = "snaplocal.local";

    protected readonly WebView2 View = new() { Dock = DockStyle.Fill };

    protected abstract string Page { get; }

    /// <summary>
    /// Falso na janela que é criada antes de ter conteúdo: ela sobe o WebView2
    /// e espera. Ver EditorWindow.StartWarm.
    /// </summary>
    protected virtual bool NavigateOnStart => true;

    private readonly TaskCompletionSource warm = new();

    /// <summary>Completa quando o WebView2 existe e já pode navegar.</summary>
    public Task Warm => warm.Task;

    private readonly Stopwatch age = Stopwatch.StartNew();

    /// <summary>
    /// Um ambiente só para todas as janelas, com o adiamento de janelas
    /// ocultas desligado.
    ///
    /// O padrão do Chromium é não trabalhar em páginas que ele considera
    /// invisíveis, o que é sensato num navegador com vinte abas e péssimo
    /// aqui: a janela do editor é criada fora da tela justamente para carregar
    /// enquanto a pessoa escolhe a área, e com o adiamento ligado ela só
    /// começava a carregar quando aparecia — desperdiçando a espera inteira.
    /// </summary>
    private static Task<CoreWebView2Environment>? environment;

    private static Task<CoreWebView2Environment> Environment() => environment ??=
        CoreWebView2Environment.CreateAsync(null, null, new CoreWebView2EnvironmentOptions
        {
            AdditionalBrowserArguments =
                "--disable-features=CalculateNativeWinOcclusion " +
                "--disable-backgrounding-occluded-windows " +
                "--disable-renderer-backgrounding"
        });

    /// <summary>
    /// O equivalente ao chrome.storage.session: vive enquanto a janela vive.
    /// Só o editor usa, para receber a captura.
    /// </summary>
    protected virtual JsonObject Session { get; } = new();

    protected WebHostWindow()
    {
        Icon = AppAssets.Icon();
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(View);
        Load += async (_, _) => await StartAsync();
    }

    private async Task StartAsync()
    {
        await View.EnsureCoreWebView2Async(await Environment());
        CoreWebView2 core = View.CoreWebView2;

        core.SetVirtualHostNameToFolderMapping(
            VirtualHost, AppAssets.WebFolder(), CoreWebView2HostResourceAccessKind.Allow);

        core.WebMessageReceived += OnWebMessage;
        core.PermissionRequested += (_, e) =>
        {
            // A página é nossa e vem do nosso host virtual; a única permissão
            // que ela pede é a área de transferência, ao copiar a imagem.
            if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead)
                e.State = CoreWebView2PermissionState.Allow;
        };

        // Nada de menu de contexto do navegador nem F12 numa janela que, para
        // o usuário, é um aplicativo.
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;

        await ReadyAsync(core);
        Log.Write($"webview pronto em {age.ElapsedMilliseconds} ms");
        warm.TrySetResult();

        if (NavigateOnStart) GoToPage();
    }

    protected void GoToPage()
    {
        View.CoreWebView2.NavigationCompleted += (_, _) =>
            Log.Write($"pagina pronta em {age.ElapsedMilliseconds} ms");
        View.CoreWebView2.Navigate($"https://{VirtualHost}/{Page}");
    }

    /// <summary>Gancho para o que precisa existir antes da navegação.</summary>
    protected virtual Task ReadyAsync(CoreWebView2 core) => Task.CompletedTask;

    private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        Log.Write($"page -> {e.WebMessageAsJson}");
        if (JsonNode.Parse(e.WebMessageAsJson) is not JsonObject request) return;

        int id = request["id"]?.GetValue<int>() ?? 0;
        string type = request["type"]?.GetValue<string>() ?? "";
        JsonObject payload = request["payload"] as JsonObject ?? new JsonObject();

        // A resposta pode demorar de propósito: o editor abre antes de a
        // captura existir, e fica esperando por ela na própria promessa.
        JsonNode? result = await HandleAsync(type, payload);
        if (IsDisposed) return;

        Log.Write($"host -> id={id} {result?.ToJsonString() ?? "null"}");
        var answer = new JsonObject { ["id"] = id, ["result"] = result };
        View.CoreWebView2.PostWebMessageAsJson(answer.ToJsonString());
    }

    protected virtual Task<JsonNode?> HandleAsync(string type, JsonObject payload) =>
        Task.FromResult<JsonNode?>(type switch
        {
            "storage.get" => StorageGet(payload),
            "storage.set" => StorageSet(payload),
            "app.info" => new JsonObject { ["version"] = AppSettings.Version },
            _ => HandleOwn(type, payload)
        });

    /// <summary>O que cada janela sabe responder além do comum a todas.</summary>
    protected virtual JsonNode? HandleOwn(string type, JsonObject payload) => null;

    protected JsonNode? HandleCommon(string type, JsonObject payload) => type switch
    {
        "storage.get" => StorageGet(payload),
        "storage.set" => StorageSet(payload),
        "app.info" => new JsonObject { ["version"] = AppSettings.Version },
        _ => HandleOwn(type, payload)
    };

    private bool IsSession(JsonObject payload) =>
        payload["area"]?.GetValue<string>() == "session";

    private JsonNode StorageGet(JsonObject payload)
    {
        JsonObject store = IsSession(payload) ? Session : Settings.All();
        var found = new JsonObject();

        foreach (JsonNode? key in payload["keys"]?.AsArray() ?? new JsonArray())
        {
            string name = key?.GetValue<string>() ?? "";

            // Quem manda em "iniciar com o Windows" é o registro, não o nosso
            // arquivo: o usuário pode ter desligado pelo Gerenciador de
            // Tarefas, e a tela tem que mostrar a verdade.
            if (name == "startWithWindows")
            {
                found[name] = Startup.Enabled;
                continue;
            }
            if (store.TryGetPropertyValue(name, out JsonNode? value))
                found[name] = value?.DeepClone();
        }
        return found;
    }

    private JsonNode StorageSet(JsonObject payload)
    {
        var items = payload["items"] as JsonObject ?? new JsonObject();

        if (IsSession(payload))
        {
            foreach (KeyValuePair<string, JsonNode?> item in items)
                Session[item.Key] = item.Value?.DeepClone();
            return new JsonObject { ["ok"] = true };
        }

        // Grava primeiro, aplica depois: se o sistema recusar, a configuração
        // volta atrás junto com a resposta.
        Settings.Merge(items);
        bool ok = AppSettings.Apply(items);
        if (!ok)
        {
            var desfaz = new JsonObject();
            foreach (KeyValuePair<string, JsonNode?> item in items)
                desfaz[item.Key] = false;
            Settings.Merge(desfaz);
        }
        return new JsonObject { ["ok"] = ok };
    }
}
