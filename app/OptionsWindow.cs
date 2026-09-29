using Microsoft.Web.WebView2.Core;

namespace SnapLocal;

/// <summary>
/// A tela de Opções — a mesma página da extensão. As linhas que não existem
/// fora do navegador se escondem sozinhas, pelo `features` declarado em
/// app/platform-desktop.js.
/// </summary>
sealed class OptionsWindow : WebHostWindow
{
    protected override string Page => "options/options.html";

    // Conferência automática: descreve o que a tela está mostrando e fecha.
    // Sem isso, conferir as Opções depende de alguém olhando — e a tela de
    // captura nem sempre está disponível para fotografar.
    private readonly bool dumpAndExit;

    public OptionsWindow(bool dumpAndExit = false)
    {
        this.dumpAndExit = dumpAndExit;

        Text = Strings.Get("options_title");
        Width = 820;
        Height = 900;
    }

    protected override async Task ReadyAsync(CoreWebView2 core)
    {
        if (!dumpAndExit) return;

        // Só na conferência: um coletor de erros, porque página que falha em
        // silêncio aparece como página vazia, e vazio não diz onde quebrou.
        await core.AddScriptToExecuteOnDocumentCreatedAsync(
            "window.__erros = [];" +
            "addEventListener('error', e => window.__erros.push(String(e.message || e.error)));" +
            "addEventListener('unhandledrejection', e => window.__erros.push('rejeicao: ' + (e.reason?.stack || e.reason)));");

        core.NavigationCompleted += async (_, _) => await DumpAsync(core);
    }

    private async Task DumpAsync(CoreWebView2 core)
    {
        for (int attempt = 0; attempt < 40; attempt++)
        {
            if (await core.ExecuteScriptAsync("!!document.getElementById('language')") == "true") break;
            await Task.Delay(100);
        }
        await Task.Delay(400);

        Log.Write("erros: " + await core.ExecuteScriptAsync("JSON.stringify(window.__erros)"));
        Log.Write("titulo: " + await core.ExecuteScriptAsync("document.querySelector('h1').textContent"));
        Log.Write("visiveis: " + await core.ExecuteScriptAsync(
            "JSON.stringify([...document.querySelectorAll('.row')].filter(r => !r.hidden).map(r => r.querySelector('label')?.textContent || r.textContent.trim().slice(0,30)))"));
        Log.Write("escondidas: " + await core.ExecuteScriptAsync(
            "JSON.stringify([...document.querySelectorAll('.row')].filter(r => r.hidden).map(r => r.dataset.only))"));
        Log.Write("privacidade: " + await core.ExecuteScriptAsync(
            "JSON.stringify([...document.querySelectorAll('li')].map(li => li.textContent))"));
        Log.Write("idioma automatico: " + await core.ExecuteScriptAsync(
            "document.getElementById('language').options[0].textContent"));
        Log.Write("versao: " + await core.ExecuteScriptAsync("document.getElementById('version').textContent"));
        Close();
    }
}
