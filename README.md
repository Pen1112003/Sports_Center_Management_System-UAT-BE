# Sports Center Management System UAT BE

## FR-001 local setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

The API runs on `http://localhost:3000`. Swagger UI runs at `http://localhost:3000/api-docs`, and the OpenAPI JSON is available at `http://localhost:3000/api-docs.json`. SQLite uses `file:./data/app.db`; access tokens last 60 minutes and refresh tokens are rotated in an HttpOnly cookie.

Demo account: `manager@sports-center.local` / `ChangeMe123!`

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

API endpoints for FR-001: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`.

FR-002 endpoints are documented in Swagger: `GET /api/classes` and `POST /api/class-registrations`.
