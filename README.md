# 🚚 SwiftChain — Intelligent Time-Critical Logistics Platform

**Create. Monitor. Optimize.**

SwiftChain is a full-stack logistics management platform designed to make time-critical shipments smarter, more transparent, and easier to manage.

It connects **Shippers, Carriers, and Dispatchers** in a unified workspace, helping teams compare delivery options, monitor shipment progress, estimate delivery risks, and coordinate recovery actions when deadlines are threatened.

Built as a hackathon project, SwiftChain demonstrates how intelligent decision support, real-time tracking, and multi-role coordination can improve urgent logistics operations.

**Live Application:** https://swift-chain-time-critical-shipments.vercel.app

**Backend API:** https://swiftchain-api.onrender.com/api/health

**Python ETA Service:** https://swiftchain-eta.onrender.com/health

> **Demo notice:** Carrier services, prices, shipment movements, and certain recovery scenarios are simulated for demonstration purposes. SwiftChain does not currently integrate with external carrier dispatch systems, live GPS providers, payment gateways, or live traffic services.

---

## 🎯 Problem Statement

Time-critical logistics operations face several challenges:

- Limited visibility into shipment movement and delivery status.
- Difficulty comparing carriers for urgent deliveries.
- Delayed identification of shipments at risk of missing deadlines.
- Fragmented coordination between shippers, carriers, and dispatchers.
- Lack of structured recovery workflows when disruptions occur.
- Unclear financial consequences of shipment delays.

SwiftChain addresses these challenges through a shared, role-based logistics platform that combines carrier selection, shipment tracking, ETA estimation, SLA monitoring, and recovery planning.

---

## ✨ Key Features

### 📦 1. Shipment Creation and Urgency Scoring

Shippers can create shipments with details such as origin, destination, cargo type, weight, delivery deadline, and estimated delay impact.

SwiftChain calculates an urgency score to support time-sensitive delivery decisions.

### 🚛 2. Carrier Comparison and Booking

Compare available delivery services using information such as:

- Estimated pickup and transit time.
- Carrier reliability.
- Delivery cost.
- Cargo and weight eligibility.
- Deadline feasibility.
- Available service routes.

A Shipper can select a suitable service and confirm an internal booking.

The demonstration carrier catalog includes **SwiftChain Demo Carrier** and **SwiftChain Priority Air**, with an expanded simulated network covering multiple Indian logistics locations.

### 👥 3. Three Role-Based Workspaces

SwiftChain provides separate interfaces and backend permissions for three logistics roles.

| Role | Main Responsibilities |
|------|-----------------------|
| **Shipper** | Create shipments, compare carriers, confirm bookings, assign dispatchers, and monitor delivery progress |
| **Carrier** | View shipments booked with its mapped company, update milestones, and record shipment movement |
| **Dispatcher** | Monitor assigned shipments, analyze delay risks, inspect recovery options, and approve eligible recovery actions |

Users see shipments according to their role and authorized relationships.

### 📍 4. Shipment Tracking and Visualization

- Interactive shipment maps powered by MapLibre GL.
- Pickup and destination coordinates.
- Shipment status milestones.
- Tracking history and location updates.
- Simulated shipment movement.
- Socket.IO-based real-time updates.

Tracking events are persisted in PostgreSQL.

### ⏱️ 5. ETA Prediction and SLA Risk Monitoring

SwiftChain includes a separate Python FastAPI intelligence service for estimated arrival calculations.

The application uses available shipment data to support:

- Estimated delivery time.
- Deadline-risk assessment.
- Delay exposure calculations.
- Shipment monitoring.
- Risk and recovery notifications.

Background monitoring uses **Redis and BullMQ**.

### 🔄 6. Logistics Recovery Management

Authorized Dispatchers can review and approve eligible recovery options.

Supported demonstration scenarios include:

**Before-pickup recovery:** Evaluate alternative services before the shipment begins moving.

**In-transit recovery:** Explore configured transfer routes when a shipment is in transit and meets the necessary location and eligibility conditions.

Recovery actions are recorded for traceability.

### 🧪 7. What-If Logistics Simulator

Users can explore hypothetical scenarios without modifying the original booking.

Supported inputs include:

- Travel speed changes.
- Additional transit delays.
- Deadline adjustments.
- Additional transportation costs.

The simulator helps illustrate how operational decisions could affect estimated arrival time and financial exposure.

### 🤖 8. Logistics Copilot

An integrated logistics assistant provides shipment-focused explanations and operational insights.

It supports deterministic, rules-based responses and optional AI-generated explanations when the external AI service is configured and available.

The assistant operates within the authenticated user's authorized shipment scope.

### 🔐 9. Authentication and Authorization

- Email/password authentication.
- Google sign-in integration.
- HTTP-only session cookies.
- Backend role-based authorization.
- Dispatcher and Carrier invitation-controlled registration.
- Carrier-account company mappings.
- Session validation and revocation.
- API rate limiting for sensitive operations.

---

## 🏗️ System Architecture

```text
                   SWIFTCHAIN
              React + TypeScript
                   Vercel
                     |
                     | HTTPS REST API
                     v
             Express.js Backend
                   Render
                     |
        +------------+------------+
        |            |            |
        v            v            v
   PostgreSQL      Redis      Python FastAPI
      Neon        BullMQ       ETA Service
        |            |            |
        |            v            |
        |       SLA Monitoring    |
        |                         |
        +-------------------------+

   Socket.IO enables real-time
   shipment tracking updates.
```

### Technology Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React, TypeScript, Vite, React Router |
| UI and Icons | CSS, Lucide React |
| Maps | MapLibre GL, OpenStreetMap |
| Backend | Node.js, Express.js, TypeScript |
| Authentication | JWT, bcryptjs, Google OAuth |
| Database | PostgreSQL |
| Background Processing | Redis, BullMQ |
| Real-Time Communication | Socket.IO |
| ETA Intelligence | Python, FastAPI |
| Optional AI | Groq |
| Frontend Hosting | Vercel |
| Backend and ETA Hosting | Render |
| Cloud Database | Neon |

---

## 🔁 How SwiftChain Works

The application's central workflow connects three roles around a single shipment.

**Step 1 — Shipper creates a shipment**

The Shipper enters the shipment details, deadline, cargo information, and delay impact.

**Step 2 — SwiftChain evaluates delivery services**

The platform calculates urgency, checks eligible carrier services, and presents delivery options.

**Step 3 — Shipper books a Carrier**

The selected service becomes the shipment's active booking.

**Step 4 — Shipper assigns a Dispatcher**

An authorized Dispatcher gains visibility into the shipment and responsibility for monitoring its operational risks.

**Step 5 — Carrier executes the delivery**

The Carrier account associated with the booked company can record pickup, transit, location, and delivery milestones.

**Step 6 — SwiftChain monitors progress**

Tracking events, ETA calculations, SLA assessments, and notifications help users understand delivery progress.

**Step 7 — Dispatcher manages disruptions**

When eligible alternatives are available, the Dispatcher can review and approve recovery actions.

**Step 8 — Shipment is delivered**

The shipment's history and final delivery status are available to authorized users.

> A Carrier sees bookings associated with its mapped carrier company. A Dispatcher sees shipments explicitly assigned to their account. Booking a Carrier does not automatically assign a Dispatcher.

---

## 📂 Project Structure

```text
SwiftChain/
│
├── frontend/
│   ├── public/
│   │   └── landing.html
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   └── pages/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── realtime/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── scripts/
│   │   ├── workers/
│   │   └── server.ts
│   └── package.json
│
├── python-service/
│   ├── main.py
│   └── requirements.txt
│
├── database/
│   ├── migrations/
│   └── seeds/
│
└── README.md
```

---

## 💻 Running SwiftChain Locally

### Prerequisites

Install:

- Node.js and npm.
- Python 3.10 or newer.
- PostgreSQL.
- Docker Desktop, for Redis.
- Git.

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

Replace the placeholders with the actual SwiftChain GitHub repository details.

### 2. Configure PostgreSQL

Create a local PostgreSQL database named:

```text
swiftchain_db
```

Apply the consolidated database schema and appropriate seed files from the `database` directory.

Use the repository's migrations when updating an existing database rather than blindly reapplying the consolidated schema.

**Cloud deployment note:** The deployed Neon PostgreSQL database is named **`neondb`**, whereas the local development database is named `swiftchain_db`.

### 3. Start Redis

With Docker running:

```bash
docker run -d --name swiftchain-redis -p 6379:6379 redis:7
```

If the container already exists:

```bash
docker start swiftchain-redis
```

### 4. Start the Python ETA Service

```bash
cd python-service
python -m venv .venv
```

Activate the virtual environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn main:app --reload --port 8000
```

Health endpoint:

```text
http://127.0.0.1:8000/health
```

### 5. Start the Express Backend

Open a new terminal:

```bash
cd backend
npm ci
```

Create `backend/.env` using the appropriate local environment configuration.

Example:

```dotenv
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=5432
DB_NAME=swiftchain_db
DB_USER=postgres
DB_PASSWORD=YOUR_LOCAL_POSTGRES_PASSWORD

JWT_SECRET=YOUR_RANDOM_SECRET
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID

INTELLIGENCE_SERVICE_URL=http://127.0.0.1:8000
REDIS_URL=redis://127.0.0.1:6379
SLA_MONITOR_INTERVAL_MS=30000

ROLE_SIGNUP_INVITE_CODE=YOUR_PRIVATE_INVITATION_CODE
```

Generate a strong JWT secret and never commit real `.env` files to GitHub.

Start the backend:

```bash
npm run dev
```

Backend health:

```text
http://localhost:5000/api/health
```

### 6. Start the SLA Worker

If you're running the worker as a separate development process, open another terminal:

```bash
cd backend
npm run dev:sla
```

This worker requires PostgreSQL, Redis, and the Python ETA service to be accessible.

### 7. Start the React Frontend

Open another terminal:

```bash
cd frontend
npm ci
```

Create `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

---

## 🚀 Cloud Deployment

SwiftChain uses a free-tier-oriented deployment architecture.

| Component | Hosting |
|-----------|---------|
| React frontend | Vercel |
| Express API and Socket.IO | Render |
| Python ETA service | Render |
| PostgreSQL database (`neondb`) | Neon |
| Redis | Render |
| SLA worker | Co-located with Express for the hackathon deployment |

### Frontend Production Environment

```dotenv
VITE_API_URL=/api
VITE_SOCKET_URL=https://swiftchain-api.onrender.com
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
```

The Vercel frontend proxies regular API requests to Render, while Socket.IO connects to the backend's real-time endpoint.

### Backend Production Environment

The backend uses the Neon PostgreSQL connection string and hosted service URLs.

Required values include:

```dotenv
NODE_ENV=production
FRONTEND_URL=YOUR_VERCEL_HTTPS_URL

DATABASE_URL=YOUR_NEON_POSTGRESQL_CONNECTION_STRING

JWT_SECRET=YOUR_RANDOM_SECRET
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID

REDIS_URL=YOUR_RENDER_REDIS_URL
INTELLIGENCE_SERVICE_URL=https://swiftchain-eta.onrender.com

ROLE_SIGNUP_INVITE_CODE=YOUR_PRIVATE_INVITATION_CODE
SLA_MONITOR_INTERVAL_MS=30000
```

Secrets must be configured in the hosting platform's environment settings, not committed to the repository.

### Free Hosting Limitations

Free-tier services can sleep during inactivity and may experience cold-start delays.

The co-located SLA worker cannot provide continuous monitoring when the backend is sleeping. Redis persistence and available instance-hours are also subject to hosting-plan limits.

This deployment is intended primarily for project evaluation and demonstration rather than a guaranteed always-on commercial system.

---

## 🧪 Testing

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Backend

```bash
cd backend
npm run typecheck
npm run build
npm run test:urgency
npm run test:carriers
npm run test:pricing
```

### Manual Integration Testing

A complete end-to-end demonstration should verify:

1. A Shipper creates a shipment.
2. Eligible carrier quotes are generated.
3. The Shipper confirms a booking.
4. A Dispatcher is explicitly assigned.
5. A mapped Carrier account sees the booking.
6. The Carrier records tracking milestones.
7. Authorized users can see shipment progress.
8. ETA and What-If calculations work when the Python service is available.
9. Eligible recovery proposals can be reviewed and approved.
10. Unauthorized users cannot access unrelated shipments.

---

## 🎬 Suggested Hackathon Demo

**Scenario: Urgent industrial goods delivery from Pune to Mumbai**

A Shipper creates a 100 kg industrial shipment with a delivery deadline and financial delay impact.

SwiftChain scores its urgency and compares available services such as SwiftChain Demo Carrier and SwiftChain Priority Air.

After booking, the Shipper assigns a Dispatcher and saves the route coordinates.

The Carrier updates the shipment's tracking milestones while the Dispatcher monitors ETA and delay risk.

A separate eligible shipment demonstrates how the Recovery Workspace evaluates alternative delivery options.

Finally, the Shipper reviews the updated tracking history and shipment status.

**The key demonstration is the same shipment appearing across three separate role-based workspaces with different permissions.**

---

## 🔮 Future Improvements

- Integration with real-world carrier APIs.
- Automatic GPS tracking through driver devices.
- Live traffic and weather-based ETA refinement.
- Automatic route-coordinate initialization and route optimization.
- Carrier availability and acceptance workflows.
- Advanced delay prediction using historical shipment data.
- Real-time operational service-health monitoring.
- More comprehensive automated end-to-end testing.
- Persistent, always-on background monitoring.
- Enterprise-grade onboarding and carrier verification.

---

## ⚠️ Project Limitations

SwiftChain is a hackathon demonstration platform.

- Carrier services and prices are simulated.
- ETA predictions are estimates, not delivery guarantees.
- Location simulation is not a real GPS feed.
- Recovery options depend on configured lanes and eligibility rules.
- The What-If Simulator does not alter actual bookings.
- Google authentication and optional AI features depend on external configuration and availability.
- Free hosting services may sleep, restart, or temporarily become unavailable.

The platform demonstrates an integrated logistics workflow, but it is not currently intended for handling real-world commercial shipments without additional integrations, reliability measures, and operational controls.

---

## 🎓 Project Purpose

SwiftChain was developed to demonstrate how modern web technologies, real-time communication, intelligent logistics calculations, and role-based operational workflows can improve the management of time-critical shipments.

The project emphasizes practical coordination between the three primary participants in logistics:

**Shipper · Carrier · Dispatcher**

### SwiftChain — Move Faster. Stay Ahead.
