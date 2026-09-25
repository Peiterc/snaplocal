namespace SnapLocal;

/// <summary>
/// Os arquivos que vieram de `src/` por tools/sync-app-assets.py, mais o
/// ícone. Tudo fica ao lado do executável.
/// </summary>
static class AppAssets
{
    private static string Base =>
        Path.Combine(AppContext.BaseDirectory, "Assets");

    public static string WebFolder() => Path.Combine(Base, "web");

    public static string BridgeScript() =>
        File.ReadAllText(Path.Combine(Base, "bridge.js"));

    public static Icon Icon()
    {
        string path = Path.Combine(Base, "snaplocal.ico");
        return File.Exists(path) ? new Icon(path) : SystemIcons.Application;
    }
}
