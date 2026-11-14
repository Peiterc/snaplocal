namespace SnapLocal;

/// <summary>
/// Registro de diagnóstico da Fase 1, gravado ao lado do executável. Serve
/// para enxergar a conversa entre a página e a casca enquanto a ponte é nova,
/// e some quando a Fase 2 substituir a ponte pela camada de plataforma.
///
/// Ao lado do executável, e não em %TEMP%: a pasta temporária é por usuário, e
/// num Windows onde o app roda com uma conta e as ferramentas com outra, o log
/// simplesmente não é encontrado por quem foi procurar.
/// </summary>
static class Log
{
    private static readonly string File = Escolher();

    /// <summary>Onde dá para gravar.</summary>
    private static string Escolher()
    {
        // Ao lado do executável enquanto der: é o primeiro lugar onde quem
        // está depurando vai procurar.
        string aoLado = Path.Combine(AppContext.BaseDirectory, "snaplocal-app.log");
        try
        {
            System.IO.File.AppendAllText(aoLado, "");
            return aoLado;
        }
        catch (Exception)
        {
            // Instalado pela loja, o executável mora em WindowsApps, que é
            // somente leitura. O log não ia para lugar nenhum e a falha era
            // engolida logo abaixo: um relato de usuário virava adivinhação,
            // porque não havia o que ler. Medido ao investigar a tecla Print
            // Screen, quando não havia um único registro da máquina afetada.
            string pasta = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SnapLocal");
            Directory.CreateDirectory(pasta);
            return Path.Combine(pasta, "snaplocal-app.log");
        }
    }

    /// <summary>O arquivo em uso, para a tela de Opções poder dizer onde é.</summary>
    public static string Where => File;

    // Uma captura vira centenas de milhares de caracteres em base64, e o log
    // deixa de ser legível. O começo da linha basta para saber o que passou.
    private const int Limit = 420;

    public static void Write(string line)
    {
        if (line.Length > Limit) line = line[..Limit] + $"... (+{line.Length - Limit})";
        try
        {
            System.IO.File.AppendAllText(File, $"{DateTime.Now:HH:mm:ss.fff}  {line}{Environment.NewLine}");
        }
        catch (Exception)
        {
            // Diagnóstico que quebra o app é pior que diagnóstico nenhum.
        }
    }
}
