# setup_dev.ps1
# Dev bootstrap for Creator Toolkit

Write-Host "=== Creating virtual environment (.venv) ==="
python -m venv .venv

Write-Host "=== Activating virtual environment ==="
# This only works for the current shell session
. .\.venv\Scripts\Activate.ps1

Write-Host "=== Upgrading pip ==="
python -m pip install --upgrade pip

Write-Host "=== Installing Python dependencies ==="
pip install -r requirements.txt

Write-Host "=== Creating data directories ==="
if (!(Test-Path -Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
if (!(Test-Path -Path "static\uploads")) {
    New-Item -ItemType Directory -Path "static\uploads" -Force | Out-Null
}
if (!(Test-Path -Path "static\music")) {
    New-Item -ItemType Directory -Path "static\music" -Force | Out-Null
}

Write-Host "=== Copying .env.example to .env if missing ==="
if (!(Test-Path -Path ".env") -and (Test-Path -Path ".env.example")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example. Update secrets manually."
}

Write-Host "=== Initializing local SQLite job DBs ==="
python .\scripts\init_dbs.py

Write-Host "=== Setup complete. Activate venv with:"
Write-Host "    .\.venv\Scripts\Activate.ps1"
Write-Host "Then run:"
Write-Host "    uvicorn main:app --reload"
Write-Host "    python .\scripts\worker.py"
