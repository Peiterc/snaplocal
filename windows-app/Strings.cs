using System.Globalization;
using System.Text.Json.Nodes;

namespace SnapLocal;

/// <summary>
/// Os textos da bandeja, lidos dos mesmos `_locales` que a extensão usa — os
/// arquivos vêm no pacote por tools/sync-app-assets.py. O editor e as opções
/// não passam por aqui: eles são páginas, e usam o `i18n.js` do projeto.
/// </summary>
static class Strings
{
    private static JsonObject? messages;

    /// <summary>
    /// O idioma escolhido nas Opções, ou o do Windows quando é "auto". Cai
    /// para o idioma base (pt-BR → pt) e, por fim, para o inglês, que é o
    /// único que se garante completo.
    /// </summary>
    private static IEnumerable<string> Candidates()
    {
        string chosen = Settings.All()["language"]?.GetValue<string>() ?? "auto";
        string system = CultureInfo.CurrentUICulture.Name.Replace('-', '_');

        if (chosen != "auto" && chosen.Length > 0) yield return chosen;
        yield return system;
        if (system.Contains('_')) yield return system.Split('_')[0];
        yield return "en";
    }

    private static JsonObject Load()
    {
        if (messages is not null) return messages;

        foreach (string locale in Candidates())
        {
            string path = Path.Combine(AppAssets.WebFolder(), "_locales", locale, "messages.json");
            if (!File.Exists(path)) continue;
            try
            {
                if (JsonNode.Parse(File.ReadAllText(path)) is JsonObject parsed)
                    return messages = parsed;
            }
            catch (Exception error)
            {
                Log.Write($"locale {locale} ilegivel: {error.Message}");
            }
        }
        return messages = new JsonObject();
    }

    /// <summary>
    /// Devolve a própria chave quando falta a tradução, como faz o i18n.js:
    /// texto faltando tem que gritar durante o desenvolvimento, não sumir.
    /// </summary>
    public static string Get(string key) =>
        (Load()[key] as JsonObject)?["message"]?.GetValue<string>() ?? key;

    /// <summary>Esquece o idioma carregado, para a bandeja acompanhar a troca.</summary>
    public static void Forget() => messages = null;
}
