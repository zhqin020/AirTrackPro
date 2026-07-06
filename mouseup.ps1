# AirTrackPro Startup Script (mouseup.ps1)
# This script helps you easily launch the Node/Vite backend server and/or the Python physical receiver.

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "          AirTrack Pro Control Panel              " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Ensure node_modules are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Node modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Function to check and install Python dependencies
function Setup-Python {
    Write-Host "[*] Checking Python environment..." -ForegroundColor Yellow
    
    $venvPath = ".\.venv"
    $hasVenv = Test-Path "$venvPath\Scripts\python.exe"
    
    if ($hasVenv) {
        Write-Host "[+] Found virtual environment in $venvPath" -ForegroundColor Green
        $pythonCmd = "$venvPath\Scripts\python.exe"
    } else {
        try {
            python --version > $null 2>&1
            $pythonCmd = "python"
        } catch {
            try {
                py --version > $null 2>&1
                $pythonCmd = "py"
            } catch {
                Write-Warning "Python was not found in path. Please install Python 3."
                return $null
            }
        }
    }

    Write-Host "[+] Using Python command: $pythonCmd" -ForegroundColor Green
    
    # Check dependencies
    Write-Host "[*] Checking Python packages (pyautogui, websockets)..." -ForegroundColor Yellow
    & $pythonCmd -c "import pyautogui, websockets, asyncio" > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[*] Installing missing Python packages..." -ForegroundColor Yellow
        & $pythonCmd -m pip install pyautogui websockets asyncio
    } else {
        Write-Host "[+] Python dependencies are satisfied." -ForegroundColor Green
    }
    
    return $pythonCmd
}

# Menu selection
Write-Host "Please select startup mode:" -ForegroundColor White
Write-Host "1) Start both Server and Python Receiver (Recommended)" -ForegroundColor Green
Write-Host "2) Start Server only (Vite/Node backend)" -ForegroundColor White
Write-Host "3) Start Python Receiver only (Physical control agent)" -ForegroundColor White
Write-Host "4) Setup environments (npm install & pip install) only" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Enter option (1-4) [Default is 1]"
if ([string]::IsNullOrEmpty($choice)) { $choice = "1" }

if ($choice -eq "1" -or $choice -eq "4") {
    $pythonCmd = Setup-Python
}

if ($choice -eq "4") {
    Write-Host "[+] Setup complete!" -ForegroundColor Green
    Exit
}

# Start Server
if ($choice -eq "1" -or $choice -eq "2") {
    Write-Host "[*] Starting Node.js/Vite Web Server in a new window..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting AirTrack Pro Web Server...'; npm run dev"
    Write-Host "[*] Waiting for server to start, then launching browser..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"
}

# Start Receiver
if ($choice -eq "1" -or $choice -eq "3") {
    if ($null -eq $pythonCmd) {
        $pythonCmd = Setup-Python
    }
    
    if ($null -ne $pythonCmd) {
        # Ask for PIN (optional, default 1111)
        $pin = Read-Host "Enter 4-digit PIN for receiver [Default is 1111]"
        if ([string]::IsNullOrEmpty($pin)) { $pin = "1111" }

        Write-Host "[*] Starting Python Receiver in a new window..." -ForegroundColor Yellow
        $startCmd = "Write-Host 'Starting AirTrack Pro Python Receiver...';"
        if (Test-Path ".\.venv\Scripts\Activate.ps1") {
            $startCmd += " . .\.venv\Scripts\Activate.ps1;"
        }
        $startCmd += " & $pythonCmd receiver.py --pin $pin"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCmd
    } else {
        Write-Warning "Could not start Python receiver because Python is not installed."
    }
}

Write-Host "==================================================" -ForegroundColor Green
Write-Host "[+] Startup actions executed successfully!" -ForegroundColor Green
Write-Host "If new windows were opened, they will remain running." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Read-Host "Press Enter to exit control panel"
