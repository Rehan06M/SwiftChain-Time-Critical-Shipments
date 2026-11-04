# SwiftChain Development Update

## Current progress

Steps 8–10 are implemented for the local demo.
Step 11 supports recovery before pickup; recovery during transit remains pending.

## Setup and authentication fixes

- Added users.session_version for JWT session validation and logout.
- Added users.google_sub for Google authentication.
- Allowed password_hash to be NULL for Google-only accounts.
- Configured Google Client ID separately in backend and frontend.
- Fixed AuthContext background session refresh:
  switching tabs no longer unmounts the dashboard or tracking popup.
- PostGIS is not installed and is not required by the current implementation.

## Step 8 — Real-Time Shipment Tracking

Implemented:
- Saved pickup and destination coordinates.
- Tracking events stored in PostgreSQL.
- Milestones:
  Booked → Picked Up → In Transit → Out for Delivery → Delivered.
- Authenticated Socket.IO subscriptions.
- Shipment ownership checks.
- Live updates across browser tabs.
- MapLibre map with pickup, destination and current-location markers.
- Simulated location movement.
- Independent Save route coordinates action.
- Saved history and latest location after refresh.

Verified:
- Map displays and location simulation works.
- Tracking updates synchronize across tabs.
- Popup stays open when switching tabs.
- Saved coordinates and tracking history persist.
- Simulation controls disappear after delivery.

Limitations:
- Location updates are owner-controlled simulation.
- Actual driver accounts, GPS ingestion and carrier updates are not integrated.
- Map route is a straight simulation line, not a calculated road route.

## Step 9 — ETA Prediction and Delay Risk

Implemented:
- Python FastAPI intelligence service.
- GET /health.
- POST /predict/eta.
- Backend-to-Python integration.
- Shared shipment ETA service for API and worker.
- Remaining distance calculated from latest position to saved destination.
- Effective speed calibrated using booked lane transit time.
- Frontend ETA panel.
- Recalculation on tracking changes and every 30 seconds.
- Warning for missing or stale location data.

Risk rules:
- Delayed: deadline already passed.
- Critical Risk: estimated arrival leaves at most 30 minutes of buffer,
  including predicted late arrivals.
- At Risk: buffer is above 30 and at most 90 minutes.
- On Track: buffer exceeds 90 minutes.

Limitations:
- Rule-based estimate, not a trained machine-learning model.
- Straight-line distance; no actual road routing or live traffic.
- Estimates depend on the latest recorded position and configured lane times.

## Step 10 — SLA Monitoring and Automated Alerts

Implemented:
- Local Redis service.
- BullMQ background monitoring worker.
- upsertJobScheduler-based recurring scans.
- Default monitoring interval: 30 seconds.
- Latest assessment saved in shipment_sla_state.
- Notifications saved in shipment_alerts.
- Alerts generated on risk transitions.
- Recovery notification when risk returns to On Track.
- No notification for the initial On Track assessment.
- Duplicate prevention using shipment and transition version.
- User-scoped notification API.
- Persistent mark-as-read functionality.
- Frontend alert polling every 10 seconds.
- Service failures are logged/retried, not classified as shipment delays.

Verified:
- Delayed notification appears.
- Recovery notification is saved.
- Unchanged risk does not generate repeated alerts.
- Read status persists after refresh.

## Step 11 — Before-Pickup Recovery

Implemented:
- Shipment owner assigns an active dispatcher.
- Dispatcher sees assigned active booked shipments.
- Recovery recommendations reuse carrier matching and pricing.
- Faster eligible alternatives are saved as proposals.
- Proposals show:
  carrier, transport mode, estimated arrival, time saved,
  additional cost and deadline feasibility.
- Proposals expire after five minutes.
- Assigned dispatcher can approve.
- Approval rechecks:
  access, shipment state, booking, proposal expiry,
  carrier eligibility, price and time benefit.
- Approved recovery updates the active booking lane.
- Original pricing quote remains unchanged.
- Recovery actions are recorded for audit.
- Booking summary shows:
  current carrier, original service tier, original booking amount,
  recovery charges, recovery count and total committed cost.

Pricing assumption:
- No refund of the original booking.
- Replacement service price is an additional charge.

Verified:
- Dispatcher account provisioning and login.
- Dispatcher assignment.
- Recovery recommendation generation and approval.
- Replacement carrier appears in booking summary.
- Booking cost breakdown displays correctly.

Pending:
- Recovery during transit.
- Defined transfer locations and handoff times/costs.
- Alternate-route modelling.
- Rejection endpoint/UI and complete recovery history UI.
- Navigation link from the placeholder dispatcher dashboard.
- Automatic booking-summary refresh after approval in another tab.

## Demo data added

Carrier 1:
- SwiftChain Demo Carrier.
- Pune → Mumbai.
- Ground.
- Pickup: 30 minutes.
- Transit: 180 minutes.
- Base cost: INR 1,500.
- Per kg: INR 12.

Carrier 2:
- SwiftChain Priority Air.
- Pune → Mumbai.
- Air + ground.
- Pickup: 15 minutes.
- Transit: 60 minutes.
- Base cost: INR 8,000.
- Per kg: INR 25.

Both support all six cargo types and up to 10,000 kg.
No reverse-route lane was seeded.

Development account seed:
- dispatcher@swiftchain.test
- carrier@swiftchain.test
- Password comes from DEV_SEED_PASSWORD.
- Existing accounts are not overwritten.

## Important files added or changed

Backend:
- src/server.ts
- src/realtime/tracking.socket.ts
- src/routes/tracking.routes.ts
- src/routes/alert.routes.ts
- src/routes/recovery.routes.ts
- src/routes/commerce.routes.ts
- src/services/eta.service.ts
- src/services/shipment-eta.service.ts
- src/workers/sla.worker.ts
- src/scripts/seed.ts
- package.json and package-lock.json
- tsconfig.json if Node types were updated
- .env.example

Frontend:
- src/context/AuthContext.tsx
- src/components/TrackingMap.tsx
- src/components/ShipmentTracking.tsx
- src/components/ShipmentETA.tsx
- src/components/ShipmentAlerts.tsx
- src/components/DispatcherAssignment.tsx
- src/components/BookingSummary.tsx
- src/pages/DispatcherRecovery.tsx
- src/pages/Shipments.tsx
- src/lib/tracking.ts
- src/lib/commerce.ts
- src/App.tsx
- src/App.css
- package.json and package-lock.json
- .env.example

Python:
- python-service/main.py
- python-service/requirements.txt

Database:
- Original Steps 1–7 schema/migrations.
- Incremental Steps 8–11 migration.
- Demo carrier seed.

## Local startup

Keep these running in separate terminals.

Redis:
```powershell
docker start swiftchain-redis
```

Python, from python-service:
```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend:
```powershell
npm run dev
```

SLA worker, from backend:
```powershell
npm run dev:sla
```

Frontend:
```powershell
npm run dev
```

URLs:
- Frontend: http://localhost:5173
- Backend health: http://localhost:5000/api/health
- Python health: http://localhost:8000/health
- Python docs: http://localhost:8000/docs
- Dispatcher recovery: http://localhost:5173/dispatcher/recovery

## Remaining roadmap

- Finish in-transit recovery scope for Step 11.
- Step 12: Complete role-based dashboards.
- Step 13: Advanced logistics features.
- Step 14: End-to-end testing and hackathon demo.
- Step 15: Deployment and final presentation.

## Handoff notes

- Current verification was manual and user-reported.
- A full automated test suite and production deployment were not performed.
- Monitoring currently holds a shipment lock while requesting ETA;
  review database pool usage and throughput before scaling.
- Test-only deadline updates are not permanent migrations.
- Do not commit .env files, passwords, JWT secrets or private database dumps.