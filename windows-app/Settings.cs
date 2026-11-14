using System.Text.Json;
using System.Text.Json.Nodes;

namespace SnapLocal;

/// <summary>
/// O equivalente ao chrome.storage.local: um arquivo JSON na pasta do usuário.
/// Nada sai daqui, como na extensão.
/// </summary>
static class Settings
{
    private static readonly string Folder =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SnapLocal");

    private static readonly string File = Path.Combine(Folder, "settings.json");

    private static JsonObject? cache;

    public static JsonObject All()
    {
        if (cache is not null) return cache;
        try
        {
            if (System.IO.File.Exists(File))
                cache = JsonNode.Parse(System.IO.File.ReadAllText(File)) as JsonObject;
        }
        catch (Exception)
        {
            // Arquivo corrompido não pode impedir o app de abrir: as
            // configurações voltam ao padrão e a vida segue.
            cache = null;
        }
        return cache ??= new JsonObject();
    }

    public static void Merge(JsonObject items)
    {
        JsonObject all = All();
        foreach (KeyValuePair<string, JsonNode?> item in items)
            all[item.Key] = item.Value?.DeepClone();

        Directory.CreateDirectory(Folder);
        System.IO.File.WriteAllText(File, all.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }
}
