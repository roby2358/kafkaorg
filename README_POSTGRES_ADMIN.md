# PostgreSQL Administration

## Database Commands

Connect to PostgreSQL CLI in the container:
```bash
podman exec -it kafkaorg-kafkaorg-1 psql -U postgres -d kafkaorg
```

Reset the database (drop and recreate schema):
```bash
pnpm prisma migrate reset
```

Apply pending migrations:
```bash
pnpm prisma migrate dev
```

Seed the database with initial data:
```bash
pnpm prisma:seed
```

Note: Seeding runs automatically on `prisma migrate reset` and when `prisma migrate dev` creates a new database.
