# Stop kafkaorg server on port 8821
$port = 8821
$processes = netstat -ano | findstr ":$port" | findstr "LISTENING"

if ($processes) {
    $pid = ($processes -split '\s+')[-1]
    if ($pid) {
        Write-Host "Stopping server process (PID: $pid)..."
        taskkill /PID $pid /F
        Write-Host "Server stopped."
    } else {
        Write-Host "Could not find process ID."
    }
} else {
    Write-Host "No process found listening on port $port"
}
