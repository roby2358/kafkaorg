# PostgreSQL Administration

## Database Commands

Connect to PostgreSQL CLI in the container:
```bash
podman exec -it kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg
```

Reset the database (drop and recreate schema):
```bash
pnpm prisma migrate reset
```

Note: Seeding runs automatically on `prisma migrate reset` and when `prisma migrate dev` creates a new database.

Apply pending migrations:
```bash
pnpm prisma migrate dev
```
