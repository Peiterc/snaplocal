#!/usr/bin/env python3
"""Monta o pacote de código-fonte que a AMO pede.

    python tools/make-source-zip.py

A Mozilla exige o fonte de toda extensão cujo pacote passe por qualquer
processamento — e o nosso passa, ainda que trivial: o build gera o polyfill do
Firefox, injeta uma tag nos HTMLs e reescreve o manifesto.

Leva só o necessário para reproduzir o pacote. Fica de fora o que é resultado
(`dist/`), o que é histórico (`.git/`) e o que é material de loja: screenshots e
imagens promocionais pesam megabytes e não ajudam ninguém a reproduzir nada.
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "dist")

# O que reproduz o pacote, e mais nada.
INCLUDE_DIRS = ["src", "tools"]
INCLUDE_FILES = ["BUILD.md", "README.md", "LICENSE", "CONTRIBUTING.md"]

SKIP_SUFFIXES = (".pyc", ".zip", ".png")
SKIP_NAMES = {"strings-preview.html"}   # gerado por build-strings-preview.py


def keep(path):
    name = os.path.basename(path)
    if name in SKIP_NAMES:
        return False
    # Os ícones em src/icons/ são parte da extensão e precisam ir junto; as
    # outras imagens do projeto, não.
    if path.endswith(".png"):
        return os.path.sep + os.path.join("src", "icons") + os.path.sep in path
    return not path.endswith(SKIP_SUFFIXES)


def main():
    version = __import__("json").load(
        open(os.path.join(ROOT, "src", "manifest.json"), encoding="utf-8"))["version"]
    out = os.path.join(OUT_DIR, "snaplocal-source-%s.zip" % version)
    os.makedirs(OUT_DIR, exist_ok=True)

    entries = []
    for folder in INCLUDE_DIRS:
        for base, _, files in os.walk(os.path.join(ROOT, folder)):
            if "__pycache__" in base:
                continue
            for f in files:
                full = os.path.join(base, f)
                if keep(full):
                    entries.append(full)
    for f in INCLUDE_FILES:
        full = os.path.join(ROOT, f)
        if os.path.isfile(full):
            entries.append(full)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for full in sorted(entries):
            zf.write(full, os.path.relpath(full, ROOT).replace(os.path.sep, "/"))

    print("%s  (%d arquivos, %d KB)"
          % (out, len(entries), os.path.getsize(out) // 1024))
    print("\ninstrucoes de build: BUILD.md, na raiz do pacote")


if __name__ == "__main__":
    main()
