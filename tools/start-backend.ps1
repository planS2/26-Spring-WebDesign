$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.backend"

if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $name, $value = $trimmed -split "=", 2
        $name = $name.Trim().TrimStart([char]0xFEFF)
        if ($name -and $null -ne $value) {
            Set-Item -Path "Env:$name" -Value $value.Trim()
        }
    }
}

if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL is missing. Create .env.backend from .env.backend.example first."
}

$backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8000" }

Set-Location -LiteralPath $projectRoot
conda run -n web3d-backend python -m uvicorn backend.main:app --host 127.0.0.1 --port $backendPort
