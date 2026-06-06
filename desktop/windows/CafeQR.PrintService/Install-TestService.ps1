param(
    [Parameter(Mandatory = $true)]
    [string]$PublishDirectory
)

$ErrorActionPreference = "Stop"
$serviceName = "CafeQRPrintService"
$exe = Join-Path (Resolve-Path $PublishDirectory) "CafeQR.PrintService.exe"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "CafeQR.PrintService.exe was not found in $PublishDirectory"
}

if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
    Start-Sleep -Seconds 2
}

sc.exe create $serviceName binPath= "`"$exe`"" start= auto DisplayName= "CafeQR Print Service" | Out-Null
sc.exe description $serviceName "Durable local printing for CafeQR POS" | Out-Null
sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
sc.exe failureflag $serviceName 1 | Out-Null
Start-Service -Name $serviceName

Write-Host "CafeQR Print Service installed and started."
