#!/usr/bin/env python3
"""Gera as capturas do app de desktop para a Microsoft Store.

    python tools/make-app-shots.py

As capturas da extensão não servem aqui: elas mostram um navegador, e o que a
Store vende é um aplicativo. Estas saem das telas reais do app.

**Nada de tela real.** O conteúdo que aparece nas imagens é um documento falso
desenhado aqui, com nome, CPF, token e conta inventados — como manda a mesma
regra que vale para as capturas da extensão. A área de trabalho verdadeira
nunca entra: cada janela é fotografada pelo seu próprio retângulo, e o fundo
das imagens é o documento falso.

Requer Pillow, e o app já compilado (`dotnet build app/SnapLocal.App.csproj`).
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "app" / "bin" / "Debug" / "net10.0-windows10.0.19041.0" / "SnapLocal.exe"
WORK = ROOT / "dist" / "app" / "shots"
OUT = ROOT / "docs" / "store-assets" / "app-shots"

# A Store pede no mínimo 1366x768 para app de desktop. O tamanho sai da tela
# de verdade, e não de um número fixo: a sessão pode ter sido redimensionada, e
# aí o fundo falso sairia esticado sob a seleção.
MINIMO = (1366, 768)

TEXT = (0x1B, 0x1F, 0x24)
DIM = (0x6B, 0x72, 0x80)
ACCENT = (0x25, 0x63, 0xEB)


def font(size, bold=False):
    for name in (("segoeuib.ttf", "segoeui.ttf") if bold else ("segoeui.ttf",)):
        path = Path(os.environ["WINDIR"]) / "Fonts" / name
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def screen_size():
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Add-Type -AssemblyName System.Windows.Forms; "
         "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
         "Write-Output \"$($b.Width) $($b.Height)\""],
        capture_output=True, text=True)
    largura, altura = (int(n) for n in result.stdout.split())
    if largura < MINIMO[0] or altura < MINIMO[1]:
        sys.exit(f"ERRO: a tela tem {largura}x{altura} e a Store pede ao menos "
                 f"{MINIMO[0]}x{MINIMO[1]} — aumente a resolução e rode de novo")
    return largura, altura


def compose(window, target, canvas):
    """Uma janela recortada é menor que o mínimo da Store e fica flutuando no
    vazio. Sobre um fundo próprio, com sombra, ela vira uma cena.

    O fundo é liso de propósito: usar o documento falso aqui fazia sobrar
    pedaços de texto nas bordas, como se a imagem tivesse sido mal cortada."""
    fundo = Image.new("RGB", canvas, (0x0F, 0x17, 0x2A))
    desenho = ImageDraw.Draw(fundo)
    for y in range(canvas[1]):
        t = y / canvas[1]
        desenho.line([(0, y), (canvas[0], y)],
                     fill=(int(0x0F + 10 * t), int(0x17 + 14 * t), int(0x2A + 22 * t)))

    janela = Image.open(window).convert("RGB")
    if janela.width > canvas[0] - 120 or janela.height > canvas[1] - 120:
        janela.thumbnail((canvas[0] - 120, canvas[1] - 120))

    x = (canvas[0] - janela.width) // 2
    y = (canvas[1] - janela.height) // 2

    # Sombra: um retângulo escuro desfocado, e não uma borda dura.
    sombra = Image.new("L", canvas, 0)
    ImageDraw.Draw(sombra).rectangle(
        (x + 6, y + 14, x + janela.width + 6, y + janela.height + 18), fill=170)
    sombra = sombra.filter(ImageFilter.GaussianBlur(18))
    fundo.paste(Image.new("RGB", canvas, (0x03, 0x05, 0x0A)), (0, 0), sombra)

    fundo.paste(janela, (x, y))
    fundo.save(target)


def fake_desktop(size):
    """Uma janela de sistema com dados inventados, sobre um fundo neutro.

    É o que aparece "na tela" nas capturas: precisa parecer com o que alguém
    fotografaria de verdade, sem ser nada de ninguém.
    """
    image = Image.new("RGB", size, (0x0F, 0x17, 0x2A))
    draw = ImageDraw.Draw(image)

    # Um degradê discreto, para o fundo não parecer um retângulo chapado.
    for y in range(size[1]):
        t = y / size[1]
        draw.line([(0, y), (size[0], y)],
                  fill=(int(0x0F + 14 * t), int(0x17 + 18 * t), int(0x2A + 26 * t)))

    margem = int(size[0] * 0.10)
    card = (margem, int(size[1] * 0.14), size[0] - margem, int(size[1] * 0.88))
    draw.rounded_rectangle(card, 12, fill=(0xFF, 0xFF, 0xFF))
    draw.rounded_rectangle((card[0], card[1], card[2], card[1] + 48), 12,
                           fill=(0xF4, 0xF5, 0xF7))
    draw.text((card[0] + 24, card[1] + 15), "Cadastro do cliente — SIGEC",
              font=font(15), fill=DIM)

    x, y = card[0] + 48, card[1] + 100
    draw.text((x, y), "Painel da conta", font=font(34, bold=True), fill=TEXT)

    linhas = [
        ("Titular", "Maria Aparecida de Souza Lima"),
        ("CPF", "123.456.789-09"),
        ("Nascimento", "14/03/1987"),
        ("E-mail", "maria.souza@exemplo.com.br"),
        ("Token de acesso", "sk-9f4c2ae17b0d8e635a91cc47"),
        ("Endereço", "Rua das Acácias, 412 — apto 73 — São Paulo/SP"),
        ("Telefone", "(11) 98765-4321"),
        ("Agência e conta", "0341 / 88192-6"),
    ]
    y += 70
    for rotulo, valor in linhas:
        draw.text((x, y), rotulo, font=font(16), fill=DIM)
        draw.text((x + 240, y), valor, font=font(18), fill=TEXT)
        y += 46

    draw.rounded_rectangle((x, y + 20, x + 230, y + 74), 8, fill=ACCENT)
    draw.text((x + 36, y + 37), "Salvar alterações", font=font(17, bold=True),
              fill=(0xFF, 0xFF, 0xFF))

    caixa = (x, y + 110, card[2] - 48, card[3] - 40)
    draw.rounded_rectangle(caixa, 8, fill=(0x11, 0x18, 0x27))
    draw.text((caixa[0] + 20, caixa[1] + 18),
              '$ curl -H "Authorization: Bearer sk-9f4c2ae17b0d8e635a91cc47" https://api.exemplo.com',
              font=font(15), fill=(0x93, 0xC5, 0xFD))
    draw.text((caixa[0] + 20, caixa[1] + 48),
              '{ "status": "ok", "saldo": 12480.55, "id": 90128371 }',
              font=font(15), fill=(0x86, 0xEF, 0xAC))

    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / "desktop.png"
    image.save(path)
    return path


def crop(source, box, target):
    Image.open(source).crop(box).save(target)


CAPTURE = r"""
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  // PrintWindow com PW_RENDERFULLCONTENT (2) é o que captura janela desenhada
  // por composição de hardware. O WebView2 é uma dessas: com CopyFromScreen a
  // imagem sai inteiramente preta, sem erro nenhum para avisar.
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[Win]::SetProcessDPIAware() | Out-Null
$proc = Get-Process -Id %PID% -ErrorAction Stop
for ($i = 0; $i -lt 60 -and $proc.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 200; $proc.Refresh() }
[Win]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds %SETTLE%
$r = New-Object Win+RECT
[Win]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
$ok = [Win]::PrintWindow($proc.MainWindowHandle, $dc, 2)
$g.ReleaseHdc($dc)
$bmp.Save('%OUT%', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
if (-not $ok) { Write-Error "PrintWindow falhou" }
Write-Output "$w x $h"
"""


FULL = r"""
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System.Runtime.InteropServices;
public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[Dpi]::SetProcessDPIAware() | Out-Null
Start-Sleep -Milliseconds %SETTLE%
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $b.Size)
$bmp.Save('%OUT%', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "$($b.Width) x $($b.Height)"
"""


def shoot(args, target, settle=2500, full=False):
    """Abre o app no modo pedido, fotografa a janela dele e encerra.

    Só o retângulo da janela é capturado: o que estiver atrás na área de
    trabalho real não entra na imagem.
    """
    process = subprocess.Popen([str(EXE), *args])
    try:
        # A seleção não tem título nem barra, e o Windows não a considera
        # "janela principal" — mas ela cobre a tela inteira, então fotografar
        # a tela toda é fotografar só ela.
        script = ((FULL if full else CAPTURE)
                  .replace("%PID%", str(process.pid))
                  .replace("%OUT%", str(target))
                  .replace("%SETTLE%", str(settle)))
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Add-Type -AssemblyName System.Windows.Forms; " + script],
                                capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stdout, result.stderr)
            sys.exit(f"ERRO: não consegui fotografar {target.name}")
        print(f"{target.name:34} {result.stdout.strip()}")
    finally:
        process.terminate()
        time.sleep(0.8)


def main():
    if not EXE.is_file():
        sys.exit(f"ERRO: {EXE} não existe — compile o app antes")

    OUT.mkdir(parents=True, exist_ok=True)
    canvas = screen_size()
    desktop = fake_desktop(canvas)

    # 1. A seleção, com uma área já escolhida sobre o documento falso. A área
    #    é proporcional à tela, para cair sobre os dados sensíveis do
    #    documento em qualquer resolução.
    area = (int(canvas[0] * 0.20), int(canvas[1] * 0.32),
            int(canvas[0] * 0.52), int(canvas[1] * 0.30))
    shoot(["--shot-area", str(desktop), ",".join(str(n) for n in area)],
          OUT / "01-selecao.png", settle=3000, full=True)

    # 2. O editor com o recorte dessa mesma área: as duas imagens contam uma
    #    história só, como quem usou o app de verdade.
    recorte = WORK / "recorte.png"
    crop(desktop, (area[0], area[1], area[0] + area[2], area[1] + area[3]), recorte)
    bruto = WORK / "editor.png"
    shoot(["--shot-editor", str(recorte)], bruto, settle=7000)
    compose(bruto, OUT / "02-editor.png", canvas)

    # 3. As Opções, com a promessa de privacidade e os 11 idiomas.
    bruto = WORK / "opcoes.png"
    shoot(["--shot-options"], bruto, settle=6000)
    compose(bruto, OUT / "03-opcoes.png", canvas)

    print(f"\ncapturas em {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
