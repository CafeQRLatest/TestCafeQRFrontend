param(
    [ValidateSet("net48", "net461")]
    [string]$TargetFramework = "net48",
    [string]$Configuration = "Release",
    [string]$Version = "2.0.11",
    [string]$CertificateThumbprint = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceProject = Join-Path $root "src\CafeQR.PrintService\CafeQR.PrintService.csproj"
$trayProject = Join-Path $root "src\CafeQR.PrintTray\CafeQR.PrintTray.csproj"
$publish = Join-Path $root "artifacts\$TargetFramework\publish"
$installer = Join-Path $root "artifacts\$TargetFramework\CafeQR-PrintService-$Version-$TargetFramework.msi"
$certificate = $null
$signtool = $null

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "The .NET SDK is required."
}
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    throw "WiX Toolset v4 is required. Install with: dotnet tool install --global wix"
}

Remove-Item -LiteralPath $publish -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $publish -Force | Out-Null

dotnet publish $serviceProject -c $Configuration -f $TargetFramework -o $publish -p:Version=$Version
if ($LASTEXITCODE -ne 0) { throw "Service publish failed with exit code $LASTEXITCODE." }
dotnet publish $trayProject -c $Configuration -f $TargetFramework -o $publish -p:Version=$Version
if ($LASTEXITCODE -ne 0) { throw "Tray publish failed with exit code $LASTEXITCODE." }

$serviceOutput = Join-Path $root "src\CafeQR.PrintService\bin\$Configuration\$TargetFramework"
foreach ($architecture in @("x86", "x64")) {
    $nativeSource = Join-Path $serviceOutput "$architecture\SQLite.Interop.dll"
    $nativeTargetDirectory = Join-Path $publish $architecture
    $nativeTarget = Join-Path $nativeTargetDirectory "SQLite.Interop.dll"

    if (-not (Test-Path -LiteralPath $nativeSource)) {
        throw "Required SQLite native runtime was not produced: $nativeSource"
    }

    New-Item -ItemType Directory -Path $nativeTargetDirectory -Force | Out-Null
    Copy-Item -LiteralPath $nativeSource -Destination $nativeTarget -Force

    if (-not (Test-Path -LiteralPath $nativeTarget)) {
        throw "Required SQLite native runtime was not staged: $nativeTarget"
    }
}

if ($CertificateThumbprint) {
    $certificate = Get-Item "Cert:\CurrentUser\My\$CertificateThumbprint" -ErrorAction Stop
    if (-not $certificate.HasPrivateKey) {
        throw "The selected signing certificate does not contain a private key."
    }
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    Get-ChildItem -LiteralPath $publish -Filter *.exe | ForEach-Object {
        if ($signtool) {
            & $signtool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $_.FullName
            if ($LASTEXITCODE -ne 0) { throw "Executable signing failed for $($_.Name)." }
        } else {
            $signature = Set-AuthenticodeSignature -LiteralPath $_.FullName -Certificate $certificate -HashAlgorithm SHA256
            if ($signature.Status -notin @("Valid", "UnknownError")) {
                throw "Executable signing failed for $($_.Name): $($signature.StatusMessage)"
            }
        }
    }
}

wix extension add WixToolset.Util.wixext/5.0.2
if ($LASTEXITCODE -ne 0) { throw "WiX utility extension installation failed." }
wix build (Join-Path $root "installer\Package.wxs") `
    -ext WixToolset.Util.wixext `
    -d "PublishDir=$publish" `
    -d "ServiceVersion=$Version" `
    -o $installer
if ($LASTEXITCODE -ne 0) { throw "MSI build failed with exit code $LASTEXITCODE." }

if ($CertificateThumbprint) {
    if ($signtool) {
        & $signtool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $installer
        if ($LASTEXITCODE -ne 0) { throw "MSI signing failed." }
    } else {
        $signature = Set-AuthenticodeSignature -LiteralPath $installer -Certificate $certificate -HashAlgorithm SHA256
        if ($signature.Status -notin @("Valid", "UnknownError")) {
            throw "MSI signing failed: $($signature.StatusMessage)"
        }
    }
}

Write-Host "Built $installer"
