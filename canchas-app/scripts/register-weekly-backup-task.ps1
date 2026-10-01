# scripts/register-weekly-backup-task.ps1
# Registra automaticamente una Tarea Programada en Windows (Task Scheduler)
# para ejecutar el respaldo semanal todos los domingos a las 03:00 AM.

[CmdletBinding()]
param (
    [string]$TaskName = "CancharClub_Weekly_Backup",
    [string]$DayOfWeek = "Sunday",
    [string]$Time = "03:00"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupScript = "$ScriptDir\backup-supabase.ps1"

if (-not (Test-Path $BackupScript)) {
    Write-Host "[-] No se encontro el script de respaldo en $BackupScript" -ForegroundColor Red
    exit 1
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  CancharClub - Configuracion de Tarea Semanal en Windows" -ForegroundColor Cyan
Write-Host "  Tarea: $TaskName" -ForegroundColor Cyan
Write-Host "  Frecuencia: Cada $DayOfWeek a las $Time hs" -ForegroundColor Cyan
Write-Host "================================================================`n"

try {
    # 1. Accion
    $actionArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BackupScript`""
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs

    # 2. Disparador Semanal
    $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $Time

    # 3. Configuraciones de resiliencia
    $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    # 4. Registrar tarea para el usuario actual
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[i] Tarea anterior reemplazada." -ForegroundColor Yellow
    }

    $registerTaskParams = @{
        TaskName    = $TaskName
        Action      = $Action
        Trigger     = $Trigger
        Settings    = $Settings
        Description = "Respaldo semanal automatico de base de datos CancharClub (Supabase Postgres pg_dump)"
    }

    Register-ScheduledTask @registerTaskParams | Out-Null

    Write-Host "[+] Tarea programada registrada exitosamente en Windows." -ForegroundColor Green
    Write-Host "    Nombre: $TaskName" -ForegroundColor Green
    Write-Host "    Frecuencia: Cada $DayOfWeek a las $Time" -ForegroundColor Green
    Write-Host "`nComandos utiles:" -ForegroundColor Cyan
    Write-Host " * Ejecutar ahora manualmente:" -ForegroundColor White
    Write-Host "   Start-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor Gray
    Write-Host " * Consultar estado de la tarea:" -ForegroundColor White
    Write-Host "   Get-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor Gray
    Write-Host " * Eliminar tarea si se desea:" -ForegroundColor White
    Write-Host "   Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false" -ForegroundColor Gray
    Write-Host "================================================================`n"

} catch {
    Write-Host "[-] Error al registrar la tarea en Windows: $_" -ForegroundColor Red
    Write-Host "Tip: Si requiere permisos elevados, ejecuta PowerShell como Administrador." -ForegroundColor Yellow
    exit 1
}
