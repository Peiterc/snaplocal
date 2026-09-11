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
# ES modules em background script exigem Firefox recente. Confirmar num Firefox
# de verdade antes de submeter: é o único ponto do build ainda não verificado.
FIREFOX_MIN = "128.0"

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
    manifest["browser_specific_settings"] = {
        "gecko": {"id": GECKO_ID, "strict_min_version": FIREFOX_MIN}
    }
    return manifest


def inject_shim(html_path, out_root):
    """Carrega o shim como script clássico antes de qualquer módulo da página."""
    rel = "/".join([".."] * (len(html_path.relative_to(out_root).parts) - 1)) or "."
    text = html_path.read_text(encoding="utf-8")
    tag = f'\n  <script src="{rel}/{SHIM_PATH}"></script>'
    if '<meta charset="utf-8">' not in text:
        fail(f"{html_path.name} sem <meta charset>, não sei onde inserir o shim")
    html_path.write_text(
        text.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + tag, 1),
        encoding="utf-8",
    )


def build(target, make_zip):
    out = DIST / target
    if out.exists():
        clean(out)
    shutil.copytree(SRC, out)

    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))

    if target == "firefox":
        (out / SHIM_PATH).write_text(SHIM, encoding="utf-8")
        for html in sorted(out.rglob("*.html")):
            inject_shim(html, out)
        manifest = firefox_manifest(manifest)

    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
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
