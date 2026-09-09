#!/usr/bin/env python3
"""Ajusta capturas cruas para as dimensões que as lojas exigem.

    python tools/make-store-shots.py <pasta-de-origem>

As capturas saem do editor real, com a proporção da janela do navegador, que
nunca é a das lojas. Redimensionar direto distorceria; cortar para caber comeria
a barra de ferramentas. Então: corta o rodapé morto, escala pela largura e
centraliza numa moldura da cor do próprio fundo do editor — a borda resultante
parece intencional em vez de quebrada.

Requer Pillow.
"""
import os
import sys
from PIL import Image

# Nome do arquivo de origem -> prefixo numerado da saída. A ordem importa: o
# primeiro screenshot é a miniatura que a loja exibe na busca.
SHOTS = {
    "area": "01-area-selecionada",
    "blur": "02-borrao-e-tarja",
    "warn": "03-aviso-de-privacidade",
    "annotate": "04-anotacoes",
    "options": "05-privacidade",
}

TARGETS = {
    "chrome": (1280, 800),   # Chrome Web Store e AMO
    "edge": (1366, 768),     # Microsoft Edge Add-ons
}

# A nota de debug do harness fica no rodapé; some junto com o espaço morto.
TRIM_BOTTOM = 0.092


def background(image):
    """Amostra a cor do palco do editor, longe de qualquer conteúdo."""
    return image.convert("RGB").getpixel((int(image.width * 0.02), int(image.height * 0.45)))


def fit(image, size, fill):
    target_w, target_h = size
    scale = target_w / image.width
    scaled = image.resize((target_w, max(1, round(image.height * scale))), Image.LANCZOS)

    if scaled.height > target_h:
        # Alto demais mesmo depois de escalar: corta pelo rodapé, que é onde
        # sobra espaço, preservando a barra de ferramentas no topo.
        scaled = scaled.crop((0, 0, target_w, target_h))
        return scaled

    frame = Image.new("RGB", size, fill)
    frame.paste(scaled, (0, (target_h - scaled.height) // 2))
    return frame


def main():
    if len(sys.argv) < 2:
        print("uso: python tools/make-store-shots.py <pasta-de-origem>")
        sys.exit(1)

    source = sys.argv[1]
    out_dir = os.path.join("docs", "store-assets", "screenshots")
    os.makedirs(out_dir, exist_ok=True)

    found = 0
    for stem, name in SHOTS.items():
        path = os.path.join(source, stem + ".png")
        if not os.path.isfile(path):
            print("%-12s ausente" % stem)
            continue
        found += 1

        image = Image.open(path).convert("RGB")
        fill = background(image)
        cropped = image.crop((0, 0, image.width, round(image.height * (1 - TRIM_BOTTOM))))

        sizes = []
        for store, size in TARGETS.items():
            out = os.path.join(out_dir, "%s-%dx%d.png" % (name, size[0], size[1]))
            fit(cropped, size, fill).save(out, "PNG", optimize=True)
            sizes.append("%dx%d" % size)
        print("%-12s %4dx%-4d -> %s  (fundo %s)"
              % (stem, image.width, image.height, ", ".join(sizes), "#%02x%02x%02x" % fill))

    print("\n%d de %d quadros processados, em %s" % (found, len(SHOTS), out_dir))
    if found < len(SHOTS):
        print("Os ausentes ainda precisam ser capturados.")


if __name__ == "__main__":
    main()
