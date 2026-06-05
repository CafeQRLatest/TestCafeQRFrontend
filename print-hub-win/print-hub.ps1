param([int]$Port = 3333)

$ErrorActionPreference = 'Stop'

# ---- JSON COMPAT (PS2 fallback) -------------------------------------------
$script:HasConvertToJson   = !!(Get-Command ConvertTo-Json   -ErrorAction SilentlyContinue)
$script:HasConvertFromJson = !!(Get-Command ConvertFrom-Json -ErrorAction SilentlyContinue)

function New-JavaScriptSerializer {
  try { Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue } catch { }
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  try { $ser.MaxJsonLength = [Int32]::MaxValue } catch { }
  return $ser
}

function To-JsonCompat($obj) {
  if ($script:HasConvertToJson) { return ($obj | ConvertTo-Json -Depth 5) }
  $ser = New-JavaScriptSerializer
  return $ser.Serialize($obj)
}

function From-JsonCompat([string]$json) {
  if ($script:HasConvertFromJson) { return ($json | ConvertFrom-Json) }
  $ser = New-JavaScriptSerializer
  return $ser.DeserializeObject($json)
}

# ---- PRINTER ENUMERATION (Get-Printer or WMI fallback) --------------------
function Get-InstalledPrinters {
  if (Get-Command -Name Get-Printer -ErrorAction SilentlyContinue) {
    return (Get-Printer | Select-Object -ExpandProperty Name)
  }
  $printers = Get-WmiObject -Class Win32_Printer -ErrorAction SilentlyContinue
  if ($printers) { return ($printers | Select-Object -ExpandProperty Name) }
  return @()
}

# ---- RAW SPOOL HELPER ------------------------------------------------------
Add-Type -Language CSharp @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytes(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;

        DOCINFOA di = new DOCINFOA();
        di.pDocName = "CafeQR";
        di.pDataType = "RAW";
        di.pOutputFile = null;

        if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
        if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }

        IntPtr pUnmanagedBytes = Marshal.AllocHGlobal(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);

        int dwWritten = 0;
        bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);

        Marshal.FreeHGlobal(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return ok && dwWritten == bytes.Length;
    }
}
'@

function New-HubListener {
  param([int]$Port)
  $prefix = "http://127.0.0.1:$Port/"

  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Clear()
  $listener.Prefixes.Add($prefix)

  try {
    $listener.Start()
    return $listener, $prefix
  } catch {
    $msg     = $_.Exception.Message
    $account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

    if ($msg -match 'Access is denied' -or $msg -match 'conflicts with an existing registration' -or $msg -match 'failed to listen on prefix') {
      & netsh.exe http delete urlacl url=$prefix 2>$null | Out-Null
      & netsh.exe http add urlacl url=$prefix user="$account" listen=yes | Out-Null

      $listener = New-Object System.Net.HttpListener
      $listener.Prefixes.Clear()
      $listener.Prefixes.Add($prefix)
      $listener.Start()
      return $listener, $prefix
    }
    throw
  }
}

function Set-Cors([System.Net.HttpListenerResponse]$resp) {
  if (-not $resp) { return }
  $resp.Headers["Access-Control-Allow-Origin"]  = "*"
  $resp.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
  $resp.Headers["Access-Control-Allow-Headers"] = "Content-Type"
}

function Send-Json($ctx, [int]$status, $obj) {
  $resp = $ctx.Response
  Set-Cors $resp
  $json  = To-JsonCompat $obj
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $resp.StatusCode   = $status
  $resp.ContentType  = "application/json; charset=utf-8"
  $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  $resp.OutputStream.Close()
}

$listener = $null
try {
  $listener, $prefix = New-HubListener -Port $Port
} catch {
  exit 1
}

while ($true) {
  try {
    # Ensure listener is active and running (handles network state changes / wake from sleep)
    if ($null -eq $listener -or -not $listener.IsListening) {
      try {
        if ($null -ne $listener) { $listener.Close() }
      } catch {}
      $listener, $prefix = New-HubListener -Port $Port
    }

    $ctx = $listener.GetContext()

    # Process request in nested try-catch to keep listener running on handler errors
    try {
      $req  = $ctx.Request
      $resp = $ctx.Response

      if ($req.HttpMethod -eq 'OPTIONS') {
        Set-Cors $resp
        $resp.StatusCode = 204
        $resp.OutputStream.Close()
        continue
      }

      if ($req.HttpMethod -eq 'GET' -and $req.RawUrl -like '/health*') {
        Send-Json $ctx 200 @{
          ok   = $true
          host = [string]$env:COMPUTERNAME
          os   = [string][Environment]::OSVersion.VersionString
        }
        continue
      }

      if ($req.HttpMethod -eq 'GET' -and $req.RawUrl -like '/printers*') {
        $names = @(Get-InstalledPrinters) | ForEach-Object { [string]$_ }
        Send-Json $ctx 200 $names
        continue
      }

      if ($req.HttpMethod -eq 'POST' -and $req.RawUrl -like '/printRaw*') {
        $sr   = New-Object IO.StreamReader $req.InputStream, [Text.Encoding]::UTF8
        $raw  = $sr.ReadToEnd()
        $body = From-JsonCompat $raw

        $printerName = $null
        $dataBase64  = $null
        if ($body -is [System.Collections.IDictionary]) {
          $printerName = $body["printerName"]
          $dataBase64  = $body["dataBase64"]
        } else {
          $printerName = $body.printerName
          $dataBase64  = $body.dataBase64
        }

        if (-not $printerName -or -not $dataBase64) {
          Send-Json $ctx 400 @{ error = 'printerName and dataBase64 required' }
          continue
        }

        $bytes = [Convert]::FromBase64String($dataBase64)
        $ok    = [RawPrinterHelper]::SendBytes($printerName, $bytes)
        if (-not $ok) { Send-Json $ctx 500 @{ error = 'Raw print failed (check printer name / driver)' } }
        else { Send-Json $ctx 200 @{ ok = $true } }
        continue
      }

      Send-Json $ctx 404 @{ error = 'not found' }
    } catch {
      $err = $_.Exception.Message
      try { Send-Json $ctx 500 @{ error = "Internal handler error: $err" } } catch {}
    }
  } catch {
    # If the listener itself fails (e.g. system wake/sleep or socket conflicts), wait and retry
    Start-Sleep -Seconds 2
  }
}
