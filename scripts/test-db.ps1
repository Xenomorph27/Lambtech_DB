<#
.SYNOPSIS
  A throwaway Postgres for the test suite, separate from any real database.

.DESCRIPTION
  Creates its own cluster in .pgtest/ (git-ignored) on port 54329 with no
  password, so it never touches the Postgres service installed on this
  machine or the live Supabase project.

    .\scripts\test-db.ps1 start   create (first time) and start it
    .\scripts\test-db.ps1 stop    stop it
    .\scripts\test-db.ps1 reset   stop, delete and recreate it

  Then run the tests with:
    $env:TEST_DATABASE_URL = 'postgresql://postgres@localhost:54329/lambtech_test'
    backend\.venv\Scripts\python -m pytest backend\tests -q

  Run `start` from an interactive terminal window, not from a background job
  or an agent's shell: Postgres backends spawned from a non-interactive
  session can die with Windows error 0xC0000142 (desktop heap exhaustion),
  which takes the whole cluster down.
#>
param([ValidateSet('start', 'stop', 'reset')][string]$Action = 'start')

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Data = Join-Path $Root '.pgtest\data'
$Log = Join-Path $Root '.pgtest\server.log'
$Port = 54329

# PostgreSQL's installer does not put its tools on PATH, so look for them.
$Bin = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
  Sort-Object { [int]$_.Name } -Descending |
  ForEach-Object { Join-Path $_.FullName 'bin' } |
  Where-Object { Test-Path (Join-Path $_ 'initdb.exe') } |
  Select-Object -First 1
if (-not $Bin) { throw 'PostgreSQL is not installed under C:\Program Files\PostgreSQL.' }

function Stop-TestDb {
  if (Test-Path (Join-Path $Data 'postmaster.pid')) {
    & "$Bin\pg_ctl.exe" -D $Data -m fast stop | Out-Null
  }
}

if ($Action -eq 'stop') { Stop-TestDb; return }
if ($Action -eq 'reset') { Stop-TestDb; Remove-Item -Recurse -Force (Join-Path $Root '.pgtest') -ErrorAction SilentlyContinue }

if (-not (Test-Path (Join-Path $Data 'PG_VERSION'))) {
  New-Item -ItemType Directory -Force $Data | Out-Null
  & "$Bin\initdb.exe" -D $Data -U postgres --auth=trust --encoding=UTF8 --no-locale | Out-Null
}

if (-not (Test-Path (Join-Path $Data 'postmaster.pid'))) {
  # Not piped: the server inherits pg_ctl's stdout, so a pipe here never
  # closes and the script hangs forever once the server is up.
  $pgctl = Start-Process -FilePath "$Bin\pg_ctl.exe" -Wait -PassThru -NoNewWindow `
    -ArgumentList @('-D', "`"$Data`"", '-l', "`"$Log`"", '-o', "`"-p $Port -c listen_addresses=localhost`"", '-w', 'start')
  if ($pgctl.ExitCode -ne 0) { throw "pg_ctl start failed (exit $($pgctl.ExitCode)); see $Log" }
}

$exists = & "$Bin\psql.exe" -h localhost -p $Port -U postgres -tAc "select 1 from pg_database where datname = 'lambtech_test'"
if (-not $exists) {
  & "$Bin\createdb.exe" -h localhost -p $Port -U postgres lambtech_test
}

"Test database ready: postgresql://postgres@localhost:$Port/lambtech_test"
