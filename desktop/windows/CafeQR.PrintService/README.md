# CafeQR Windows Print Service

This replaces the legacy PowerShell Print Hub. It runs as a Windows Service,
persists accepted work in SQLite, consumes leased cloud print jobs, and exposes
a loopback API for the CafeQR web application.

## Targets

- `net48`: Windows 7 SP1, Windows 8.1, Windows 10, and Windows 11.
- `net461`: Windows 8.0 compatibility build.

Windows 7, Windows 8.0, and Windows 8.1 are no longer supported by Microsoft.
The compatibility targets do not restore operating-system security support.

## Local API

- `GET /v1/health`
- `GET /v1/printers`
- `GET /v1/jobs`
- `POST /v1/jobs`
- `POST /v1/jobs/{id}/retry`
- `POST /v1/jobs/{id}/resolve`
- `POST /v1/enroll`
- `PUT /v1/configuration`
- `GET /v1/logs`

Legacy `/health`, `/printers`, and `/printRaw` endpoints remain available while
existing CafeQR terminals migrate to the new gateway.

The service binds only to `127.0.0.1:3333`. Mutating V1 endpoints require the
local client token returned after station enrollment.

## Build

Run `build-service.ps1` from an elevated PowerShell prompt on a build machine
with the .NET SDK, WiX Toolset `5.0.2`, and an Authenticode signing certificate.
Test builds can use `New-TestCertificate.ps1`; commit only the exported public
certificate, never the private key. Production builds must use a trusted
code-signing certificate and Windows SDK SignTool so executables and MSI files
are SHA-256 signed and timestamped.

```powershell
dotnet tool install --global wix --version 5.0.2
.\New-TestCertificate.ps1
.\build-service.ps1 -TargetFramework net48 -CertificateThumbprint <thumbprint>
.\build-service.ps1 -TargetFramework net461 -CertificateThumbprint <thumbprint>
```

The build fails if either `x86\SQLite.Interop.dll` or
`x64\SQLite.Interop.dll` is missing from the MSI staging directory. Both native
runtimes are required because the Windows Service uses the durable SQLite print
queue.

## Test installation

Build an incremented MSI, then install it from an elevated PowerShell prompt:

```powershell
.\build-service.ps1 `
  -TargetFramework net48 `
  -Version 2.0.4 `
  -CertificateThumbprint <thumbprint>

Start-Process msiexec.exe -Verb RunAs -Wait -ArgumentList @(
  '/i',
  "`"$PWD\artifacts\net48\CafeQR-PrintService-2.0.4-net48.msi`""
)
```

Verify the service before pairing it in CafeQR:

```powershell
Get-Service CafeQRPrintService
Invoke-RestMethod http://127.0.0.1:3333/v1/health
```

If installation reports that the service failed to start, do not keep retrying.
Check the `CafeQRPrintService` entries in Windows Application Event Log. A
`SQLite.Interop.dll` error means the MSI payload is incomplete and must be
rebuilt.

After the health endpoint responds, open **System Configurations > Hardware**:

1. Select the POS terminal and enter a station name.
2. Create a pairing code and pair this computer.
3. Create printer profiles and run a test print for each profile.
4. Configure bill and KOT routing.
5. Confirm completed and failed work in the local Print Queue.
