#Requires -Version 5.1
<#
.SYNOPSIS
  Helper self-host AsetOpt Monitor di Windows (Docker Desktop).

.EXAMPLE
  .\scripts\selfhost.ps1 init
  .\scripts\selfhost.ps1 up
  .\scripts\selfhost.ps1 migrate
  .\scripts\selfhost.ps1 status
  .\scripts\selfhost.ps1 logs
  .\scripts\selfhost.ps1 down
  .\scripts\selfhost.ps1 backup-db
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet("init", "up", "migrate", "status", "logs", "down", "backup-db", "help")]
  [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$EnvFile = Join-Path $Root ".env.selfhost"
$EnvExample = Join-Path $Root ".env.selfhost.example"

function Assert-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker tidak ditemukan. Install Docker Desktop untuk Windows, lalu buka ulang PowerShell."
  }
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker daemon tidak jalan. Buka Docker Desktop sampai status Running."
  }
}

function Use-EnvFileArgs {
  if (Test-Path $EnvFile) {
    return @("--env-file", $EnvFile)
  }
  Write-Warning ".env.selfhost belum ada — memakai default compose. Jalankan: .\scripts\selfhost.ps1 init"
  return @()
}

function Invoke-Compose {
  param([string[]]$ComposeArgs)
  $envArgs = Use-EnvFileArgs
  & docker compose @envArgs @ComposeArgs
  if ($LASTEXITCODE -ne 0) { throw "docker compose gagal (exit $LASTEXITCODE)" }
}

switch ($Command) {
  "help" {
    Write-Host @"
AsetOpt self-host (Windows + Docker Desktop)

  .\scripts\selfhost.ps1 init       # salin .env.selfhost.example → .env.selfhost
  .\scripts\selfhost.ps1 up         # build + start db, api, web
  .\scripts\selfhost.ps1 migrate    # jalankan skema SQL (DB kosong / update)
  .\scripts\selfhost.ps1 status     # docker compose ps
  .\scripts\selfhost.ps1 logs       # log api + web (ikuti)
  .\scripts\selfhost.ps1 down       # stop container (volume data tetap)
  .\scripts\selfhost.ps1 backup-db  # dump Postgres ke .\backups\

URL setelah up:
  App  : http://localhost:3001
  API  : http://localhost:8000/health
  Docs : DEPLOY_SELFHOST.md
"@
  }

  "init" {
    if (-not (Test-Path $EnvExample)) {
      throw "File tidak ada: $EnvExample"
    }
    if (Test-Path $EnvFile) {
      Write-Host ".env.selfhost sudah ada — tidak ditimpa."
    } else {
      Copy-Item $EnvExample $EnvFile
      Write-Host "Dibuat: .env.selfhost"
      Write-Host "Edit file itu: POSTGRES_PASSWORD, SUPERMAN_USER, SUPERMAN_PASSWORD"
    }
  }

  "up" {
    Assert-Docker
    if (-not (Test-Path $EnvFile)) {
      Write-Host "Menjalankan init dulu..."
      & $PSCommandPath init
    }
    Write-Host "Building & starting services..."
    Invoke-Compose @("up", "-d", "--build")
    Write-Host ""
    Write-Host "OK. App: http://localhost:3001"
    Write-Host "Jika DB baru, jalankan: .\scripts\selfhost.ps1 migrate"
  }

  "migrate" {
    Assert-Docker
    Write-Host "Menjalankan migration schema..."
    # Service migrate pakai profile "tools"
    Invoke-Compose @("--profile", "tools", "run", "--rm", "migrate")
    Write-Host "Migration selesai."
  }

  "status" {
    Assert-Docker
    Invoke-Compose @("ps")
  }

  "logs" {
    Assert-Docker
    Invoke-Compose @("logs", "-f", "--tail=100", "api", "web")
  }

  "down" {
    Assert-Docker
    Invoke-Compose @("down")
    Write-Host "Containers stopped. Volume data (DB/uploads) tetap ada."
  }

  "backup-db" {
    Assert-Docker
    $backupDir = Join-Path $Root "backups"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $outFile = Join-Path $backupDir "asetopt-$stamp.sql"
    Write-Host "Dump ke $outFile ..."
    $envArgs = Use-EnvFileArgs
    & docker compose @envArgs exec -T db pg_dump -U asetopt asetopt | Set-Content -Path $outFile -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal" }
    Write-Host "Backup OK: $outFile"
  }
}
