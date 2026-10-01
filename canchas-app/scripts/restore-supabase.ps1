# scripts/restore-supabase.ps1
# Script para restaurar una copia de seguridad en Supabase o PostgreSQL local
# Soporta archivos .dump (pg_restore) y archivos .sql (psql)

[CmdletBinding()]
param (
    [string]$BackupFile = "",
    [string]$TargetTable = "", # Opcional: restaurar solo una tabla (ej: bookings)
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\..\.."
$BackupsDir = "$ProjectRoot\backups"
$EnvFile = "$ScriptDir\..\.env.local"

# 1. Detectar archivos disponibles si no se especificó uno
if (-not $BackupFile) {
    Write-Host "Buscando copias de seguridad en $BackupsDir..." -ForegroundColor Cyan
    $AvailableBackups = Get-ChildItem -Path $BackupsDir -File | Where-Object {
        $_.Extension -in @(".dump", ".sql")
    } | Sort-Object LastWriteTime -Descending

    if (-not $AvailableBackups) {
        Write-Host "❌ No se encontraron archivos .dump o .sql en $BackupsDir." -ForegroundColor Red
        exit 1
    }

    $Latest = $AvailableBackups[0]
    $BackupFile = $Latest.FullName
    Write-Host "ℹ️ Usando la copia más reciente detectada:" -ForegroundColor Yellow
    Write-Host "   $($Latest.Name) ($([math]::Round($Latest.Length / 1KB, 1)) KB - $($Latest.LastWriteTime))`n" -ForegroundColor White
} elseif (-not (Test-Path $BackupFile)) {
    $PotentialPath = "$BackupsDir\$BackupFile"
    if (Test-Path $PotentialPath) {
        $BackupFile = $PotentialPath
    } else {
        Write-Host "❌ No se encontró el archivo $BackupFile" -ForegroundColor Red
        exit 1
    }
}

# 2. Cargar credenciales desde .env.local
$DbHost = "aws-0-sa-east-1.pooler.supabase.com"
$DbPort = "5432"
$DbName = "postgres"
$DbUser = "postgres.nmihhlzbpjonmjsmmred"
$DbPassword = ""

if (Test-Path $EnvFile) {
    foreach ($rawLine in (Get-Content $EnvFile)) {
        $line = $rawLine.Trim()
        if ($line -and -not $line.StartsWith("#") -and ($line -match "^([^=]+)=(.*)$")) {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            if ($key -eq "SUPABASE_DB_HOST") { $DbHost = $val }
            if ($key -eq "SUPABASE_DB_PORT") { $DbPort = $val }
            if ($key -eq "SUPABASE_DB_NAME") { $DbName = $val }
            if ($key -eq "SUPABASE_DB_USER") { $DbUser = $val }
            if ($key -eq "SUPABASE_DB_PASSWORD" -or $key -eq "PGPASSWORD") {
                $DbPassword = $val
            }
        }
    }
}

if (-not $DbPassword -and $env:PGPASSWORD) {
    $DbPassword = $env:PGPASSWORD
}

if (-not $DbPassword) {
    Write-Host "❌ SUPABASE_DB_PASSWORD no está definida en .env.local ni en la sesión." -ForegroundColor Red
    Write-Host "Definí SUPABASE_DB_PASSWORD en .env.local para continuar con la restauración." -ForegroundColor Yellow
    exit 1
}

# 3. Detectar binarios pg_restore o psql
$Ext = [System.IO.Path]::GetExtension($BackupFile).ToLower()
$BinDir = "C:\Program Files\PostgreSQL\17\bin"
if (-not (Test-Path $BinDir)) {
    $BinDir = "C:\Program Files\PostgreSQL\18\bin"
}

$env:PGPASSWORD = $DbPassword

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  CancharClub — Restauración de Base de Datos" -ForegroundColor Magenta
Write-Host "  Archivo origen: $(Split-Path -Leaf $BackupFile)" -ForegroundColor Magenta
Write-Host "  Destino: $DbHost`:$DbPort ($DbName)" -ForegroundColor Magenta
if ($TargetTable) {
    Write-Host "  Tabla selectiva: $TargetTable" -ForegroundColor Yellow
}
Write-Host "════════════════════════════════════════════════════════════════`n"

if ($DryRun) {
    Write-Host "[MODO SIMULACIÓN - DRY RUN]" -ForegroundColor Yellow
    if ($Ext -eq ".dump") {
        Write-Host "Inspeccionando contenido del archivo binario con pg_restore -l:"
        & "$BinDir\pg_restore.exe" -l "$BackupFile" | Select-Object -First 30
    } else {
        Write-Host "Primeras 30 líneas del archivo SQL:"
        Get-Content $BackupFile | Select-Object -First 30
    }
    exit 0
}

Write-Host "⚠️  ADVERTENCIA: Esta operación importará datos a la base de datos." -ForegroundColor Yellow
Write-Host "¿Deseas continuar? (S/N): " -NoNewline -ForegroundColor Yellow
$confirm = Read-Host
if ($confirm -notmatch "^[sSyY]") {
    Write-Host "Operación cancelada por el usuario." -ForegroundColor Cyan
    exit 0
}

if ($Ext -eq ".dump") {
    $PgRestore = "$BinDir\pg_restore.exe"
    $argsList = @(
        "-h", $DbHost,
        "-p", $DbPort,
        "-U", $DbUser,
        "-d", $DbName,
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists"
    )

    if ($TargetTable) {
        $argsList += @("-t", $TargetTable)
    }

    $argsList += "$BackupFile"

    Write-Host "Ejecutando pg_restore..." -ForegroundColor Cyan
    & $PgRestore $argsList

    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) {
        Write-Host "✅ Restauración completada con éxito." -ForegroundColor Green
    } else {
        Write-Host "❌ Error durante pg_restore (Código: $LASTEXITCODE)" -ForegroundColor Red
    }
} elseif ($Ext -eq ".sql") {
    $Psql = "$BinDir\psql.exe"
    Write-Host "Ejecutando psql..." -ForegroundColor Cyan
    & $Psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -f "$BackupFile"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Restauración SQL completada con éxito." -ForegroundColor Green
    } else {
        Write-Host "❌ Error durante psql (Código: $LASTEXITCODE)" -ForegroundColor Red
    }
}
