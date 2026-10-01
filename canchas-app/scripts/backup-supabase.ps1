# scripts/backup-supabase.ps1
# Script PowerShell para respaldo semanal de Supabase PostgreSQL con pg_dump
# Compatible con Windows PowerShell 5.1 y PowerShell 7+

[CmdletBinding()]
param (
    [string]$CustomPassword = "",
    [int]$RetentionWeeks = 8
)

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\..\.."
$BackupsDir = "$ProjectRoot\backups"
$EnvFile = "$ScriptDir\..\.env.local"
$LogFile = "$BackupsDir\backup.log"

if (-not (Test-Path $BackupsDir)) {
    New-Item -ItemType Directory -Path $BackupsDir -Force | Out-Null
}

function Write-LogMessage {
    param([string]$Message, [bool]$IsError = $false)
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$ts] $Message"
    if ($IsError) {
        Write-Host "[-] $Message" -ForegroundColor Red
    } else {
        Write-Host "[+] $Message" -ForegroundColor Cyan
    }
    Add-Content -Path $LogFile -Value $logLine -Encoding UTF8
}

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  CancharClub - Ejecutor de Respaldo pg_dump (Supabase)" -ForegroundColor Green
Write-Host "  Destino: $BackupsDir" -ForegroundColor Green
Write-Host "================================================================`n"

# 1. Cargar configuracion desde .env.local
$DbHost = "aws-0-sa-east-1.pooler.supabase.com"
$DbPort = "5432"
$DbName = "postgres"
$ProjectRef = "nmihhlzbpjonmjsmmred"
$DbUser = "postgres.nmihhlzbpjonmjsmmred"
$DbPassword = $CustomPassword

if (Test-Path $EnvFile) {
    $lines = Get-Content -Path $EnvFile
    foreach ($rawLine in $lines) {
        $line = $rawLine.Trim()
        if ($line -and (-not $line.StartsWith("#")) -and ($line -match '^([^=]+)=(.*)$')) {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            if ($key -eq "SUPABASE_DB_HOST") { $DbHost = $val }
            if ($key -eq "SUPABASE_DB_PORT") { $DbPort = $val }
            if ($key -eq "SUPABASE_DB_NAME") { $DbName = $val }
            if ($key -eq "SUPABASE_DB_USER") { $DbUser = $val }
            if ($key -eq "SUPABASE_PROJECT_REF") { $ProjectRef = $val }
            if ((-not $DbPassword) -and ($key -eq "SUPABASE_DB_PASSWORD" -or $key -eq "PGPASSWORD")) {
                $DbPassword = $val
            }
        }
    }
}

if ((-not $DbPassword) -and $env:PGPASSWORD) {
    $DbPassword = $env:PGPASSWORD
}

# 2. Localizar pg_dump.exe en Windows
$PgDumpPath = ""
$CandidatePaths = @(
    "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
    "C:\Program Files (x86)\PostgreSQL\17\bin\pg_dump.exe",
    "C:\Program Files (x86)\PostgreSQL\16\bin\pg_dump.exe"
)

foreach ($path in $CandidatePaths) {
    if (Test-Path $path) {
        $PgDumpPath = $path
        break
    }
}

if (-not $PgDumpPath) {
    $cmdObj = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmdObj) {
        $PgDumpPath = $cmdObj.Source
    }
}

$Timestamp = (Get-Date).ToString("yyyy-MM-dd_HH-mm-ss")
$BasePrefix = "cancharclub_$Timestamp"

# 3. Snapshot auxiliar de datos de negocio via Node.js
Write-LogMessage "Iniciando respaldo de negocio en JSON (turnos, perfiles, canchas)..."
try {
    $nodeScript = "$ScriptDir\backup-db.mjs"
    if (Test-Path $nodeScript) {
        & node $nodeScript
    }
} catch {
    Write-LogMessage "Aviso: no se pudo invocar backup-db.mjs: $_" -IsError $true
}

# 4. Volcado PostgreSQL nativo con pg_dump
if (-not $PgDumpPath) {
    Write-LogMessage "AVISO: No se encontro pg_dump.exe en las rutas estandar ni en PATH." -IsError $true
    exit 1
}

if (-not $DbPassword) {
    Write-LogMessage "AVISO: SUPABASE_DB_PASSWORD no esta definida en .env.local." -IsError $true
    Write-LogMessage "Para dump binario de Postgres, agrega a .env.local: SUPABASE_DB_PASSWORD=tu_clave" -IsError $true
    exit 0
}

Write-LogMessage "Localizado pg_dump: $PgDumpPath"
Write-LogMessage "Conectando a Supabase Session Pooler ($($DbHost):$($DbPort))..."

$env:PGPASSWORD = $DbPassword

$DumpFile = "$BackupsDir\$BasePrefix.dump"
$SqlFile = "$BackupsDir\$BasePrefix.sql"

# Formato 1: Binario Comprimido (-F c)
Write-LogMessage "Generando dump binario comprimido: $BasePrefix.dump ..."
& "$PgDumpPath" -h $DbHost -p $DbPort -U $DbUser -d $DbName -F c --schema=public --no-owner --no-privileges -f "$DumpFile"

if (($LASTEXITCODE -eq 0) -and (Test-Path $DumpFile)) {
    $item = Get-Item $DumpFile
    $sizeKb = [math]::Round(($item.Length / 1KB), 1)
    Write-LogMessage "OK: Dump binario creado: $BasePrefix.dump ($($sizeKb) KB)"
} else {
    Write-LogMessage "Error en dump binario pg_dump (Codigo: $LASTEXITCODE)" -IsError $true
}

# Formato 2: SQL Texto (-F p)
Write-LogMessage "Generando dump SQL plano: $BasePrefix.sql ..."
& "$PgDumpPath" -h $DbHost -p $DbPort -U $DbUser -d $DbName -F p --schema=public --clean --if-exists --no-owner --no-privileges -f "$SqlFile"

if (($LASTEXITCODE -eq 0) -and (Test-Path $SqlFile)) {
    $item = Get-Item $SqlFile
    $sizeKb = [math]::Round(($item.Length / 1KB), 1)
    Write-LogMessage "OK: Dump SQL plano creado: $BasePrefix.sql ($($sizeKb) KB)"
} else {
    Write-LogMessage "Error en dump SQL pg_dump (Codigo: $LASTEXITCODE)" -IsError $true
}

# 5. Rotacion de copias antiguas
Write-LogMessage "Verificando politica de retencion ($RetentionWeeks semanas)..."
$LimitDate = (Get-Date).AddDays(-($RetentionWeeks * 7))
$OldFiles = Get-ChildItem -Path $BackupsDir -File | Where-Object {
    ($_.LastWriteTime -lt $LimitDate) -and
    ($_.Name -ne "backup.log") -and
    ($_.Name -ne "latest-backup.json") -and
    ($_.Name -ne ".gitignore") -and
    ($_.Name -ne "README.md")
}

foreach ($f in $OldFiles) {
    Remove-Item -Path $f.FullName -Force
    Write-LogMessage "Purgado backup antiguo: $($f.Name)"
}

Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "  Proceso finalizado. Registro: $LogFile" -ForegroundColor Green
Write-Host "================================================================`n"
