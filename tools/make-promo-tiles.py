#!/usr/bin/env python3
"""Gera os blocos promocionais das lojas.

    python tools/make-promo-tiles.py

São opcionais para publicar, mas é com eles que a loja monta carrossel e
coleção em destaque — sem os blocos, a extensão fica fora dessas vitrines.

    440 x 280   bloco pequeno (Edge e Chrome)
   1400 x 560   bloco grande / marquee

Reaproveita o logo gerado por make-icons.py, então a identidade não diverge.
Requer Pillow.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

LOGO = os.path.join("docs", "store-assets", "logo-300.png")
OUT_DIR = os.path.join("docs", "store-assets")

# Mesmo azul dos ícones. O gradiente vai do claro no canto superior esquerdo
# para o escuro no inferior direito, dando profundidade sem ruído.
TOP = (0x3B, 0x82, 0xF6)
BOTTOM = (0x1D, 0x4E, 0xD8)

FONTS = {
    "bold": ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"],
    "regular": ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"],
}

# O bloco pequeno tem 440 px de largura: a linha longa encostava na borda.
TAGLINES_SMALL = ("Capture \u00b7 Annotate \u00b7 Blur", "100% local. No cloud.")
TAGLINES_LARGE = ("Capture \u00b7 Annotate \u00b7 Blur", "100% local. No cloud, no tracking.")


def font(kind, size):
    for name in FONTS[kind]:
        for folder in (os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts"),
                       "/usr/share/fonts/truetype/dejavu"):
            path = os.path.join(folder, name)
            if os.path.isfile(path):
                return ImageFont.truetype(path, size)
    raise SystemExit("nenhuma fonte encontrada: %s" % ", ".join(FONTS[kind]))


def gradient(size):
    """Monta o gradiente pequeno e amplia: interpolar na ampliação sai mais
    liso, e muito mais rápido, do que calcular pixel a pixel no tamanho final."""
    small = Image.new("RGB", (64, 64))
    pixels = small.load()
    for y in range(64):
        for x in range(64):
            t = (x / 63 + y / 63) / 2
            pixels[x, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return small.resize(size, Image.BICUBIC)


def tile(size, logo_size, logo_xy, title_xy, title_size, line_gap, body_size, taglines):
    image = gradient(size)
    logo = Image.open(LOGO).convert("RGBA").resize((logo_size, logo_size), Image.LANCZOS)
    image.paste(logo, logo_xy, logo)

    draw = ImageDraw.Draw(image, "RGBA")
    draw.text(title_xy, "SnapLocal", font=font("bold", title_size), fill=(255, 255, 255, 255))

    x, y = title_xy[0] + 3, title_xy[1] + title_size + line_gap
    body = font("regular", body_size)
    for i, line in enumerate(taglines):
        # A segunda linha é a promessa, não a lista de recursos: fica um pouco
        # mais apagada para a hierarquia ficar clara num bloco pequeno.
        draw.text((x, y + i * (body_size + 10)), line, font=body,
                  fill=(255, 255, 255, 255 if i == 0 else 205))
    return image


def main():
    if not os.path.isfile(LOGO):
        raise SystemExit("rode antes: python tools/make-icons.py")

    small = tile((440, 280), 108, (40, 86), (172, 92), 40, 14, 16, TAGLINES_SMALL)
    large = tile((1400, 560), 264, (150, 148), (478, 158), 108, 34, 38, TAGLINES_LARGE)

    for name, image in (("promo-440x280", small), ("promo-1400x560", large)):
        path = os.path.join(OUT_DIR, name + ".png")
        image.save(path, "PNG", optimize=True)
        print("%-38s %dx%d, %d bytes" % (path, image.width, image.height, os.path.getsize(path)))


if __name__ == "__main__":
    main()
