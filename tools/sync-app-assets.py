#!/usr/bin/env python3
"""Leva o editor da extensão para dentro do app de desktop.

    python tools/sync-app-assets.py

A regra do projeto é que `src/` não muda de forma para acomodar o app: ela é o
que a Mozilla revisa e o que o build.py empacota. Quem se adapta é o app, e é
isto que faz a adaptação — uma cópia, sem transformar nada.

Copia para `app/Assets/web/`:

    editor/     a página do editor, como está
    lib/        i18n, imaging, naming e platform
    _locales/   os 11 dicionários

E troca uma peça só: `lib/platform.js`, a implementação escrita sobre
`chrome.*`, dá lugar a `app/platform-desktop.js`, escrita sobre a ponte com o
processo em C#. O contrato entre as duas está documentado em
`src/lib/platform.js`. É por isso que o editor importa sempre o mesmo caminho e
nenhum dos dois pacotes carrega o código do outro.

Gera também `app/Assets/snaplocal.ico` a partir dos PNGs de `src/icons/`, que
é o formato que o Windows pede para o ícone da bandeja e do executável.
"""
import os
import shutil
import stat
import struct
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
WEB = ROOT / "app" / "Assets" / "web"
ICO = ROOT / "app" / "Assets" / "snaplocal.ico"
PLATFORM = ROOT / "app" / "platform-desktop.js"

# O que o editor precisa para rodar. O service worker e o content script ficam
# de fora: são a parte que só existe dentro de um navegador.
COPY = ["editor", "lib", "_locales"]

ICON_SIZES = [16, 32, 48, 128]


def fail(message):
    print(f"ERRO: {message}")
    sys.exit(1)


def _unlock(func, path, _exc):
    """Atributo somente-leitura derruba o rmtree no Windows; limpa e tenta de novo."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


def clean(path, attempts=6):
    """Mesma espera do tools/build.py: o OneDrive segura pastas que está
    sincronizando, e a falha é temporária."""
    for attempt in range(attempts):
        try:
            shutil.rmtree(path, onexc=_unlock)
            return
        except PermissionError:
            if attempt == attempts - 1:
                fail(f"nao consegui limpar {path} - feche o Explorer ou pause o OneDrive")
            time.sleep(0.4 * (attempt + 1))


def copy_web():
    if WEB.exists():
        clean(WEB)
    WEB.mkdir(parents=True)
    for name in COPY:
        source = SRC / name
        if not source.is_dir():
            fail(f"{source} não existe")
        shutil.copytree(source, WEB / name)
    if not PLATFORM.is_file():
        fail(f"{PLATFORM} não existe")
    target = WEB / "lib" / "platform.js"
    if not target.is_file():
        fail("src/lib/platform.js sumiu; o editor importa esse caminho")
    shutil.copyfile(PLATFORM, target)
    print(f"troca: lib/platform.js <- {PLATFORM.relative_to(ROOT)}")

    files = sorted(p for p in WEB.rglob("*") if p.is_file())
    total = sum(p.stat().st_size for p in files)
    print(f"web:  {len(files)} arquivos, {total / 1024:.0f} KB  ->  {WEB.relative_to(ROOT)}")


def build_ico():
    """Um .ico é um cabeçalho, uma entrada por imagem e as imagens em seguida.

    O formato aceita PNG embutido desde o Windows Vista, então dá para montar
    o arquivo com os PNGs que já existem, sem depender de biblioteca de imagem.
    """
    images = []
    for size in ICON_SIZES:
        png = SRC / "icons" / f"icon{size}.png"
        if not png.is_file():
            fail(f"{png} não existe")
        images.append((size, png.read_bytes()))

    header = struct.pack("<HHH", 0, 1, len(images))   # reservado, tipo 1 = ícone, quantidade
    offset = len(header) + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        # 0 no campo de tamanho significa 256; nenhum dos nossos chega lá.
        entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)

    ICO.parent.mkdir(parents=True, exist_ok=True)
    ICO.write_bytes(header + entries + blobs)
    print(f"ícone: {len(images)} tamanhos, {ICO.stat().st_size / 1024:.0f} KB  ->  {ICO.relative_to(ROOT)}")


def main():
    if not SRC.is_dir():
        fail("pasta src/ não encontrada")
    copy_web()
    build_ico()


if __name__ == "__main__":
    main()
