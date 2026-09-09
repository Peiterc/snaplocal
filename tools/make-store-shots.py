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
    "01-area-selecionada": ("area", "overlay-harness", "overlay"),
    "02-borrao-e-tarja": ("blur",),
    "03-aviso-de-privacidade": ("warn",),
    "04-anotacoes": ("annotate",),
    "05-privacidade": ("options", "settings"),
}

TARGETS = {
    "chrome": (1280, 800),   # Chrome Web Store e AMO
    "edge": (1366, 768),     # Microsoft Edge Add-ons
}

# A nota de debug do harness fica no rodapé; some junto com o espaço morto.
# Só vale para os quadros que saem do harness: a tela de Opções não tem nota
# nenhuma, e cortá-la comeria justamente a seção Sobre.
TRIM_BOTTOM = 0.092
TRIMMED = {"01-area-selecionada", "02-borrao-e-tarja",
           "03-aviso-de-privacidade", "04-anotacoes"}


def background(image):
    """Amostra a cor do palco do editor, longe de qualquer conteúdo."""
    return image.convert("RGB").getpixel((int(image.width * 0.02), int(image.height * 0.45)))


def fit(image, size, fill):
    """Encaixa inteiro dentro do quadro e preenche o resto.

    Escalar pela largura funcionava para as capturas deitadas, mas a tela de
    Opcoes e uma coluna estreita e em pe: pela largura ela estouraria a altura e
    seria cortada justamente na secao de privacidade, que e o motivo do
    screenshot existir. Entao o fator e o menor dos dois.
    """
    target_w, target_h = size
    scale = min(target_w / image.width, target_h / image.height)
    scaled = image.resize((max(1, round(image.width * scale)),
                           max(1, round(image.height * scale))), Image.LANCZOS)

    frame = Image.new("RGB", size, fill)
    frame.paste(scaled, ((target_w - scaled.width) // 2,
                         (target_h - scaled.height) // 2))
    return frame


def main():
    if len(sys.argv) < 2:
        print("uso: python tools/make-store-shots.py <pasta-de-origem>")
        sys.exit(1)

    source = sys.argv[1]
    out_dir = os.path.join("docs", "store-assets", "screenshots")
    os.makedirs(out_dir, exist_ok=True)

    available = {os.path.splitext(f)[0].lower(): f
                 for f in os.listdir(source) if f.lower().endswith(".png")}

    found = 0
    for name, aliases in SHOTS.items():
        # Aceita o nome que o navegador deu ao arquivo, nao so o combinado. E
        # entre varios apelidos presentes vence o mais recente: uma recaptura
        # com nome diferente deve ganhar do arquivo velho, nao perder para ele.
        candidates = [available[a] for a in aliases if a in available]
        match = max(candidates,
                    key=lambda f: os.path.getmtime(os.path.join(source, f)),
                    default=None)
        if not match:
            print("%-24s ausente (procurei por: %s)" % (name, ", ".join(aliases)))
            continue
        found += 1
        path = os.path.join(source, match)

        image = Image.open(path).convert("RGB")
        fill = background(image)
        trim = TRIM_BOTTOM if name in TRIMMED else 0.0
        cropped = image.crop((0, 0, image.width, round(image.height * (1 - trim))))

        sizes = []
        for store, size in TARGETS.items():
            out = os.path.join(out_dir, "%s-%dx%d.png" % (name, size[0], size[1]))
            fit(cropped, size, fill).save(out, "PNG", optimize=True)
            sizes.append("%dx%d" % size)
        print("%-24s %s  %4dx%-4d -> %s  (fundo %s)"
              % (name, match, image.width, image.height,
                 ", ".join(sizes), "#%02x%02x%02x" % fill))

    print("\n%d de %d quadros processados, em %s" % (found, len(SHOTS), out_dir))
    if found < len(SHOTS):
        print("Os ausentes ainda precisam ser capturados.")


if __name__ == "__main__":
    main()
