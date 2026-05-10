@echo off
chcp 65001 >nul
echo.
echo ╔════════════════════════════════════════╗
echo ║     Discord Updater - Build Script     ║
echo ╚════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Node.js ist nicht installiert!
    echo         Bitte Node.js von https://nodejs.org/ herunterladen ^(v18+^)
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node --version') do set NODE_VER=%%a
echo [OK] Node.js gefunden: %NODE_VER%

:: Install dependencies
echo.
echo [INFO] Installiere Abhaengigkeiten...
call npm install
if errorlevel 1 (
    echo [FEHLER] npm install fehlgeschlagen!
    pause
    exit /b 1
)

:: Build
echo.
echo [INFO] Baue Windows-Installer...
call npm run build
if errorlevel 1 (
    echo [FEHLER] Build fehlgeschlagen!
    pause
    exit /b 1
)

echo.
echo [OK] Build abgeschlossen!
echo      Der Installer befindet sich im "dist" Ordner.
echo.
pause
