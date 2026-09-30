#!/usr/bin/env python3
"""Empacota o app de desktop em MSIX, o formato que a Microsoft Store aceita.

    python tools/make-msix.py            # gera dist/snaplocal-<versao>.msix
    python tools/make-msix.py --sign     # assina com certificado local, para instalar e testar
    python tools/make-msix.py --install   # assina e instala na máquina

Precisa do SDK do .NET. **Não precisa do Windows SDK instalado**: as duas
ferramentas necessárias (MakeAppx e SignTool) vêm de um pacote NuGet, baixado
sozinho na primeira execução. Isso mantém a mesma regra do resto do projeto —
quem clonar o repositório consegue reproduzir o pacote sem instalar nada além
do que já é preciso para compilar.

A identidade do pacote (nome, publisher e nome de exibição) fica em
`app/msix-identity.json`. Os valores que vêm ali são de teste e servem para
instalar localmente; **os definitivos saem do Partner Center**, na página de
identidade do produto, e sem eles a Store recusa o envio.

A assinatura é só para teste: o pacote enviado à Store é assinado por ela.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app" / "SnapLocal.App.csproj"
IDENTITY = ROOT / "app" / "msix-identity.json"
DIST = ROOT / "dist" / "app"
STAGE = DIST / "msix"

SDK_PACKAGE = "Microsoft.Windows.SDK.BuildTools"
CERT_SUBJECT_FILE = DIST / "test-cert.pfx"


def fail(message):
    print(f"ERRO: {message}")
    sys.exit(1)


def run(command, **kwargs):
    result = subprocess.run(command, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        fail(f"falhou: {' '.join(str(c) for c in command[:3])}...")
    return result.stdout


def sdk_tool(name):
    """MakeAppx e SignTool, do pacote NuGet — baixado se ainda não estiver aqui."""
    cache = Path(os.environ["USERPROFILE"]) / ".nuget" / "packages" / SDK_PACKAGE.lower()
    if not cache.is_dir():
        print(f"baixando {SDK_PACKAGE}...")
        scratch = DIST / "sdk-tools"
        scratch.mkdir(parents=True, exist_ok=True)
        (scratch / "tools.csproj").write_text(
            '<Project Sdk="Microsoft.NET.Sdk">'
            '<PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>'
            f'<ItemGroup><PackageReference Include="{SDK_PACKAGE}" Version="10.0.*" /></ItemGroup>'
            '</Project>', encoding="utf-8")
        run(["dotnet", "restore", str(scratch / "tools.csproj")])

    found = sorted(cache.rglob(f"x64/{name}"))
    if not found:
        fail(f"{name} não encontrado em {cache}")
    return found[-1]


def identity():
    if not IDENTITY.is_file():
        fail(f"{IDENTITY} não existe")
    data = json.loads(IDENTITY.read_text(encoding="utf-8"))
    for key in ("name", "publisher", "publisherDisplayName"):
        if not data.get(key):
            fail(f"{IDENTITY}: falta '{key}'")
    return data


def version():
    """A versão do app vem do csproj; o MSIX exige quatro números."""
    for line in APP.read_text(encoding="utf-8").splitlines():
        if "<Version>" in line:
            raw = line.split(">")[1].split("<")[0]
            parts = raw.split(".")
            while len(parts) < 4:
                parts.append("0")
            return ".".join(parts[:4])
    fail("não achei <Version> no csproj do app")


MANIFEST = """<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap5="http://schemas.microsoft.com/appx/manifest/uap/windows10/5"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap5 rescap">

  <Identity Name="{name}" Publisher="{publisher}" Version="{version}" ProcessorArchitecture="x64" />

  <Properties>
    <DisplayName>SnapLocal</DisplayName>
    <PublisherDisplayName>{publisherDisplayName}</PublisherDisplayName>
    <Logo>Assets\\msix\\StoreLogo.png</Logo>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>

  <Resources>
    <!-- Os idiomas que a interface realmente fala, lidos de src/_locales.
         Sem isto a Store anuncia "Inglês" e mais nada, e quem procura por
         idioma nao encontra o app. -->
{idiomas}
  </Resources>

  <Applications>
    <Application Id="SnapLocal" Executable="SnapLocal.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="SnapLocal"
        Description="Screenshots that stay on your computer."
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\msix\\Square150x150Logo.png"
        Square44x44Logo="Assets\\msix\\Square44x44Logo.png">
        <!-- Sem bloco grande: o Windows exige um Wide310x150Logo junto
             dele, e esticar uma marca quadrada em faixa fica pior do que
             não ter o bloco. -->
        <uap:DefaultTile
          Square71x71Logo="Assets\\msix\\Square71x71Logo.png" />
      </uap:VisualElements>

      <Extensions>
        <!-- Iniciar com o Windows, do jeito que um pacote MSIX faz. A chave
             Run do registro nao serve aqui: medido, a escrita e virtualizada
             para dentro do pacote e o Windows nunca ve. O estado comeca
             desligado e quem liga e o usuario, nas Opcoes. -->
        <uap5:Extension Category="windows.startupTask"
                        Executable="SnapLocal.exe"
                        EntryPoint="Windows.FullTrustApplication">
          <uap5:StartupTask TaskId="SnapLocalStartup" Enabled="false" DisplayName="SnapLocal" />
        </uap5:Extension>
      </Extensions>
    </Application>
  </Applications>

  <Capabilities>
    <!-- Todo app de desktop empacotado em MSIX declara isto: é o que diz que
         ele é um programa Win32 comum, e não um app de sandbox. Nenhuma outra
         capacidade é pedida — o SnapLocal não acessa rede, contatos, câmera
         nem nada além da própria tela. -->
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"""


def languages():
    """As pastas de src/_locales, na notação do Windows: pt_BR vira pt-br."""
    pastas = sorted(p.name for p in (ROOT / "src" / "_locales").iterdir() if p.is_dir())
    if not pastas:
        fail("nenhum idioma em src/_locales")
    marcas = [f'    <Resource Language="{nome.replace("_", "-").lower()}" />'
              for nome in pastas]
    return chr(10).join(marcas)


def publish():
    """Autocontido: o pacote leva o runtime do .NET junto, então a máquina de
    quem instala não precisa ter nada instalado."""
    if STAGE.exists():
        shutil.rmtree(STAGE, ignore_errors=True)
    print("compilando...")
    run(["dotnet", "publish", str(APP), "-c", "Release", "-r", "win-x64",
         "--self-contained", "true", "-o", str(STAGE), "--nologo", "-v", "quiet"])

    # O log de diagnóstico e as sondas de conferência não vão para a loja.
    for junk in list(STAGE.glob("*.pdb")) + list(STAGE.glob("snaplocal-app.log")):
        junk.unlink()


def pack(sign, install):
    data = identity()
    ver = version()

    (STAGE / "AppxManifest.xml").write_text(
        MANIFEST.format(version=ver, idiomas=languages(), **data), encoding="utf-8")

    DIST.mkdir(parents=True, exist_ok=True)
    package = DIST / f"snaplocal-{ver}.msix"
    if package.exists():
        package.unlink()

    run([str(sdk_tool("makeappx.exe")), "pack", "/d", str(STAGE), "/p", str(package), "/o"])
    size = package.stat().st_size / (1024 * 1024)
    print(f"\n{package.relative_to(ROOT)}  ({size:.0f} MB)")
    print(f"identidade: {data['name']}  publisher: {data['publisher']}  versao: {ver}")

    if sign or install:
        sign_package(package, data["publisher"])
    if install:
        print("\ninstalando...")
        # A mesma versão já instalada com conteúdo diferente é recusada, e
        # durante o desenvolvimento isso acontece a cada compilação. Remover
        # antes evita ter que inventar um número de versão a cada teste.
        run(["powershell", "-NoProfile", "-Command",
             f"Get-AppxPackage -Name '{data['name']}' | Remove-AppxPackage; "
             f"Add-AppxPackage -Path '{package}'"])
        print("instalado — procure SnapLocal no menu Iniciar")


def sign_package(package, publisher):
    """Certificado de teste, criado uma vez e reaproveitado. O assunto do
    certificado tem que ser idêntico ao Publisher do manifesto, senão o Windows
    recusa o pacote sem explicar direito o porquê."""
    password = "snaplocal"

    # O assunto do certificado tem que ser idêntico ao Publisher do manifesto.
    # Quando o publisher muda — e ele muda ao sair do valor de teste para o do
    # Partner Center — o certificado antigo deixa de servir, e o erro que o
    # Windows dá nesse caso não diz isso.
    marker = DIST / "test-cert-subject.txt"
    known = marker.read_text(encoding="utf-8").strip() if marker.exists() else ""
    if CERT_SUBJECT_FILE.exists() and known != publisher:
        print("publisher mudou; refazendo o certificado de teste")
        CERT_SUBJECT_FILE.unlink()

    if not CERT_SUBJECT_FILE.exists():
        print("criando certificado de teste...")
        run(["powershell", "-NoProfile", "-Command",
             f"$c = New-SelfSignedCertificate -Type Custom -Subject '{publisher}' "
             "-KeyUsage DigitalSignature -FriendlyName 'SnapLocal teste' "
             "-CertStoreLocation 'Cert:\\CurrentUser\\My' "
             "-TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}'); "
             f"$p = ConvertTo-SecureString -String '{password}' -Force -AsPlainText; "
             f"Export-PfxCertificate -Cert $c -FilePath '{CERT_SUBJECT_FILE}' -Password $p | Out-Null"])

    marker.write_text(publisher, encoding="utf-8")
    run([str(sdk_tool("signtool.exe")), "sign", "/fd", "SHA256",
         "/a", "/f", str(CERT_SUBJECT_FILE), "/p", password, str(package)])
    print("assinado com o certificado de teste (a Store assina o dela)")

    # O Windows recusa instalar pacote assinado por certificado desconhecido.
    # Confiar neste certificado vale só nesta máquina e só para teste; ele não
    # tem nada a ver com o pacote que vai para a Store, que ela mesma assina.
    trust = ("$p = ConvertTo-SecureString -String '%s' -Force -AsPlainText; "
             "$c = Get-PfxData -FilePath '%s' -Password $p; "
             "$leaf = $c.EndEntityCertificates[0]; "
             "$store = Get-Item 'Cert:\LocalMachine\TrustedPeople'; "
             "$store.Open('ReadWrite'); $store.Add($leaf); $store.Close(); "
             "Write-Output ('certificado de teste confiado: ' + $leaf.Subject)"
             % (password, CERT_SUBJECT_FILE))
    print(run(["powershell", "-NoProfile", "-Command", trust]).strip())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sign", action="store_true", help="assina com certificado local")
    parser.add_argument("--install", action="store_true", help="assina e instala na máquina")
    args = parser.parse_args()

    os.chdir(ROOT)
    publish()
    pack(args.sign, args.install)


if __name__ == "__main__":
    main()
