$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.backend"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw ".env.backend is missing."
}

foreach ($line in Get-Content -LiteralPath $envFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
        continue
    }

    $name, $value = $trimmed -split "=", 2
    if ($name -and $null -ne $value) {
        Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
    }
}

if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL is missing from .env.backend."
}

Set-Location -LiteralPath $projectRoot
conda run -n web3d-backend python tools/import-live-data-to-postgres.py
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
