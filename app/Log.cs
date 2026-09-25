namespace SnapLocal;

/// <summary>
/// Registro de diagnóstico da Fase 1, em %TEMP%\snaplocal-app.log. Serve para
/// enxergar a conversa entre a página e a casca enquanto a ponte é nova.
/// Some quando a Fase 2 substituir a ponte pela camada de plataforma.
/// </summary>
static class Log
{
    private static readonly string File = Path.Combine(Path.GetTempPath(), "snaplocal-app.log");

    // Uma captura vira centenas de milhares de caracteres em base64, e o log
    // deixa de ser legível. O começo da linha basta para saber o que passou.
    private const int Limit = 220;

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
