"""Builds a standalone side-by-side review sheet of every UI string.

Output is one self-contained HTML file with the data inlined, so it opens
straight from disk without a server and without loading the extension.
"""
import json, html, os

REF, TARGET = "en", "pt_BR"
BASE = "src/_locales"
OUT = "tools/strings-preview.html"

# Only used to group the table into readable sections.
SECTIONS = [
    ("Aplicativo / manifesto", ("locale_name", "appName", "appShortName", "appDesc")),
    ("Modos de captura", ("mode_",)),
    ("Popup", ("popup_",)),
    ("Menu de contexto", ("ctx_",)),
    ("Atalhos de teclado", ("cmd_",)),
    ("Overlay de selecao", ("overlay_",)),
    ("Delay", ("delay_",)),
    ("Pagina inteira", ("fullpage_",)),
    ("Editor", ("editor_", "tool_", "action_", "prop_")),
    ("Aviso de blur", ("blur_",)),
    ("Exportacao", ("export_",)),
    ("Mensagens rapidas", ("toast_",)),
    ("Opcoes", ("options_", "opt_")),
    ("Privacidade", ("privacy_",)),
    ("Sobre", ("about_",)),
    ("Erros", ("err_",)),
    ("Comuns", ("common_",)),
    ("Scaffolding (remover na 1.0)", ("dev_",)),
]

def load(loc):
    with open(os.path.join(BASE, loc, "messages.json"), encoding="utf-8") as f:
        return json.load(f)

ref, target = load(REF), load(TARGET)

def bucket(key):
    for i, (_, prefixes) in enumerate(SECTIONS):
        for p in prefixes:
            if key == p or key.startswith(p):
                return i
    return len(SECTIONS)

rows = []
for i, (title, _) in enumerate(SECTIONS):
    keys = [k for k in ref if bucket(k) == i]
    if not keys:
        continue
    rows.append('<tr class="sec"><th colspan="3">%s <span>%d</span></th></tr>'
                % (html.escape(title), len(keys)))
    for k in keys:
        a = ref[k]["message"]
        b = target.get(k, {}).get("message", "")
        note = ref[k].get("description", "")
        warn = ' class="warn"' if not b else ""
        rows.append(
            "<tr%s><td class=k><code>%s</code><em>%s</em></td>"
            "<td>%s</td><td>%s</td></tr>"
            % (warn, html.escape(k), html.escape(note), html.escape(a), html.escape(b))
        )

doc = """<!doctype html><html lang=pt-BR><meta charset=utf-8>
<title>Revisao de strings</title>
<style>
:root{--bg:#fff;--card:#fff;--bd:#e3e5e9;--tx:#1b1f24;--dim:#6b7280;--ac:#2563eb;--warnbg:#fff4ed;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#16181d;--card:#1e2126;--bd:#32363d;--tx:#e8eaed;--dim:#9aa1ab;--ac:#6b9bff;--warnbg:#3a2418;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.55 "Segoe UI",system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--card);border-bottom:1px solid var(--bd);padding:14px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:16px;margin:0}
#q{flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:inherit;font:inherit}
.count{color:var(--dim);font-size:12px}
.wrap{padding:0 24px 64px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:720px;margin-top:16px}
td,th{text-align:start;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--bd)}
thead th{position:sticky;top:57px;background:var(--bg);font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
tr.sec th{background:var(--card);font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ac);padding-top:22px}
tr.sec span{color:var(--dim);font-weight:400}
tr.warn{background:var(--warnbg)}
td.k{width:28%}
code{font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--ac);display:block}
em{display:block;color:var(--dim);font-size:11.5px;font-style:normal;margin-top:4px}
</style>
<header>
  <h1>Revisao de strings &mdash; EN &times; PT-BR</h1>
  <input id=q placeholder="Filtrar por chave ou texto...">
  <span class=count id=count></span>
</header>
<div class=wrap><table>
<thead><tr><th>Chave</th><th>English (referencia)</th><th>Portugues (Brasil)</th></tr></thead>
<tbody id=body>
__ROWS__
</tbody></table></div>
<script>
const body=document.getElementById('body'),q=document.getElementById('q'),count=document.getElementById('count');
const all=[...body.querySelectorAll('tr:not(.sec)')];
function refresh(){
  const term=q.value.toLowerCase();
  let shown=0;
  for(const tr of all){
    const hit=!term||tr.textContent.toLowerCase().includes(term);
    tr.hidden=!hit; if(hit)shown++;
  }
  for(const sec of body.querySelectorAll('tr.sec')){
    let n=0;
    for(let el=sec.nextElementSibling;el&&!el.classList.contains('sec');el=el.nextElementSibling)
      if(!el.hidden)n++;
    sec.hidden=n===0;
  }
  count.textContent=shown+' de '+all.length+' strings';
}
q.addEventListener('input',refresh);refresh();
</script>
</html>"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(doc.replace("__ROWS__", "\n".join(rows)))

print("gerado: %s (%d chaves)" % (OUT, len(ref)))
