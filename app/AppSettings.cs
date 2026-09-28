using System.Reflection;
using System.Text.Json.Nodes;

namespace SnapLocal;

/// <summary>
/// As configurações que não param no arquivo: ligar "iniciar com o Windows"
/// mexe no registro, e ligar a tecla Print Screen depende de o Windows
/// devolver a tecla. Quem grava passa por aqui para que o efeito aconteça.
/// </summary>
static class AppSettings
{
    /// <summary>
    /// Quem sabe registrar atalhos. A bandeja preenche isto ao iniciar; o
    /// retorno diz se o Windows entregou a tecla pedida.
    /// </summary>
    public static Func<bool, bool>? ApplyHotkeyMode;

    public static string Version =>
        Assembly.GetExecutingAssembly().GetName().Version is { } v
            ? $"{v.Major}.{v.Minor}.{v.Build}"
            : "0.0.0";

    /// <summary>
    /// Aplica o que tem efeito fora do arquivo. Devolve false quando o sistema
    /// recusou — hoje, só a tecla Print Screen recusa.
    /// </summary>
    public static bool Apply(JsonObject items)
    {
        bool ok = true;

        if (items["startWithWindows"] is JsonNode startup)
            ok &= Startup.Set(startup.GetValue<bool>());

        if (items["usePrintScreen"] is JsonNode printScreen)
            ok &= ApplyHotkeyMode?.Invoke(printScreen.GetValue<bool>()) ?? true;

        if (items["language"] is not null)
            Strings.Forget();   // a bandeja é remontada no idioma novo

        return ok;
    }
}
