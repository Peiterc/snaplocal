using Microsoft.Win32;

namespace SnapLocal;

/// <summary>
/// Iniciar junto com o Windows, pela chave Run do próprio usuário — nada de
/// serviço, nada de administrador, e o usuário pode desfazer no Gerenciador de
/// Tarefas sem passar pelo app.
/// </summary>
static class Startup
{
    private const string Key = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Name = "SnapLocal";

    public static bool Enabled
    {
        get
        {
            using RegistryKey? run = Registry.CurrentUser.OpenSubKey(Key);
            return run?.GetValue(Name) is not null;
        }
    }

    public static bool Set(bool enabled)
    {
        try
        {
            using RegistryKey run = Registry.CurrentUser.CreateSubKey(Key);
            if (enabled)
                run.SetValue(Name, $"\"{Environment.ProcessPath}\"");
            else
                run.DeleteValue(Name, throwOnMissingValue: false);
            return true;
        }
        catch (Exception error)
        {
            // Empacotado em MSIX isto muda de lugar: a Store usa StartupTask no
            // manifesto, e escritas no registro ficam virtualizadas no pacote.
            // Ver a Fase 5 em docs/roadmap-desktop.md.
            Log.Write($"startup {enabled} falhou: {error.Message}");
            return false;
        }
    }
}
