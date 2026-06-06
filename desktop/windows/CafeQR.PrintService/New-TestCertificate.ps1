$ErrorActionPreference = "Stop"
$certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=CafeQR Test Print Service" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(1)

$output = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "CafeQR-Test-CodeSigning.cer"
Export-Certificate -Cert $certificate -FilePath $output -Force | Out-Null

Write-Host "Test certificate thumbprint: $($certificate.Thumbprint)"
Write-Host "Public certificate exported to: $output"
Write-Host "Trust this certificate only on CafeQR Test machines."
