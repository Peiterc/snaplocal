import json, os, re, sys

BASE = "src/_locales"
REF = "en"
ok = True

def load(loc):
    p = os.path.join(BASE, loc, "messages.json")
    raw = open(p, "rb").read()
    raw.decode("utf-8")               # falha se nao for UTF-8
    if raw[:3] == b"\xef\xbb\xbf":
        print("  ERRO: %s tem BOM (Chrome rejeita)" % loc); return None
    return json.loads(raw.decode("utf-8"))

locales = sorted(d for d in os.listdir(BASE) if os.path.isdir(os.path.join(BASE, d)))
ref = load(REF)
print("Locales: %s" % ", ".join(locales))
print("Chaves na referencia (%s): %d\n" % (REF, len(ref)))

for loc in locales:
    data = load(loc)
    if data is None: ok = False; continue
    missing = [k for k in ref if k not in data]
    extra   = [k for k in data if k not in ref]
    print("[%s] %d chaves" % (loc, len(data)))
    if missing: print("  FALTANDO: %s" % missing); ok = False
    if extra:   print("  SOBRANDO: %s" % extra); ok = False

    for k, v in data.items():
        if "message" not in v:
            print("  ERRO: %s sem 'message'" % k); ok = False; continue
        used = set(x.lower() for x in re.findall(r"\$([A-Za-z0-9_]+)\$", v["message"]))
        declared = set(x.lower() for x in v.get("placeholders", {}))
        if used - declared:
            print("  ERRO: %s usa %s sem declarar" % (k, sorted(used - declared))); ok = False
        if declared - used:
            print("  ERRO: %s declara %s sem usar" % (k, sorted(declared - used))); ok = False
        refused = set(x.lower() for x in re.findall(r"\$([A-Za-z0-9_]+)\$", ref.get(k, {}).get("message", "")))
        if k in ref and used != refused:
            print("  ERRO: %s placeholders divergem do %s (%s vs %s)" % (k, REF, sorted(used), sorted(refused))); ok = False

    n = len(data["appDesc"]["message"])
    print("  appDesc: %d/132 caracteres %s" % (n, "OK" if n <= 132 else "ESTOUROU"))
    if n > 132: ok = False

    for k in ("opt_filename_pattern_hint",):
        tags = set(re.findall(r"\{([a-z]+)\}", data[k]["message"]))
        exp  = set(re.findall(r"\{([a-z]+)\}", ref[k]["message"]))
        if tags != exp:
            print("  ERRO: %s com tags alteradas: %s" % (k, sorted(tags))); ok = False
    print("")

print("RESULTADO: %s" % ("TUDO OK" if ok else "HA ERROS"))
sys.exit(0 if ok else 1)
