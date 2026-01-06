# Python to TypeScript Migration Plan

## Current State Analysis

### Python Stack
- **Framework**: FastAPI (async web framework)
- **Database ORM**: SQLAlchemy 2.0
- **Database**: PostgreSQL (via psycopg2-binary)
- **Server**: Uvicorn (ASGI server)
- **Package Manager**: uv (Python package manager)
- **Entry Point**: `app.py` (FastAPI application)
- **Module Structure**: `kafkaorg/` package with:
  - `db.py` - Database connection and initialization
  - `models.py` - SQLAlchemy ORM models
  - `__main__.py` - Development server entry point

### Current Functionality
1. **API Endpoints**:
   - `GET /` - Serves `static/index.html`
   - `GET /signup` - Serves `static/signup.html`
   - `POST /api/signin` - User lookup by username
   - `POST /api/signup` - User registration

2. **Database Operations**:
   - Database initialization from `db/schema.sql`
   - User model with SQLAlchemy ORM
   - Session management with dependency injection

3. **Static File Serving**:
   - Mounts `/static` directory for CSS, JS, HTML files

## Migration Scope

### What Needs to Change

#### 1. **Framework Migration**
- **From**: FastAPI (Python)
- **To**: Express.js or Fastify (TypeScript)
  - **Recommendation**: Fastify (similar async performance, better TypeScript support)
  - Alternative: Express.js with TypeScript (more ecosystem, slightly more verbose)

#### 2. **Database Layer**
- **From**: SQLAlchemy ORM
- **To**: TypeORM, Prisma, or Drizzle ORM
  - **Recommendation**: Prisma (excellent TypeScript support, type-safe queries, migrations)
  - Alternative: TypeORM (more similar to SQLAlchemy, mature ecosystem)
  - Alternative: Drizzle ORM (lightweight, SQL-like, great TypeScript inference)

#### 3. **Package Management**
- **From**: `pyproject.toml` + `uv`
- **To**: `package.json` + `npm`/`yarn`/`pnpm`
  - **Recommendation**: `pnpm` (faster, efficient disk usage)

#### 4. **Type System**
- **From**: Pydantic models for request/response validation
- **To**: TypeScript types + Zod (runtime validation)
  - Zod provides similar validation to Pydantic

#### 5. **Development Server**
- **From**: Uvicorn with auto-reload
- **To**: `tsx` or `ts-node-dev` for development
  - **Recommendation**: `tsx` (fast, modern, ESM support)

#### 6. **Build System**
- **From**: Python module system
- **To**: TypeScript compilation (`tsc`) or bundler (esbuild, swc)
  - **Recommendation**: `tsc` for type checking + `tsx` for runtime

### What Stays the Same

1. **Database Schema**: `db/schema.sql` can remain (or migrate to Prisma migrations)
2. **Static Files**: `static/` directory structure unchanged
3. **API Contracts**: Endpoints and request/response formats remain identical
4. **Docker Setup**: Container structure can remain (just change base image/install Node.js)
5. **Database**: PostgreSQL connection and configuration

## Detailed Migration Steps

### Phase 1: Project Setup
1. Create `package.json` with TypeScript dependencies
2. Set up `tsconfig.json` for TypeScript configuration
3. Install runtime dependencies (Fastify/Express, database client, etc.)
4. Install dev dependencies (TypeScript, type definitions, dev server)

### Phase 2: Database Layer Migration
1. Choose ORM (Prisma recommended)
2. Generate Prisma schema from existing PostgreSQL schema OR
3. Create Prisma schema manually matching current models
4. Set up database connection utilities
5. Migrate `init_db()` function to Prisma migrations or initialization script

### Phase 3: API Migration
1. Convert `app.py` to TypeScript server file
2. Migrate route handlers:
   - `GET /` → serve static HTML
   - `GET /signup` → serve static HTML
   - `POST /api/signin` → user lookup
   - `POST /api/signup` → user creation
3. Convert Pydantic models to Zod schemas for validation
4. Set up static file serving middleware

### Phase 4: Development & Build
1. Create development script (replaces `uv run go`)
2. Set up build process for production
3. Update Dockerfile to use Node.js base image
4. Update docker-compose.yml if needed

### Phase 5: Testing & Validation
1. Ensure all endpoints work identically
2. Test database operations
3. Verify static file serving
4. Test in Docker container

## File Structure After Migration

```
kafkaorg/
├── src/
│   ├── index.ts              # Main server file (replaces app.py)
│   ├── db/
│   │   ├── client.ts        # Database connection (replaces kafkaorg/db.py)
│   │   └── schema.ts        # Database models/types (replaces kafkaorg/models.py)
│   ├── routes/
│   │   ├── index.ts         # Root route
│   │   ├── signup.ts        # Signup page route
│   │   └── api/
│   │       ├── signin.ts    # Signin API
│   │       └── signup.ts    # Signup API
│   └── types/
│       └── requests.ts      # Request/response types
├── prisma/
│   └── schema.prisma        # Prisma schema (if using Prisma)
├── static/                  # Unchanged
├── db/
│   └── schema.sql           # May be replaced by Prisma migrations
├── package.json
├── tsconfig.json
├── Dockerfile               # Updated for Node.js
└── docker-compose.yml       # May need updates
```

## Key Dependencies to Install

### Runtime
- `fastify` (or `express`) - Web framework
- `@fastify/static` (or `express-static`) - Static file serving
- `@prisma/client` (or `typeorm`, `drizzle-orm`) - Database ORM
- `pg` - PostgreSQL client
- `zod` - Runtime validation (replaces Pydantic)

### Development
- `typescript` - TypeScript compiler
- `@types/node` - Node.js type definitions
- `tsx` - TypeScript execution for development
- `prisma` - Prisma CLI (if using Prisma)
- `@types/pg` - PostgreSQL types

## Challenges & Considerations

### 1. **Async/Await Patterns**
- Python's `async def` → TypeScript's `async function`
- FastAPI's dependency injection → Fastify/Express middleware or dependency injection

### 2. **Database Session Management**
- SQLAlchemy's `SessionLocal` → Prisma Client (singleton) or connection pooling
- FastAPI's `Depends(get_db)` → Fastify decorators or middleware

### 3. **Error Handling**
- FastAPI's `HTTPException` → Framework-specific error handling
- Status codes and error responses need to match

### 4. **Type Safety**
- Python's runtime types → TypeScript's compile-time types
- Need to ensure runtime validation with Zod matches TypeScript types

### 5. **Development Experience**
- `uv run go` → `npm run dev` or `pnpm dev`
- Hot reload needs to be configured

### 6. **Docker Image Size**
- Python base image → Node.js base image
- May need to optimize image size

## Estimated Effort

- **Phase 1 (Setup)**: 1-2 hours
- **Phase 2 (Database)**: 2-3 hours
- **Phase 3 (API)**: 3-4 hours
- **Phase 4 (Build/Dev)**: 1-2 hours
- **Phase 5 (Testing)**: 2-3 hours

**Total**: ~10-15 hours for a complete migration

## Migration Strategy Options

### Option A: Big Bang Migration
- Migrate everything at once
- Higher risk, faster completion
- Good for small codebase (current state)

### Option B: Incremental Migration
- Keep Python server running
- Migrate endpoints one by one
- Use reverse proxy to route requests
- Lower risk, longer timeline
- More complex setup

**Recommendation**: Option A (Big Bang) given the small codebase size

## Post-Migration Benefits

1. **Type Safety**: Compile-time type checking
2. **Ecosystem**: Access to npm ecosystem
3. **Performance**: Node.js async performance comparable to Python
4. **Tooling**: Better IDE support for TypeScript
5. **Consistency**: Same language for frontend and backend (if frontend is JS/TS)

## Next Steps

1. Review and approve this migration plan
2. Choose specific technologies (Fastify vs Express, Prisma vs TypeORM)
3. Create initial project structure
4. Begin Phase 1 implementation
