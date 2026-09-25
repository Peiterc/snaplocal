using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SnapLocal;

/// <summary>
/// A janela do editor: um WebView2 mostrando exatamente a mesma página que a
/// extensão usa. Esta classe é a casca — responde ao que a página pede através
/// de app/Assets/bridge.js.
/// </summary>
sealed class EditorWindow : Form
{
    // Host virtual em https: a página precisa de origem segura para a área de
    // transferência funcionar, e file:// não serve.
    private const string VirtualHost = "snaplocal.local";
    private const string StartPage = "https://" + VirtualHost + "/editor/editor.html";

    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly JsonObject session = new();

    // Conferência automática: clica em Salvar assim que a página carrega e
    // fecha. Existe para a ponte com o C# poder ser testada sem alguém no
    // mouse — é o caminho novo do projeto, e o que mais merece teste. Vem pelo
    // construtor, e não como propriedade: o WinForms trata propriedade pública
    // de Form como algo que o designer precisa saber serializar.
    private readonly bool saveAndExit;

    public EditorWindow(string captureDataUrl, bool saveAndExit = false)
    {
        this.saveAndExit = saveAndExit;
        Text = "SnapLocal";
        Width = 1280;
        Height = 820;
        StartPosition = FormStartPosition.CenterScreen;
        Icon = AppAssets.Icon();

        // O editor lê a captura de chrome.storage.session, como na extensão.
        session["lastCapture"] = new JsonObject
        {
            ["dataUrl"] = captureDataUrl,
            ["title"] = "",
            ["url"] = "",
            ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        Controls.Add(view);
        Load += async (_, _) => await StartAsync();
    }

    private async Task StartAsync()
    {
        await view.EnsureCoreWebView2Async(null);
        CoreWebView2 core = view.CoreWebView2;

        core.SetVirtualHostNameToFolderMapping(
            VirtualHost, AppAssets.WebFolder(), CoreWebView2HostResourceAccessKind.Allow);

        // Tem que entrar antes da navegação: é o que garante que chrome.*
        // exista quando o primeiro módulo da página rodar.
        await core.AddScriptToExecuteOnDocumentCreatedAsync(AppAssets.BridgeScript());

        core.WebMessageReceived += OnWebMessage;
        core.PermissionRequested += OnPermissionRequested;

        // Nada de menu de contexto do navegador nem F12 numa janela que, para
        // o usuário, é um aplicativo.
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;

        if (saveAndExit)
            core.NavigationCompleted += async (_, _) => await ClickSaveAndExitAsync(core);

        core.Navigate(StartPage);
    }

    private async Task ClickSaveAndExitAsync(CoreWebView2 core)
    {
        // O editor monta a interface depois de carregar a captura, então não
        // basta a navegação ter terminado: o botão pode ainda não existir.
        for (int attempt = 0; attempt < 40; attempt++)
        {
            string ready = await core.ExecuteScriptAsync("!!document.getElementById('save')");
            if (ready == "true") break;
            await Task.Delay(100);
        }
        Log.Write("clicando em Salvar");
        Log.Write("estado: " + await core.ExecuteScriptAsync(
            "JSON.stringify({ save: !!document.getElementById('save'), board: !!document.getElementById('board'), chrome: typeof chrome, downloads: typeof chrome?.downloads?.download })"));
        await core.ExecuteScriptAsync("document.getElementById('save').click()");
        await Task.Delay(1500);
        Close();
    }

    private void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        // A página é nossa e vem do nosso host virtual; a única permissão que
        // ela pede é a área de transferência, ao copiar a imagem.
        if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead)
            e.State = CoreWebView2PermissionState.Allow;
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        Log.Write($"page -> {e.WebMessageAsJson}");
        JsonNode? message = JsonNode.Parse(e.WebMessageAsJson);
        if (message is not JsonObject request) return;

        int id = request["id"]?.GetValue<int>() ?? 0;
        string type = request["type"]?.GetValue<string>() ?? "";
        JsonObject payload = request["payload"] as JsonObject ?? new JsonObject();

        JsonNode? result = type switch
        {
            "storage.get" => StorageGet(payload),
            "storage.set" => StorageSet(payload),
            "save" => Save(payload),
            _ => null
        };

        Log.Write($"host -> id={id} {result?.ToJsonString() ?? "null"}");
        Reply(id, result);
    }

    private void Reply(int id, JsonNode? result)
    {
        var answer = new JsonObject { ["id"] = id, ["result"] = result };
        view.CoreWebView2.PostWebMessageAsJson(answer.ToJsonString());
    }

    private JsonObject Store(JsonObject payload) =>
        payload["area"]?.GetValue<string>() == "session" ? session : Settings.All();

    private JsonNode StorageGet(JsonObject payload)
    {
        JsonObject store = Store(payload);
        var found = new JsonObject();
        foreach (JsonNode? key in payload["keys"]?.AsArray() ?? new JsonArray())
        {
            string name = key?.GetValue<string>() ?? "";
            if (store.TryGetPropertyValue(name, out JsonNode? value))
                found[name] = value?.DeepClone();
        }
        return found;
    }

    private JsonNode StorageSet(JsonObject payload)
    {
        var items = payload["items"] as JsonObject ?? new JsonObject();
        if (payload["area"]?.GetValue<string>() == "session")
        {
            foreach (KeyValuePair<string, JsonNode?> item in items)
                session[item.Key] = item.Value?.DeepClone();
        }
        else
        {
            Settings.Merge(items);
        }
        return new JsonObject { ["ok"] = true };
    }

    private JsonNode Save(JsonObject payload)
    {
        string name = payload["filename"]?.GetValue<string>() ?? "snaplocal.png";
        byte[] png = Convert.FromBase64String(payload["base64"]?.GetValue<string>() ?? "");

        // A extensão salva na pasta de downloads do navegador. Aqui o
        // equivalente é Imagens\SnapLocal, e o nome do arquivo continua vindo
        // do mesmo código: src/lib/naming.js.
        string folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "SnapLocal");
        Directory.CreateDirectory(folder);

        string target = Path.Combine(folder, Path.GetFileName(name));
        try
        {
            File.WriteAllBytes(target, png);
        }
        catch (Exception error)
        {
            Log.Write($"save falhou: {error.Message}");
            return new JsonObject { ["ok"] = false };
        }
        return new JsonObject { ["ok"] = true, ["path"] = target };
    }
}
