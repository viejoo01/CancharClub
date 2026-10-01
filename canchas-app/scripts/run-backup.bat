@echo off
REM ==============================================================================
REM CancharClub — Ejecutor rápido de Respaldo Semanal
REM ==============================================================================
echo ================================================================
echo   Iniciando respaldo de base de datos CancharClub...
echo ================================================================
cd /d "%~dp0"
node backup-db.mjs
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Intentando respaldo directo via PowerShell...
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0backup-supabase.ps1"
)
echo.
echo Presione cualquier tecla para cerrar...
pause > nul
