# SwiftChain — Time-Critical Shipment Management

SwiftChain is a logistics demonstration platform for creating urgent shipments, comparing carrier services, tracking delivery progress, predicting deadline risk and approving recovery actions.

It includes shipper, dispatcher and carrier workspaces, a Python ETA service, and Redis/BullMQ background monitoring.

> Carrier services and location movement are simulated. External carrier acceptance, payments, automatic GPS ingestion and live traffic are not integrated. ETA and financial exposure are estimates.

## 1. Features

- Shipper registration/login, shipment creation, quotes and internal booking.
- Configurable urgency scoring and carrier eligibility/ranking.
- Saved route coordinates, ordered milestones, tracking history and MapLibre maps.
- Socket.IO updates in the shipment tracking panel.
- Role dashboards with maps, recent events, risk and ETA.
- Carrier manual updates, demo coordinate presets and location simulation.
- Rule-based ETA using a FastAPI intelligence service.
- Background SLA assessments and deduplicated risk/recovery notifications.
- Dispatcher assignment and approval of recovery alternatives.
- Before-pickup carrier replacement and configured in-transit transfer routes.
- Original booking/recovery cost breakdown and recovery audit records.
- Read-only What-If simulation: travel speed, delay, hypothetical deadline shift and additional cost.
- Estimated delay exposure and financial-impact sorting.

Condition monitoring and an AI logistics copilot remain optional roadmap items. They are not implemented in the documented code. Configured alternative waypoints are not a general road-routing engine.

## 2. Services and ports

| Component | Technology | Default address |
|---|---|---|
| Frontend | React, TypeScript, Vite | http://localhost:5173 |
| Backend and tracking socket | Express, TypeScript, Socket.IO | http://localhost:5000 |
| Intelligence | Python, FastAPI, Uvicorn | http://127.0.0.1:8000 |
| Database | PostgreSQL | localhost:5432 |
| Queue storage | Redis in Docker | 127.0.0.1:6379 |
| SLA worker | Separate BullMQ process | No browser port |

The frontend calls the backend. The backend and SLA worker call Python. Redis schedules background work, while PostgreSQL stores application records, assessments and alerts.

Starting the backend alone does **not** start Python, Redis or the SLA worker.

## 3. Prerequisites

Install Git, Node.js/npm, Python, PostgreSQL/pgAdmin and Docker Desktop.

- Use a Node release supported by the installed Vite version and package engine requirements.
- Use Python 3.10 or newer supported by the installed dependencies.
- Development used PostgreSQL 17.
- Complete Docker Desktop's requested WSL/virtualization setup if prompted.
- **PostGIS is not required for the current implementation.**

Check installed tools:

```powershell
git --version
node --version
npm --version
py --version
docker --version
```

Keep the PostgreSQL service running. Docker is used for Redis only; it does not start PostgreSQL or the application processes.

## 4. Project layout

```text
SwiftChain-Time-Critical-Shipments/
  backend/
    src/
      config/
      middleware/
      realtime/
      routes/
      scripts/seed.ts
      services/
      workers/sla.worker.ts
      server.ts
    .env.example
    package.json
    package-lock.json
  frontend/
    public/landing.html
    src/
    .env.example
    package.json
    package-lock.json
  python-service/
    main.py
    requirements.txt
  database/
    schema.sql
    migrations/
    seeds/
      demo_services.sql
      carrier_account_links.sql
  README.md
```

## 5. First-time dependency installation

Clone the actual repository and open its root in VS Code. These commands assume Windows PowerShell.

```powershell
cd backend
npm ci
Copy-Item .env.example .env

cd ../frontend
npm ci
Copy-Item .env.example .env

cd ../python-service
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Only copy env examples if you do not already have local .env files. Copying over an existing file replaces its settings.

Expected Python requirements:

```text
fastapi
uvicorn[standard]
```

Use pinned repository versions if supplied. Unpinned requirements do not guarantee identical future installations.

`npm ci` installs the committed lockfile. If package.json and package-lock.json disagree, synchronize and commit the corrected lockfile; do not delete it as a routine setup step.

## 6. Environment setup

### backend/.env

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=5432
DB_NAME=swiftchain_db
DB_USER=postgres
DB_PASSWORD=YOUR_LOCAL_POSTGRES_PASSWORD

JWT_SECRET=YOUR_GENERATED_RANDOM_SECRET
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID

INTELLIGENCE_SERVICE_URL=http://127.0.0.1:8000
REDIS_URL=redis://127.0.0.1:6379
SLA_MONITOR_INTERVAL_MS=30000

DEV_SEED_PASSWORD=YOUR_CHOSEN_DEVELOPMENT_PASSWORD
```

Generate JWT_SECRET locally:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

The backend requires at least 32 characters. DEV_SEED_PASSWORD must contain at least 12 characters and is used only to initially provision demo login accounts.

Run backend/worker commands from backend/ so dotenv finds the intended file. FRONTEND_URL must exactly match the browser origin. NODE_ENV=development avoids production-only secure-cookie behavior on local HTTP.

### frontend/.env

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
```

- API URL includes /api; socket URL does not.
- Use the same Google Web Client ID in backend and frontend.
- VITE_ variables are browser-visible: never include database passwords, JWT secrets or Google client secrets.
- Restart Vite after editing its env file.

### Google sign-in

Configure a Google Web OAuth client with the authorized JavaScript origin:

```text
http://localhost:5173
```

The implementation sends a credential to POST /api/auth/google. Do not invent a backend OAuth callback route. Until Google is configured, use the email/password flow.

### Python

The current main.py needs no Python environment variables. Its service address is configured through backend INTELLIGENCE_SERVICE_URL.

Use localhost:5173 consistently in the browser. Switching to 127.0.0.1 or another port can violate origin/cookie settings.

## 7. Database setup

### Fresh installation

1. Open pgAdmin and connect to local PostgreSQL.
2. Create a database named swiftchain_db.
3. Open Query Tool on that database.
4. Confirm the connection:

```sql
SELECT current_database();
```

Apply files in this order:

1. database/schema.sql — complete consolidated schema.
2. database/seeds/demo_services.sql — carriers, direct lanes, transfer hub and transfer lanes.
3. Run the backend account seed below.
4. database/seeds/carrier_account_links.sql — map carrier login to service records.

The schema includes users, organizations, shipments, carriers, transfer_points, carrier_service_lanes, carrier_accounts, pricing_quotes, shipment_bookings, shipment_tracking_events, shipment_sla_state, shipment_alerts, shipment_dispatchers, shipment_recovery_proposals and shipment_recovery_actions.

### Existing installation

Apply relevant incremental migrations in dependency order. Do not delete an existing database to update it. CREATE TABLE IF NOT EXISTS does not add missing columns to existing tables. The consolidated schema is a fresh-install definition, not a full upgrade mechanism.

### Demo account provisioning

Set DEV_SEED_PASSWORD in backend/.env, then run from backend/:

```powershell
npx tsx src/scripts/seed.ts
```

| Role | Email | Password |
|---|---|---|
| Dispatcher | dispatcher@swiftchain.test | DEV_SEED_PASSWORD used on first provisioning |
| Carrier | carrier@swiftchain.test | DEV_SEED_PASSWORD used on first provisioning |

Public registration creates a shipper. The seed refuses production mode and leaves existing accounts unchanged. Changing DEV_SEED_PASSWORD does not reset their passwords.

Run carrier_account_links.sql after account provisioning. Carrier records and carrier login accounts are separate: without the mapping, a carrier may see no bookings.

### Demo services

| Service | Route | Mode | Pickup | Transit | Base INR | INR/kg |
|---|---|---|---:|---:|---:|---:|
| SwiftChain Demo Carrier | Pune → Mumbai | ground | 30 min | 180 min | 1500 | 12 |
| SwiftChain Priority Air | Pune → Mumbai | air_ground | 15 min | 60 min | 8000 | 25 |
| Transfer via Navi Mumbai | Lonavala → Mumbai | air_ground | 5 min | 35 min | 5000 | 20 |
| Transfer via Panvel | Lonavala → Mumbai | ground | 5 min | 55 min | 3000 | 12 |

Transfer lanes have additional configured handoff allowances/charges and approach limits. See seed SQL for values. Demo carriers support all six cargo types and up to 10000 kg. No reverse Mumbai → Pune lane is seeded.

Your existing shipments, approvals and notifications do not automatically appear on a friend's fresh database. These are runtime records, not schema.

## 8. Redis with Docker

### First time only

Open Docker Desktop and wait until its engine is running. Then:

```powershell
docker run -d --name swiftchain-redis -p 127.0.0.1:6379:6379 -v swiftchain-redis-data:/data --restart unless-stopped redis:7-alpine redis-server --appendonly yes
```

This creates the container and persistent named volume. Redis is bound to the local machine.

Check it:

```powershell
docker exec swiftchain-redis redis-cli ping
```

Expected: PONG.

### Every subsequent run

```powershell
docker start swiftchain-redis
docker exec swiftchain-redis redis-cli ping
```

Do not rerun docker run for an existing container name.

### Inspect or stop

```powershell
docker ps -a
docker logs swiftchain-redis --tail 50
docker stop swiftchain-redis
```

Stopping preserves the volume. Do not delete its data as a routine troubleshooting step.

## 9. Start the complete application

Keep PostgreSQL running, open Docker Desktop and start Redis. Use four separate terminals, each initially opened at the project root.

### Terminal 1 — Python

```powershell
cd python-service
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Health: http://localhost:8000/health

API documentation: http://localhost:8000/docs

The explicit executable avoids needing PowerShell virtual-environment activation.

### Terminal 2 — Backend

```powershell
cd backend
npm run dev
```

Expected message:

```text
SwiftChain API running at http://localhost:5000
```

Health: http://localhost:5000/api/health

### Terminal 3 — SLA worker

```powershell
cd backend
npm run dev:sla
```

Expected default startup message:

```text
[SLA] Monitoring scheduled every 30 seconds
```

The worker uses upsertJobScheduler. It monitors active booked shipments, skips delivered ones, and may skip incomplete shipments with explanatory logs.

### Terminal 4 — Frontend

```powershell
cd frontend
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173. Strict port mode prevents silently starting on an origin the backend does not allow.

### Daily startup order

1. Ensure PostgreSQL is running.
2. Open Docker Desktop.
3. Start swiftchain-redis and confirm PONG.
4. Start Python.
5. Start backend.
6. Start SLA worker.
7. Start frontend.

### Shutdown

Press Ctrl+C in each of the four application terminals, then optionally run:

```powershell
docker stop swiftchain-redis
```

## 10. Pages, accounts and workflows

| Page | URL path |
|---|---|
| Login | /login |
| Registration | /register |
| Shipper overview | /dashboard/shipper |
| Shipment creation, quotes and booking | /shipments |
| Dispatcher overview | /dashboard/dispatcher |
| Recovery workspace | /dispatcher/recovery |
| Carrier operations | /dashboard/carrier |

All frontend paths use http://localhost:5173.

### Shipper

Register → Manage shipments → New Shipment → Get Quote → Confirm booking → View → Save route coordinates → Assign dispatcher.

Save full route coordinates **before recording movement**. A carrier's current-location preset does not define the shipment's pickup/destination coordinates.

### Dispatcher

Sign in → assigned shipments → Recovery workspace → generate alternatives → compare time/cost → approve.

Before-pickup options reject shipments that have moved. Transit recovery requires Picked Up or In Transit plus a location newer than two minutes. Proposals expire after five minutes; transit approval also rejects a changed position. Pause simulation while reviewing proposals.

### Carrier

Sign in → Inspect → Mark Picked Up → manual location or Start demo simulation → ordered milestones → Delivered.

Carrier account mapping controls which bookings appear. Simulation follows an approved recovery route when present and resumes from the latest recorded position. Run only one simulator per shipment at a time.

### Testing multiple roles

Normal tabs share cookies. Use a separate browser profile or incognito window for another account. Use two normal tabs with the same account for same-session tracking tests.

## 11. Demo scenarios

### Coordinates

| Demo position | Latitude | Longitude |
|---|---:|---:|
| Pune pickup | 18.5204 | 73.8567 |
| Approaching Lonavala | 18.6500 | 73.6000 |
| Lonavala hub | 18.7557 | 73.4091 |
| Mumbai destination | 19.0760 | 72.8777 |

Waypoint arrays use [longitude, latitude]. Input fields show latitude and longitude separately.

### Tracking and delivery

1. Create Pune → Mumbai as the shipper.
2. Book the slower SwiftChain Demo Carrier for a useful recovery demonstration.
3. Save route coordinates and assign the dispatcher.
4. As carrier, mark Picked Up and In Transit.
5. Simulate movement and observe shipper tracking in another session.
6. Stop and refresh; history/location should persist.
7. Record remaining milestones separately. Finishing simulation does not mark delivery.

### In-transit recovery

1. Send an approaching-Lonavala position, or simulate a few updates and stop.
2. Generate transfer routes within two minutes as the assigned dispatcher.
3. Compare Navi Mumbai and Panvel alternatives, including handoff time/charges.
4. Approve a valid improving option.
5. Confirm revised route, ETA, current carrier and cost breakdown.
6. Resume simulation along approved waypoints.

No-refund assumption: original booking cost remains committed; replacement service and transfer charges are additional. Recovery does not teleport the current position to the hub.

### SLA alert and recovery

Use a disposable active booked demo shipment with saved coordinates. Replace the placeholder below with its actual tracking code:

```sql
UPDATE public.shipments
SET deadline = NOW() - INTERVAL '1 minute',
    updated_at = NOW()
WHERE tracking_code = 'REPLACE_WITH_DEMO_TRACKING_CODE'
  AND status = 'booked'
RETURNING tracking_code, deadline;
```

Confirm one row returned. With the worker running, allow roughly 40 seconds on an idle local setup for assessment plus alert polling.

- A Delayed alert should appear.
- Unchanged risk should not generate repeated alerts.
- Mark as read and refresh; read status should persist.

Test recovery:

```sql
UPDATE public.shipments
SET deadline = NOW() + INTERVAL '2 days',
    updated_at = NOW()
WHERE tracking_code = 'REPLACE_WITH_DEMO_TRACKING_CODE'
  AND status = 'booked'
RETURNING tracking_code, deadline;
```

Expect a back-on-track notification after reassessment. These are temporary demo data changes, not migrations.

### What-If and impact prioritization

Inspect an active booked shipment and compare extra delay, slower/faster travel, hypothetical deadline shifts and additional cost. Refresh afterward: actual shipment/booking data must remain unchanged.

Estimated delay exposure = predicted late hours × configured hourly delay cost.

Financial-impact sorting uses fresh saved SLA assessments. Missing/old assessments are unknown rather than a fabricated zero. Hypothetical deadlines do not renegotiate actual SLAs, and estimated exposure reduction is not guaranteed savings.

## 12. Builds and verification

From backend:

```powershell
npm run typecheck
npm run build
npm run test:urgency
npm run test:carriers
npm run test:pricing
```

Run test scripts if present in the checkout's package.json.

From frontend:

```powershell
npm run build
```

Manual verification:

- Shippers only access their own shipments.
- Dispatchers require explicit assignment.
- Carriers only update bookings belonging to mapped services.
- Role dashboard guards redirect inappropriate roles.
- Milestones cannot skip order.
- Reapproving a proposal does not add another charge.
- Changed positions and route revisions invalidate stale operations.
- Approved recovery affects route-aware ETA and committed cost.
- Closing/changing the simulation selection stops future updates.
- Switching tabs does not unmount the tracking modal.
- Delivered shipments stop accepting progress updates and are skipped by SLA monitoring.
- Python failure shows a service error instead of inventing a delivery delay.
- Alerts and read state survive refresh.

The dashboard overview polls every 10 seconds; its ETA refreshes every 30 seconds and on relevant changes. The shipment tracking panel uses Socket.IO. Background cadence may slip under load or retries.

## 13. Troubleshooting

### Redis ECONNREFUSED 127.0.0.1:6379

Open Docker Desktop, start the container, check PONG, then restart the SLA worker:

```powershell
docker start swiftchain-redis
docker exec swiftchain-redis redis-cli ping
```

### Docker container name already exists

Use docker start, not another docker run. If the engine is unavailable, start Docker Desktop; docker --version only confirms the CLI is installed.

### PostgreSQL transaction aborted — 25P02

Run this alone in the same Query Tool, then fix the original SQL error:

```sql
ROLLBACK;
```

It clears the failed transaction, not previously committed data.

### Relation does not exist

```sql
SELECT current_database();
SELECT to_regclass('public.carrier_service_lanes');
```

Use swiftchain_db. Apply schema before seeds. Do not reorder dependency-linked blocks arbitrarily.

### Missing session_version, route_revision or other columns

Source and database schema differ. Apply the relevant incremental migration. CREATE TABLE IF NOT EXISTS alone does not upgrade an existing table.

### Google Client ID not configured

Check VITE_GOOGLE_CLIENT_ID in frontend, GOOGLE_CLIENT_ID in backend, the authorized origin and restarted processes.

### Authentication 401

GET /api/auth/me before login normally means no valid session. POST /api/auth/login 401 means credentials did not match an active password account. The account seed does not reset existing passwords.

### No eligible delivery options

Check demo service seeds, exact route direction, supported cargo, weight, active carrier and lane availability. A Lonavala-origin transfer lane cannot quote a new Pune-origin shipment. Recalculate expired quotes.

### Carrier sees no bookings

Run account seed before carrier_account_links.sql. Confirm the booked carrier record is mapped to that login.

### Dispatcher sees no shipments

The shipper must assign the dispatcher to the booked shipment. Creating the account does not create an assignment.

### Simulation says route coordinates are missing

Save origin/destination coordinates from the shipper's shipment details before movement. Carrier presets update only current position. Carrier simulation also requires Picked Up or later active progress.

If movement was recorded before route initialization, normal route editing is intentionally locked. Repair only the affected demo shipment after checking its route; do not reset unrelated data or approved plans.

### No improving transit alternative

The result may be correct: the current service may already be fast, the hub unreachable, or the destination too close. Use the slower ground carrier and a fresh approaching-Lonavala position for the demonstration.

### Proposal/route changed

Pause simulation, refresh, and regenerate options. Transit recovery only accepts Picked Up/In Transit and rejects stale positions or changed proposals.

### Python imports unresolved in VS Code

Select Python: Select Interpreter and choose python-service/.venv/Scripts/python.exe. Verify runtime separately using the explicit virtual-environment executable.

### ETA unavailable

Check Python /health, its terminal, backend logs, INTELLIGENCE_SERVICE_URL, saved route coordinates and booked lane transit time.

### Map worker failed to load

This is MapLibre's browser worker, not the Redis/BullMQ worker. Inspect browser console errors and map worker asset/CSP configuration. A raster basemap can appear while another map resource failed.

### Unexpected page redirect

Check the signed-in role and explicit ProtectedRoute entries in App.tsx. Creation/quotes are at /shipments; recovery is at /dispatcher/recovery.

## 14. Git and friend handoff

Commit application source, Python requirements/main.py, both package.json/lockfiles, env examples, database schema/migrations/seeds, account seed, README, update.md and ignore rules.

Do not commit filled .env files, credentials, node_modules, .venv, caches, logs, build output, Redis volumes or private database dumps. Changes entered only in pgAdmin are not pushed by Git; save SQL changes as files.

Review:

```powershell
git status --short
git diff --check
git diff --stat
git diff
```

Stage reviewed files, then inspect:

```powershell
git diff --cached
```

If private env files are already tracked, remove them from the index while retaining local files:

```powershell
git rm --cached --ignore-unmatch backend/.env frontend/.env
```

Then commit/push after review:

```powershell
git commit -m "Update logistics dashboards, recovery and what-if simulation"
git push
```

Production hosting needs separate configuration for HTTPS, public origins/session cookies, database/Redis access, process supervision and service availability. This README documents local development.
