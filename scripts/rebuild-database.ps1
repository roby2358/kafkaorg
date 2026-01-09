#!/usr/bin/env pwsh
# Rebuild the database by removing the volume, rebuilding containers, and reinitializing schema

Write-Host "Rebuilding database..." -ForegroundColor Cyan

# Step 1: Stop containers
Write-Host "`nStep 1: Stopping containers..." -ForegroundColor Yellow
podman-compose down
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error stopping containers" -ForegroundColor Red
    exit 1
}

# Step 2: Remove database volume
Write-Host "`nStep 2: Removing database volume..." -ForegroundColor Yellow
podman volume rm kafkaorg_kafkaorg-data 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Could not remove volume (may not exist)" -ForegroundColor Yellow
}

# Step 3: Regenerate Prisma client
Write-Host "`nStep 3: Regenerating Prisma client..." -ForegroundColor Yellow
pnpm prisma:generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error generating Prisma client" -ForegroundColor Red
    exit 1
}

# Step 4: Rebuild container image
Write-Host "`nStep 4: Rebuilding container image..." -ForegroundColor Yellow
podman-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error rebuilding container image" -ForegroundColor Red
    exit 1
}

# Step 5: Start containers
Write-Host "`nStep 5: Starting containers..." -ForegroundColor Yellow
podman-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error starting containers" -ForegroundColor Red
    exit 1
}

# Step 6: Wait for database to be ready
Write-Host "`nStep 6: Waiting for database to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 7: Drop existing tables (if any)
Write-Host "`nStep 7: Dropping existing tables..." -ForegroundColor Yellow
podman exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg -c "DROP TABLE IF EXISTS conversations CASCADE; DROP TABLE IF EXISTS agents CASCADE;" 2>$null

# Step 8: Initialize schema
Write-Host "`nStep 8: Initializing database schema..." -ForegroundColor Yellow
Get-Content db/schema.sql | podman exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error initializing schema" -ForegroundColor Red
    exit 1
}

# Step 9: Verify schema
Write-Host "`nStep 9: Verifying schema..." -ForegroundColor Yellow
podman exec -it kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg -c "\d agents"

Write-Host "`nDatabase rebuild complete!" -ForegroundColor Green
