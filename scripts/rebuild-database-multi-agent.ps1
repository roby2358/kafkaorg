# Rebuild database with multi-agent schema
# WARNING: This destroys all data!

Write-Host "⚠️  WARNING: This will destroy all data in the kafkaorg database!" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to cancel or any key to continue..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host "`n🗑️  Dropping existing database..." -ForegroundColor Cyan
docker exec kafkaorg_kafkaorg_1 psql -U postgres -c "DROP DATABASE IF EXISTS kafkaorg;"

Write-Host "✨ Creating fresh database..." -ForegroundColor Cyan
docker exec kafkaorg_kafkaorg_1 psql -U postgres -c "CREATE DATABASE kafkaorg;"

Write-Host "📋 Applying schema..." -ForegroundColor Cyan
Get-Content db/schema.sql | docker exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg

Write-Host "🌱 Seeding agent prototypes..." -ForegroundColor Cyan
Get-Content db/seed_agent_prototypes.sql | docker exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg

Write-Host "✅ Database rebuilt successfully!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  pnpm prisma:generate" -ForegroundColor White
