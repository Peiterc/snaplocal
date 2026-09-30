using Microsoft.Win32;

namespace SnapLocal;

/// <summary>
/// Iniciar junto com o Windows. São dois mundos diferentes, e o app vive nos
/// dois:
///
///   • Instalado pela Store, em pacote MSIX, o caminho é a StartupTask
///     declarada no manifesto. A chave Run **não** serve: medido, a escrita é
///     virtualizada para dentro do pacote e o Windows nunca a enxerga — a
///     opção ficaria ligada na tela sem ter efeito nenhum.
///
///   • Rodando solto, durante o desenvolvimento, a StartupTask não existe e a
///     chave Run é o caminho certo. É do próprio usuário: sem serviço, sem
///     administrador, e dá para desfazer pelo Gerenciador de Tarefas.
/// </summary>
static class Startup
{
    private const string TaskId = "SnapLocalStartup";
    private const string Key = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Name = "SnapLocal";

    private static bool Packaged
    {
        get
        {
            try
            {
                return Windows.ApplicationModel.Package.Current is not null;
            }
            catch (Exception)
            {
                // Fora de um pacote, ler Package.Current lança. Não é erro:
                // é a resposta.
                return false;
            }
        }
    }

    public static bool Enabled => Packaged ? TaskEnabled() : RegistryEnabled();

    public static bool Set(bool enabled) => Packaged ? SetTask(enabled) : SetRegistry(enabled);

    /* ---------------- pacote MSIX ---------------- */

    private static Windows.ApplicationModel.StartupTask Task() =>
        System.Threading.Tasks.Task.Run(
            async () => await Windows.ApplicationModel.StartupTask.GetAsync(TaskId)).GetAwaiter().GetResult();

    private static bool TaskEnabled()
    {
        try
        {
            return Task().State == Windows.ApplicationModel.StartupTaskState.Enabled;
        }
        catch (Exception error)
        {
            Log.Write($"startup: estado indisponivel: {error.Message}");
            return false;
        }
    }

    private static bool SetTask(bool enabled)
    {
        try
        {
            Windows.ApplicationModel.StartupTask task = Task();
            if (!enabled)
            {
                task.Disable();
                return true;
            }

            var state = System.Threading.Tasks.Task.Run(
                async () => await task.RequestEnableAsync()).GetAwaiter().GetResult();

            // DisabledByUser e DisabledByPolicy são respostas legítimas do
            // Windows, não falhas nossas: quem desligou o app na lista de
            // inicialização mandou, e só de lá dá para religar.
            Log.Write($"startup: pedido resultou em {state}");
            return state == Windows.ApplicationModel.StartupTaskState.Enabled;
        }
        catch (Exception error)
        {
            Log.Write($"startup {enabled} falhou: {error.Message}");
            return false;
        }
    }

    /* ---------------- fora de pacote ---------------- */

    private static bool RegistryEnabled()
    {
        using RegistryKey? run = Registry.CurrentUser.OpenSubKey(Key);
        return run?.GetValue(Name) is not null;
    }

    private static bool SetRegistry(bool enabled)
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
            Log.Write($"startup {enabled} falhou: {error.Message}");
            return false;
        }
    }
}
