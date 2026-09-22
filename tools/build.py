#!/usr/bin/env python3
"""Builds the per-browser packages from the single source tree.

    python tools/build.py            # todos os alvos, com zip
    python tools/build.py edge       # um alvo só
    python tools/build.py --no-zip   # só as pastas, para carregar sem pacote

Edge e Chrome recebem o manifesto como está. O Firefox precisa de três ajustes,
todos aplicados aqui e nenhum no código-fonte:

  1. MV3 no Firefox não tem service worker: o background vira event page.
  2. O namespace `chrome` do Firefox é baseado em callback; só `browser`
     devolve promise. Como o projeto inteiro usa `await chrome.*`, um shim
     apelida um no outro antes de qualquer código rodar.
  3. A AMO exige um id de extensão declarado em browser_specific_settings.
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

TARGETS = ("edge", "chrome", "firefox")

# Trocar pelo id definitivo quando o repositório existir; a AMO amarra o id ao
# add-on para sempre, então mudá-lo depois cria uma extensão nova.
GECKO_ID = "snaplocal@peiterc.github.io"
# Derivado das APIs que a extensão usa, não estimado. Pelos dados de
# compatibilidade do MDN, o piso de cada uma é:
#
#   storage.session          115   <- o gargalo
#   background.type module   112
#   action.setBadgeText      109
#   scripting.executeScript  102
#   tabs.captureVisibleTab    47
#   downloads.download        47
#
# Estava em 128 por estimativa, o que excluía de graça quem está entre 115 e
# 127. A validação da AMO reclama se este número ficar abaixo do que o
# manifesto exige, então ele é conferível na submissão.
#
# A validação emite dois avisos aqui, e eles são esperados: o
# data_collection_permissions abaixo só é entendido a partir do Firefox 140
# (142 no Android). Não subir o piso para 140 é deliberado. A chave é inerte
# nas versões antigas — o validador a trata como aviso, não erro, justamente
# porque não quebra instalação — e subir custaria todo mundo entre 115 e 139,
# incluindo quem está em ESR. Alcance real vale mais que relatório limpo.
FIREFOX_MIN = "115.0"

SHIM = """/**
 * Firefox expõe as APIs com promise em `browser`; o namespace `chrome` dele é
 * baseado em callback. Apelidar um no outro deixa o mesmo código-fonte rodar
 * nos dois. No Chrome e no Edge `browser` não existe e isto não faz nada.
 *
 * Gerado por tools/build.py — não editar dentro de dist/.
 */
if (typeof globalThis.browser !== "undefined") {
  globalThis.chrome = globalThis.browser;
}
"""

SHIM_PATH = "lib/browser-polyfill.js"


def _unlock(func, path, _exc):
    """Read-only attributes stop rmtree on Windows; clear then retry once."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


def clean(path, attempts=6):
    """OneDrive keeps handles on folders it is syncing, so a fresh build can hit
    a transient PermissionError. Backing off a little clears it."""
    for attempt in range(attempts):
        try:
            shutil.rmtree(path, onexc=_unlock)
            return
        except PermissionError:
            if attempt == attempts - 1:
                fail(f"nao consegui limpar {path} - feche o Explorer ou pause o OneDrive")
            time.sleep(0.4 * (attempt + 1))


def fail(message):
    print(f"ERRO: {message}")
    sys.exit(1)


def check_locales():
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "check-locales.py")],
        cwd=ROOT, capture_output=True, text=True
    )
    if result.returncode != 0:
        print(result.stdout)
        fail("os dicionários não passaram na verificação")
    print("locales: OK")


def firefox_manifest(manifest):
    manifest = json.loads(json.dumps(manifest))
    manifest["background"] = {
        "scripts": [SHIM_PATH, "background/service-worker.js"],
        "type": "module",
    }
    # Chromium precisa de "split" para abrir o editor (uma página da própria
    # extensão) numa janela anônima. O Firefox não tem esse modo e, pior,
    # instala quem o pede como "not_allowed" — a extensão sumiria das janelas
    # privadas. Sem a chave ele fica no padrão, "spanning", que é o que a
    # própria Mozilla recomenda para extensões vindas do Chromium.
    manifest.pop("incognito", None)
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": GECKO_ID,
            "strict_min_version": FIREFOX_MIN,
            # Obrigatório para toda extensão nova na AMO desde 2025: o Firefox
            # mostra ao usuário, na instalação, o que a extensão coleta.
            # "none" é a declaração de que não coleta nada — que aqui é
            # literalmente verdade, e a mesma coisa que a política de
            # privacidade e o formulário do Chrome já afirmam.
            "data_collection_permissions": {"required": ["none"]}
        }
    }
    return manifest


def inject_shim(html_path, out_root):
    """Carrega o shim como script clássico antes de qualquer módulo da página.

    Em binário de propósito. Em modo texto o Windows traduz \\n para \\r\\n na
    escrita, então o build reescrevia o arquivo inteiro com outra quebra de
    linha: um `diff -r` entre o fonte e o pacote acusava as 180 linhas do HTML
    em vez da única que mudou, e o mesmo fonte gerava bytes diferentes conforme
    o sistema de quem compila.
    """
    rel = "/".join([".."] * (len(html_path.relative_to(out_root).parts) - 1)) or "."
    raw = html_path.read_bytes().decode("utf-8")
    # A linha inserida segue a convenção do próprio arquivo.
    newline = "\r\n" if "\r\n" in raw else "\n"
    anchor = '<meta charset="utf-8">'
    if anchor not in raw:
        fail(f"{html_path.name} sem <meta charset>, não sei onde inserir o shim")
    tag = f'{newline}  <script src="{rel}/{SHIM_PATH}"></script>'
    html_path.write_bytes(raw.replace(anchor, anchor + tag, 1).encode("utf-8"))


def build(target, make_zip):
    out = DIST / target
    if out.exists():
        clean(out)
    shutil.copytree(SRC, out)

    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))

    if target == "firefox":
        (out / SHIM_PATH).write_bytes(SHIM.encode("utf-8"))
        for html in sorted(out.rglob("*.html")):
            inject_shim(html, out)
        manifest = firefox_manifest(manifest)

    # Binário pelo mesmo motivo do inject_shim: em modo texto o Windows
    # traduziria cada \n para \r\n, e o mesmo fonte geraria um pacote com bytes
    # diferentes conforme o sistema de quem compila.
    (out / "manifest.json").write_bytes(
        (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    )

    files = sorted(p for p in out.rglob("*") if p.is_file())
    total = sum(p.stat().st_size for p in files)

    archive = ""
    if make_zip:
        zip_path = DIST / f"snaplocal-{target}-{manifest['version']}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for path in files:
                zf.write(path, path.relative_to(out))
        archive = f"  ->  {zip_path.name} ({zip_path.stat().st_size / 1024:.0f} KB)"

    print(f"{target:8} {len(files):3} arquivos, {total / 1024:.0f} KB{archive}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    make_zip = "--no-zip" not in sys.argv
    targets = args or list(TARGETS)
    for target in targets:
        if target not in TARGETS:
            fail(f"alvo desconhecido: {target} (use {', '.join(TARGETS)})")

    if not SRC.is_dir():
        fail("pasta src/ não encontrada")
    check_locales()
    DIST.mkdir(exist_ok=True)

    for target in targets:
        build(target, make_zip)

    print(f"\npacotes em {DIST.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
