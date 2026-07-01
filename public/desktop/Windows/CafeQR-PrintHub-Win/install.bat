@echo off
REM ================================================================
REM CafeQR Local Print Hub - Windows Service Installer
REM Compatible with Windows 7, 8, 8.1, 10, and 11
REM ================================================================

REM --- Self-relaunch wrapper: keeps the window open no matter what ---
REM When right-clicked "Run as administrator", Windows opens a new
REM cmd.exe that closes on exit. This wrapper relaunches the script
REM inside a persistent cmd /k window so errors are always visible.
if "%~1"=="" (
    cmd /k "%~f0" run
    exit /b
)

echo.
echo ==============================================
echo   CafeQR Local Print Hub - Installer
echo ==============================================
echo.

REM --- Check for Administrator privileges ---
net session >nul 2>&1
IF ERRORLEVEL 1 (
    echo [ERROR] This script must be run as Administrator.
    echo.
    echo Please right-click install.bat and select
    echo "Run as administrator".
    echo.
    goto done
)

REM --- Change to the folder where install.bat lives ---
cd /d "%~dp0"
echo [INFO] Working directory: %cd%
echo.

REM --- Stop existing service if running (unlocks the .exe file) ---
echo [INFO] Checking for existing service...
sc query CafeQRPrintHub >nul 2>&1
IF NOT ERRORLEVEL 1 (
    echo [INFO] Stopping existing CafeQR Print Hub service...
    net stop CafeQRPrintHub
    echo.
)

REM --- Find the C# compiler ---
set "CSC="

if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if "%CSC%"=="" if exist "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if "%CSC%"=="" (
    echo [ERROR] C# compiler csc.exe was not found on this PC.
    echo.
    echo .NET Framework 4.0 or later is required.
    echo It is included by default on Windows 8 and later.
    echo For Windows 7, install it from:
    echo https://dotnet.microsoft.com/download/dotnet-framework
    echo.
    goto done
)

echo [INFO] Found compiler: %CSC%

REM --- Compile the C# source into an executable ---
echo [INFO] Compiling CafeQRPrintHub.cs...
echo.

"%CSC%" /target:exe /out:CafeQRPrintHub.exe /r:System.dll,System.ServiceProcess.dll,System.Web.Extensions.dll,System.Drawing.dll CafeQRPrintHub.cs

IF ERRORLEVEL 1 (
    echo.
    echo [ERROR] Compilation failed. See errors above.
    echo.
    goto done
)

echo.
echo [OK] CafeQRPrintHub.exe compiled successfully.
echo.

REM --- Remove old service registration if it exists ---
sc query CafeQRPrintHub >nul 2>&1
IF NOT ERRORLEVEL 1 (
    echo [INFO] Removing old service registration...
    sc delete CafeQRPrintHub >nul 2>&1
)

REM --- Register the new service ---
echo [INFO] Registering Windows service...
sc.exe create CafeQRPrintHub binPath= "%~dp0CafeQRPrintHub.exe" start= auto DisplayName= "CafeQR Local Print Hub"

IF ERRORLEVEL 1 (
    echo.
    echo [ERROR] Failed to register the service.
    echo.
    goto done
)

REM --- Set auto-restart on crash ---
sc.exe failure CafeQRPrintHub reset= 86400 actions= restart/60000/restart/60000/restart/60000 >nul 2>&1

REM --- Start the service ---
echo [INFO] Starting CafeQR Local Print Hub...
net start CafeQRPrintHub

IF ERRORLEVEL 1 (
    echo.
    echo [ERROR] Service failed to start. Check Windows Event Viewer for details.
    echo.
    goto done
)

echo.
echo ==============================================
echo   Installation Completed Successfully!
echo.
echo   Print service is running on:
echo   http://127.0.0.1:3333
echo.
echo   The service will start automatically
echo   whenever Windows boots up.
echo ==============================================
echo.

:done
echo.
echo Press any key to close this window...
pause >nul
