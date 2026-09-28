using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace SnapLocal;

/// <summary>
/// A janela do editor: um WebView2 mostrando exatamente a mesma página que a
/// extensão usa. Esta classe é a casca — responde ao que a página pede através
/// do contrato descrito em src/lib/platform.js.
/// </summary>
sealed class EditorWindow : WebHostWindow
{
    protected override string Page => "editor/editor.html";

    private readonly JsonObject session = new();
    protected override JsonObject Session => session;

    // Conferência automática: clica em Salvar assim que a página carrega e
    // fecha. Existe para a ponte com o C# poder ser testada sem alguém no
    // mouse — é o caminho novo do projeto, e o que mais merece teste.
    private readonly bool saveAndExit;

    public EditorWindow(string captureDataUrl, bool saveAndExit = false)
    {
        this.saveAndExit = saveAndExit;

        Text = "SnapLocal";
        Width = 1280;
        Height = 820;

        // O editor lê a captura da sessão, como na extensão.
        session["lastCapture"] = new JsonObject
        {
            ["dataUrl"] = captureDataUrl,
            ["title"] = "",
            ["url"] = "",
            ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
    }

    protected override Task ReadyAsync(CoreWebView2 core)
    {
        if (saveAndExit)
            core.NavigationCompleted += async (_, _) => await ClickSaveAndExitAsync(core);
        return Task.CompletedTask;
    }

    private async Task ClickSaveAndExitAsync(CoreWebView2 core)
    {
        // O editor monta a interface depois de carregar a captura, então não
        // basta a navegação ter terminado: o botão pode ainda não existir.
        for (int attempt = 0; attempt < 40; attempt++)
        {
            if (await core.ExecuteScriptAsync("!!document.getElementById('save')") == "true") break;
            await Task.Delay(100);
        }
        Log.Write("clicando em Salvar");
        await core.ExecuteScriptAsync("document.getElementById('save').click()");
        await Task.Delay(1500);
        Close();
    }

    protected override JsonNode? HandleOwn(string type, JsonObject payload) =>
        type == "save" ? Save(payload) : null;

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

        // askSaveLocation, a mesma configuração da extensão. O padrão continua
        // sendo salvar direto; quem liga a opção quer escolher a pasta.
        if (payload["saveAs"]?.GetValue<bool>() == true)
        {
            using var dialog = new SaveFileDialog
            {
                InitialDirectory = folder,
                FileName = Path.GetFileName(name),
                Filter = "PNG image|*.png",
                DefaultExt = "png",
                OverwritePrompt = true
            };
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                // Desistir não é falhar: quem chamou precisa da diferença para
                // não anunciar um erro que não houve.
                Log.Write("save cancelado pelo usuario");
                return new JsonObject { ["ok"] = false, ["canceled"] = true };
            }
            target = dialog.FileName;
        }

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
