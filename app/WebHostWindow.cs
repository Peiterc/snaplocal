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
        await View.EnsureCoreWebView2Async(null);
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
        core.Navigate($"https://{VirtualHost}/{Page}");
    }

    /// <summary>Gancho para o que precisa existir antes da navegação.</summary>
    protected virtual Task ReadyAsync(CoreWebView2 core) => Task.CompletedTask;

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        Log.Write($"page -> {e.WebMessageAsJson}");
        if (JsonNode.Parse(e.WebMessageAsJson) is not JsonObject request) return;

        int id = request["id"]?.GetValue<int>() ?? 0;
        string type = request["type"]?.GetValue<string>() ?? "";
        JsonObject payload = request["payload"] as JsonObject ?? new JsonObject();

        JsonNode? result = type switch
        {
            "storage.get" => StorageGet(payload),
            "storage.set" => StorageSet(payload),
            "app.info" => new JsonObject { ["version"] = AppSettings.Version },
            _ => HandleOwn(type, payload)
        };
        Log.Write($"host -> id={id} {result?.ToJsonString() ?? "null"}");

        var answer = new JsonObject { ["id"] = id, ["result"] = result };
        View.CoreWebView2.PostWebMessageAsJson(answer.ToJsonString());
    }

    /// <summary>O que cada janela sabe responder além do comum a todas.</summary>
    protected virtual JsonNode? HandleOwn(string type, JsonObject payload) => null;

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
