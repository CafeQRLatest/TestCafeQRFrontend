@echo off
setlocal enabledelayedexpansion

echo ==============================================
echo Installing CafeQR Windows Print Service...
echo ==============================================
echo.

:: Ensure administrative privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Please run this batch script as an Administrator.
    echo Right-click on install.bat and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

:: Find the C# Compiler
set "CSC_PATH="
for %%D in (Framework64 Framework) do (
    if exist "C:\Windows\Microsoft.NET\%%D\v4.0.30319\csc.exe" (
        set "CSC_PATH=C:\Windows\Microsoft.NET\%%D\v4.0.30319\csc.exe"
        goto :compile
    )
)

:compile
if "%CSC_PATH%"=="" (
    echo [ERROR] Microsoft .NET Framework 4.0 compiler (csc.exe) was not found.
    echo Please ensure .NET Framework is installed on this PC.
    echo.
    pause
    exit /b 1
)

echo [INFO] Found C# Compiler at: %CSC_PATH%
echo [INFO] Compiling CafeQRPrintHub.cs...

cd /d "%~dp0"
"%CSC_PATH%" /target:exe /out:CafeQRPrintHub.exe /r:System.dll,System.ServiceProcess.dll,System.Web.Extensions.dll,System.Drawing.dll CafeQRPrintHub.cs

if %errorLevel% neq 0 (
    echo [ERROR] Compilation failed. Please inspect the code for errors.
    echo.
    pause
    exit /b 1
)

echo [INFO] Compilation successful: CafeQRPrintHub.exe created.
echo.

:: Service Management
echo [INFO] Configuring Windows Service...

sc query CafeQRPrintHub >nul 2>&1
if %errorLevel% eq 0 (
    echo [INFO] Stopping existing service...
    net stop CafeQRPrintHub >nul 2>&1
    echo [INFO] Deleting existing service...
    sc delete CafeQRPrintHub >nul 2>&1
    timeout /t 2 >nul
)

sc.exe create CafeQRPrintHub binPath= "%~dp0CafeQRPrintHub.exe" start= auto DisplayName= "CafeQR Local Print Hub"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to register service with Service Control Manager.
    echo.
    pause
    exit /b 1
)

sc.exe failure CafeQRPrintHub reset= 86400 actions= restart/60000/restart/60000/restart/60000
if %errorLevel% neq 0 (
    echo [WARNING] Failed to set auto-restart failure recovery rules.
)

echo [INFO] Starting CafeQR Local Print Hub...
net start CafeQRPrintHub

echo.
echo ==============================================
echo Installation Completed Successfully!
echo CafeQR Windows Print Service is running on http://127.0.0.1:3333
echo ==============================================
echo.
pause
exit /b 0
