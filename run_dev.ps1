# run_dev.ps1
. .\.venv\Scripts\Activate.ps1

Start-Job -ScriptBlock {
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
}

Start-Job -ScriptBlock {
    python .\scripts\worker.py
}

Write-Host "=== Dev services started ==="
Write-Host "API:    http://localhost:8000"
Write-Host "Worker: running in background job"
Write-Host ""
Write-Host "Use Get-Job to see jobs and Stop-Job -Id <id> to kill."
