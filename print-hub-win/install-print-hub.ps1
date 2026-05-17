param(
  [int]$Port        = 3333,
  [string]$TaskName = "CafeQR Print Hub",
  [string]$RootDir  = $null
)

$ErrorActionPreference = 'Stop'

function Resolve-RootDir {
  param([string]$RootDir)
  if ($RootDir) {
    try {
      $candidate = $RootDir.Trim().Trim('"').TrimEnd('\')
      if (Test-Path -LiteralPath $candidate) {
        return (Resolve-Path -LiteralPath $candidate).Path
      }
    } catch { }
  }
  if ($PSScriptRoot -and (Test-Path -LiteralPath $PSScriptRoot)) { return $PSScriptRoot }
  if ($MyInvocation.MyCommand.Path) { return (Split-Path -Parent $MyInvocation.MyCommand.Path) }
  return (Get-Location).Path
}

$root = Resolve-RootDir -RootDir $RootDir
$scriptPath = Join-Path $root "print-hub.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  Write-Error "Cannot find print-hub.ps1 in: $root"
  exit 1
}

try {
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
} catch {
  Write-Warning "Could not set execution policy for current user: $($_.Exception.Message)"
}

try {
  $startupDir = [Environment]::GetFolderPath('Startup')
  if (-not (Test-Path -LiteralPath $startupDir)) {
    New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
  }
  $wsh        = New-Object -ComObject WScript.Shell
  $lnkPath    = Join-Path $startupDir "CafeQR Print Hub.lnk"
  $targetExe  = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File ""$scriptPath"" -Port $Port"
  $shortcut = $wsh.CreateShortcut($lnkPath)
  $shortcut.TargetPath       = $targetExe
  $shortcut.Arguments        = $arguments
  $shortcut.WorkingDirectory = Split-Path $scriptPath
  $shortcut.WindowStyle      = 7
  $shortcut.IconLocation     = "$env:SystemRoot\System32\shell32.dll,277"
  $shortcut.Save()
  Write-Host "[Startup] Shortcut created: $lnkPath"
} catch {
  Write-Warning "Could not create Startup shortcut: $($_.Exception.Message)"
}

try {
  $argList = @(
    '-NoProfile'
    '-WindowStyle','Hidden'
    '-ExecutionPolicy','Bypass'
    '-File', $scriptPath
    '-Port', $Port
  )
  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -ArgumentList $argList `
    -WorkingDirectory (Split-Path -Parent $scriptPath) `
    -WindowStyle Hidden
  Write-Host "CafeQR Print Hub started for this session."
} catch {
  Write-Warning "Could not start print-hub.ps1 immediately: $($_.Exception.Message)"
}
