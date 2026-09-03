# EXPLAIN.md — CBDC Ration Portal (પળી ગ્રામ પંચાયત)

> **Complete Technical Knowledge Base**
> Generated: 2026-08-11 | Based on current codebase analysis

---

## Table of Contents

- [1. Project Identification](#1-project-identification)
- [2. Executive Summary](#2-executive-summary)
- [3. Complete Project Structure](#3-complete-project-structure)
- [4. Architecture](#4-architecture)
- [5. Technology Stack](#5-technology-stack)
- [6. Entry Points](#6-entry-points)
- [7. Core Modules](#7-core-modules)
- [8. Data Flow](#8-data-flow)
- [9. Database / Data Storage](#9-database--data-storage)
- [10. API / Communication Layer](#10-api--communication-layer)
- [11. Authentication & Authorization](#11-authentication--authorization)
- [12. Security Analysis](#12-security-analysis)
- [13. Frontend / UI](#13-frontend--ui)
- [14. Backend / Server](#14-backend--server)
- [15. External Services & Integrations](#15-external-services--integrations)
- [16. State Management & Caching](#16-state-management--caching)
- [17. Error Handling](#17-error-handling)
- [18. Testing](#18-testing)
- [19. Build System](#19-build-system)
- [20. Configuration & Environment Variables](#20-configuration--environment-variables)
- [21. Dependencies](#21-dependencies)
- [22. Deployment](#22-deployment)
- [23. Local Development](#23-local-development)
- [24. Important User / Business Flows](#24-important-user--business-flows)
- [25. Performance Analysis](#25-performance-analysis)
- [26. Scalability](#26-scalability)
- [27. Code Quality](#27-code-quality)
- [28. Legacy / Unused / Suspicious Files](#28-legacy--unused--suspicious-files)
- [29. Known Issues](#29-known-issues)
- [30. Limitations](#30-limitations)
- [31. Architectural Decisions](#31-architectural-decisions)
- [32. Future Roadmap](#32-future-roadmap)
- [33. Important File Index](#33-important-file-index)
- [34. Glossary](#34-glossary)
- [35. Final System Summary](#35-final-system-summary)

---

## 1. Project Identification

| Attribute | Value |
|---|---|
| **Project Name** | CBDC Ration Portal (CBDCP) |
| **Codebase Name** | `CBDCP` (Central Bank Digital Currency Distribution & Control Portal) |
| **Project Type** | Full-stack web application (client-server) |
| **Primary Purpose** | Manage and track the onboarding of ration card beneficiaries for the CBDC (Digital Rupee / e₹) pilot programme in Pali village, Gujarat, India |
| **Main Problem Solved** | Provides a digital system for the village Talati (administrative clerk) to track which beneficiaries have been onboarded to the CBDC digital ration distribution system, and for citizens to check their eligibility |
| **Intended Users** | 1. **Citizens** of Pali village — check eligibility and learn about the CBDC process. 2. **Talati (તલાટી)** — administrative officer who manages onboarding status, generates official PDF/Excel reports |
| **Primary Language** | **Gujarati (ગુજરાતી)** for UI, English for code |
| **Main Technologies** | Python (FastAPI), Vanilla HTML/CSS/JS |
| **Architecture Style** | Client-server, separated frontend (static site) and backend (REST API) |
| **Deployment Model** | Frontend on **Vercel** (static), Backend on **Render** (Python web service) |
| **External Services** | Vercel, Render, SheetJS CDN, html2pdf.js CDN, Google Fonts |
| **Domain** | Government/public administration — ration distribution digitization |

---

## 2. Executive Summary

The **CBDC Ration Portal** is a full-stack web application built for **Pali Gram Panchayat** (Village Council), Taluka Unjha, District Mehsana, Gujarat, India. It supports the Reserve Bank of India's **CBDC (Central Bank Digital Currency / e₹)** pilot programme for digitizing ration (food grain) distribution through the Public Distribution System (PDS).

### What it does

- **Public-facing portal**: Citizens can search for their name or ration card number to check CBDC eligibility. They can view step-by-step onboarding instructions with screenshots.
- **Admin (Talati) portal**: The village Talati authenticates via username/password, then manages the onboarding status of each beneficiary with a one-click toggle switch. The admin can generate government-style official PDF and Excel reports with customizable filters, column selection, watermarks, and signature/stamp blocks.
- **Data synchronization**: The frontend polls the backend API every 5 seconds for real-time data. When the API is unreachable, it falls back to a static JSON file (`data.json`) with local overrides stored in `localStorage`.

### Key numbers

- **270 beneficiaries** across **162 ration cards** (households)
- Card types: PHH (Priority Household), AAY (Antyodaya Anna Yojana), APL-1 (Above Poverty Line), BPL (Below Poverty Line)
- 1 default admin user (Talati)

### Project maturity

The project is a **working pilot** — functional for its intended use case but with limited scope. There are no automated tests, no CI/CD pipeline, and the deployment configuration is minimal. The codebase is clean and focused but is clearly a single-developer production prototype.

---

## 3. Complete Project Structure

```
CBDCP/
├── .git/                           # Git repository data
├── .gitignore                      # Ignores *.db, __pycache__, venv, .env, OS files
├── README.md                       # Project overview, setup, and deployment instructions
├── render.yaml                     # Render.com Infrastructure-as-Code deployment config
├── venv/                           # Python virtual environment (gitignored)
│
├── backend/
│   ├── .env                        # Local environment variables (gitignored)
│   ├── .env.example                # Template for required environment variables
│   ├── main.py                     # FastAPI application — all API routes, middleware, DB logic
│   ├── seed.py                     # Database seeding script — creates tables and loads data.json
│   ├── requirements.txt            # Python dependencies (fastapi, uvicorn, pydantic, PyJWT, bcrypt, psycopg2-binary)
│   ├── database.db                 # SQLite database file (gitignored, auto-created by seed)
│   ├── reports/                    # Empty directory — placeholder for generated reports
│   └── __pycache__/                # Python bytecode cache (gitignored)
│
└── frontend/
    ├── index.html                  # Single-page application — entire UI in one 1028-line HTML file
    ├── vercel.json                 # Vercel deployment config — API proxy rewrites to Render backend
    └── assets/
        ├── css/
        │   └── style.css           # Complete stylesheet (4175 lines) — design system, responsive layout, skeletons
        ├── js/
        │   └── app.js              # Application logic (2272 lines) — API client, state management, rendering, export
        ├── data/
        │   └── data.json           # Static fallback beneficiary data (270 entries, 4600 lines)
        └── images/
            ├── logo_web.png        # Pali Gram Panchayat logo/seal
            └── steps/
                ├── step1.jpg       # Step-by-step CBDC onboarding screenshot 1
                ├── step2.jpg       # Step-by-step CBDC onboarding screenshot 2
                ├── step3.jpg       # Step-by-step CBDC onboarding screenshot 3
                ├── step4.jpg       # Step-by-step CBDC onboarding screenshot 4
                ├── step5.jpg       # Step-by-step CBDC onboarding screenshot 5
                ├── step6.jpg       # Step-by-step CBDC onboarding screenshot 6
                ├── step7.jpg       # Step-by-step CBDC onboarding screenshot 7
                └── step8.jpg       # Step-by-step CBDC onboarding screenshot 8
```

### Key file details

| Path | Purpose | Importance |
|---|---|---|
| `backend/main.py` | **All** backend logic — FastAPI app, routes, DB connections, auth, CORS, middleware, static file serving | **Critical** |
| `backend/seed.py` | Creates database schema (SQLite or PostgreSQL), seeds default admin user, loads beneficiary data from `data.json` | **Critical** |
| `frontend/index.html` | Entire frontend SPA — all tabs, modals, forms, navigation, and export UI | **Critical** |
| `frontend/assets/js/app.js` | All frontend logic — API client, state management, DOM rendering, session management, PDF/Excel generation | **Critical** |
| `frontend/assets/css/style.css` | Complete design system — CSS custom properties, responsive breakpoints, skeleton loaders, all component styles | **High** |
| `frontend/assets/data/data.json` | Static fallback data with 270 beneficiary records, used when backend API is unreachable | **High** |
| `render.yaml` | Render.com deployment blueprint for backend service | **Medium** |
| `frontend/vercel.json` | Vercel deployment config with API proxy rewrite rules | **Medium** |

---

## 4. Architecture

### Overall architecture: Separated client-server

The project uses a **separated full-stack architecture** where the frontend and backend are independently deployed:

```
┌─────────────────────────────────────────────────────────────┐
│                      USER (Browser)                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Frontend (Static SPA)                      │   │
│  │  Hosted on: Vercel (pali-omega.vercel.app)          │   │
│  │  Tech: Vanilla HTML + CSS + JavaScript              │   │
│  │                                                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐  │   │
│  │  │ Home Tab │ │ List Tab │ │Step Tab │ │Info Tab│  │   │
│  │  └──────────┘ └──────────┘ └─────────┘ └────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │           Admin (Talati) Tab                    │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌─────────┐       │  │   │
│  │  │  │Dashboard │ │ Status  │ │ Sharing │        │  │   │
│  │  │  └──────────┘ └──────────┘ └─────────┘       │  │   │
│  │  │  ┌──────────┐ ┌──────────────────────┐       │  │   │
│  │  │  │ Reports │ │  Export Modal (PDF/  │        │  │   │
│  │  │  │         │ │  Excel with preview) │        │  │   │
│  │  │  └──────────┘ └──────────────────────┘       │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                              │                  │
│     API calls (fetch)           Static fallback             │
│     /api/*                      data.json                   │
└───────────┼──────────────────────────┼──────────────────────┘
            │                          │
    ┌───────▼──────────┐       (local file)
    │  Vercel Rewrite  │
    │  Proxy Layer     │
    │  /api/* → Render │
    └───────┬──────────┘
            │
    ┌───────▼───────────────────────────────────────────┐
    │              Backend (FastAPI)                      │
    │  Hosted on: Render (cbdc-backend.onrender.com)     │
    │  Tech: Python, FastAPI, Uvicorn                    │
    │                                                     │
    │  ┌──────────┐  ┌────────────┐  ┌───────────────┐  │
    │  │  Auth    │  │ Beneficiary│  │  Audit Log   │  │
    │  │  Routes  │  │  Routes    │  │  Routes      │  │
    │  └──────────┘  └────────────┘  └───────────────┘  │
    │  ┌──────────┐  ┌────────────┐                     │
    │  │ Dashboard│  │  Sync      │                     │
    │  │  Route   │  │  Route     │                     │
    │  └──────────┘  └────────────┘                     │
    │                      │                             │
    │         ┌────────────▼────────────┐               │
    │         │   Database Abstraction  │               │
    │         │   (SQLite / PostgreSQL) │               │
    │         └────────────┬────────────┘               │
    │                      │                             │
    │    ┌─────────────────▼─────────────────┐          │
    │    │  SQLite (local) or PostgreSQL     │          │
    │    │  (Render managed via DATABASE_URL)│          │
    │    └───────────────────────────────────┘          │
    └───────────────────────────────────────────────────┘
```

### Local development mode

In local development (when the `RENDER` env var is **not** set), the FastAPI backend also serves the `frontend/` directory as static files via `StaticFiles` middleware. This means a single `python backend/main.py` command starts both frontend and backend at `http://127.0.0.1:8080`.

### Key architectural patterns

1. **API-first design**: All data operations go through REST endpoints (`/api/*`).
2. **Offline-capable frontend**: When the API is unreachable, the frontend loads data from `data.json` and stores onboarding changes in `localStorage`.
3. **Dual-database support**: The backend transparently supports both SQLite (local) and PostgreSQL (production) via a `DatabaseConnection`/`DatabaseCursor` wrapper that translates `?` placeholders to `%s`.
4. **Optimistic concurrency control**: A `version` field on beneficiary records prevents conflicting updates from multiple admin sessions.
5. **JSON backup sync**: After each onboarding update, the backend regenerates `data.json` from the database, keeping the static fallback in sync.

---

## 5. Technology Stack

| Category | Technology | Version | Purpose | Evidence |
|---|---|---|---|---|
| **Language (Backend)** | Python | 3.x | Server-side application logic | `backend/requirements.txt`, `backend/main.py` |
| **Framework (Backend)** | FastAPI | ≥ 0.100.0 | REST API framework with auto-validation | `backend/requirements.txt` |
| **ASGI Server** | Uvicorn | ≥ 0.22.0 | Production-grade ASGI server | `backend/requirements.txt` |
| **Validation (Backend)** | Pydantic | ≥ 2.0 | Request body validation and serialization | `backend/requirements.txt` |
| **Auth (Backend)** | PyJWT | ≥ 2.7.0 | JWT token generation and validation | `backend/requirements.txt` |
| **Password Hashing** | bcrypt | ≥ 4.0.0 | Secure password hashing | `backend/requirements.txt` |
| **Database (Local)** | SQLite | Built-in | Local/dev database | `backend/main.py` (sqlite3 module) |
| **Database (Production)** | PostgreSQL | Via psycopg2 | Production database on Render | `backend/requirements.txt` (psycopg2-binary) |
| **Language (Frontend)** | HTML5, CSS3, JavaScript (ES6+) | N/A | Client-side UI | `frontend/index.html`, `frontend/assets/js/app.js` |
| **Fonts** | Google Fonts (Noto Sans Gujarati, Outfit) | N/A | Gujarati script and Latin typography | `frontend/index.html` (link tag) |
| **PDF Generation** | html2pdf.js | 0.10.1 | Client-side HTML-to-PDF conversion | `frontend/index.html` (CDN script) |
| **Spreadsheet Generation** | SheetJS (xlsx) | 0.18.5 | Client-side Excel file generation | `frontend/index.html` (CDN script) |
| **Hosting (Frontend)** | Vercel | N/A | Static site hosting with API rewrites | `frontend/vercel.json` |
| **Hosting (Backend)** | Render | N/A | Python web service hosting | `render.yaml` |
| **Version Control** | Git | N/A | Source code management | `.git/` directory |

---

## 6. Entry Points

### Backend entry point

| Attribute | Value |
|---|---|
| **Entry point** | Application startup |
| **File** | `backend/main.py` (line 648–653) |
| **Command** | `python backend/main.py` |
| **Purpose** | Start the FastAPI ASGI server via Uvicorn |
| **What happens** | 1. `FastAPI` app is created. 2. `@app.on_event("startup")` runs: checks database state, auto-seeds if needed, runs migrations. 3. CORS middleware is configured. 4. If not on Render, frontend static files are mounted at `/`. 5. Uvicorn starts on `127.0.0.1:8080` (local) or `0.0.0.0:$PORT` (Render). Hot-reload is enabled locally. |

### Database seeding entry point

| Attribute | Value |
|---|---|
| **Entry point** | Database seed script |
| **File** | `backend/seed.py` (line 227–229) |
| **Command** | `python backend/seed.py` or `python backend/seed.py --force` |
| **Purpose** | Create database tables, seed default admin user, and load beneficiary data from `data.json` |
| **What happens** | 1. Detects `DATABASE_URL` for PostgreSQL or defaults to SQLite. 2. Creates 4 tables: `users`, `beneficiaries`, `audit_logs`, `metadata`. 3. Inserts the default Talati admin user. 4. Reads `frontend/assets/data/data.json` and inserts all 270 beneficiary records and metadata. |

### Frontend entry point

| Attribute | Value |
|---|---|
| **Entry point** | Browser page load |
| **File** | `frontend/index.html` |
| **Command** | Open `http://127.0.0.1:8080` in browser (local) or navigate to Vercel URL |
| **Purpose** | Load the single-page application |
| **What happens** | 1. HTML structure loads with all 5 tab sections. 2. CSS (`style.css`) applies the design system. 3. `app.js` loads: `DOMContentLoaded` fires, initializing router, search, admin auth, lightbox, action cards, and export modal listeners. 4. Session restoration is attempted from `sessionStorage`. 5. `loadData()` is called — first tries API, falls back to `data.json`. 6. Auto-refresh (5s polling) begins. |

---

## 7. Core Modules

### 7.1 ApiClient (`frontend/assets/js/app.js`, lines 6–112)

| Attribute | Value |
|---|---|
| **Purpose** | HTTP client wrapper for all backend API communication |
| **Responsibilities** | Token management (set/clear/restore from sessionStorage), request construction with auth headers, response parsing, superseded-request detection for GET deduplication |
| **Inputs** | Method, path, optional body |
| **Outputs** | Parsed JSON response or thrown error |
| **Dependencies** | Browser `fetch` API, `sessionStorage` |
| **Consumers** | All frontend functions that interact with the backend |
| **Key methods** | `login()`, `logout()`, `getMe()`, `getBeneficiaries()`, `getBeneficiary()`, `updateOnboarding()`, `getDashboard()`, `getAudit()`, `getSyncLatest()` |

### 7.2 Session Manager (`frontend/assets/js/app.js`, lines 151–358)

| Attribute | Value |
|---|---|
| **Purpose** | Manage admin (Talati) authentication sessions |
| **Responsibilities** | Create sessions with JWT-derived expiry, restore sessions on page reload, destroy sessions on logout/expiry, update session badge UI, schedule expiry timers |
| **Inputs** | JWT token, user object |
| **Outputs** | Session state updates to `adminState` global |
| **Dependencies** | `ApiClient`, `sessionStorage`, JWT payload parsing |
| **Key functions** | `createAdminSession()`, `checkAndRestoreAdminSession()`, `destroyAdminSession()`, `scheduleSessionExpiryTimer()` |

### 7.3 Data Loading & Merging (`frontend/assets/js/app.js`, lines 492–601)

| Attribute | Value |
|---|---|
| **Purpose** | Load beneficiary data from API or static fallback and group into households |
| **Responsibilities** | Attempt API fetch, fall back to `data.json`, merge local overrides from `localStorage`, group beneficiaries by ration card number into households |
| **Inputs** | None (reads from API or static file) |
| **Outputs** | Populates `appData.beneficiaries`, `appData.households`, `appData.metadata` |
| **Dependencies** | `ApiClient`, `localStorage` for offline overrides |
| **Key functions** | `loadData()`, `loadDataFromAPI()`, `loadOnboardingOverrides()`, `groupHouseholds()` |

### 7.4 Database Abstraction Layer (`backend/main.py`, lines 182–262)

| Attribute | Value |
|---|---|
| **Purpose** | Provide a unified interface for SQLite and PostgreSQL database operations |
| **Responsibilities** | Transparently translate `?` placeholders to `%s` for PostgreSQL, return query results as dictionaries, manage connection lifecycle as a FastAPI dependency |
| **Classes** | `DatabaseCursor`, `DatabaseConnection` |
| **Key function** | `get_db()` — FastAPI dependency generator that yields a database connection |
| **Consumers** | All API route handlers via `Depends(get_db)` |

### 7.5 Export Engine (`frontend/assets/js/app.js`, lines 1174–1988)

| Attribute | Value |
|---|---|
| **Purpose** | Generate customizable PDF and Excel reports from beneficiary data |
| **Responsibilities** | Filter data by status/card type/date range/search text, sort data, select columns, render live document preview, generate PDFs via html2pdf.js or Excel files via SheetJS, with fallback to CSV |
| **Key functions** | `openExportModal()`, `getExportFilteredData()`, `updateExportModalPreview()`, `generatePDFExport()`, `generateExcelExport()`, `executeExportDownload()` |
| **Features** | Customizable title/subtitle, watermark (CONFIDENTIAL, PALI GRAM PANCHAYAT, GOVERNMENT OF GUJARAT, or custom), government emblem toggle, signature/stamp block toggle, live preview panel |

### 7.6 Auto-Refresh / Sync System (`frontend/assets/js/app.js`, lines 310–411)

| Attribute | Value |
|---|---|
| **Purpose** | Keep data fresh with background polling |
| **Responsibilities** | Poll API every 5 seconds, skip polling when tab is hidden (`document.hidden`), manual sync with UI feedback (spinning icons, disabled buttons, toast notifications) |
| **Key functions** | `startAutoRefresh()`, `stopAutoRefresh()`, `triggerManualSync()` |

---

## 8. Data Flow

### 8.1 Public user checking eligibility

```
User opens site
    ↓
Browser loads index.html + app.js
    ↓
DOMContentLoaded fires
    ↓
loadData() called
    ↓
Attempt: fetch /api/beneficiaries
    ↓ (success)              ↓ (failure)
appData populated      fetch assets/data/data.json
from API response      + localStorage overrides
    ↓                        ↓
groupHouseholds() — groups by ration card
    ↓
renderStats() — updates home page counters
    ↓
renderList() — renders first 15 household cards
    ↓
User types in search box
    ↓
performSearch() — filters by name/ration card + category
    ↓
renderList() — updates visible cards with highlights
```

### 8.2 Talati onboarding status toggle

```
Talati clicks toggle switch on beneficiary row
    ↓
toggleBeneficiaryStatus(srNo, 'onboarded') called
    ↓
Optimistic update: beneficiary object mutated immediately
    ↓
UI re-renders instantly (renderAdminDashboard, renderList)
    ↓
API call: PATCH /api/beneficiaries/{srNo}/onboarding
    ↓ (includes version for conflict detection)
    ↓
Backend validates:
  1. Field is 'onboarded' or 'rc_onboarded'
  2. Status is 'Yes' or 'No'
  3. Beneficiary exists
  4. Version matches (optimistic lock)
    ↓
Database UPDATE + audit_logs INSERT
    ↓
regenerate_json_backup() — rewrites data.json from DB
    ↓
Response with new version number
    ↓ (success)                    ↓ (409 conflict)
Frontend updates version       Frontend shows conflict toast
in adminState.versions        → reloads all data from API
    ↓                              ↓ (network error)
Toast: "✅ Updated!"          Revert optimistic update
                              Toast: "❌ Update failed"
```

### 8.3 PDF report generation

```
Talati clicks "📥 ડાઉનલોડ" button
    ↓
openExportModal() — populates filter counts, renders initial preview
    ↓
Talati configures: filters, columns, sorting, title, watermark, toggles
    ↓
handleExportConfigChange() → updateExportModalPreview()
    ↓ (live preview updates in right panel)
    ↓
Talati clicks "📥 સત્તાવાર અહેવાલ ડાઉનલોડ કરો"
    ↓
executeExportDownload()
    ↓ (format = PDF)                   ↓ (format = SHEET)
generatePDFExport()                 generateExcelExport()
    ↓                                   ↓
Creates hidden DOM element         XLSX.utils.json_to_sheet()
with full government-style         + header rows + auto-fit widths
PDF layout                         → XLSX.writeFile()
    ↓                                   ↓ (no XLSX)
html2pdf().save()                  CSV fallback with BOM
    ↓
Remove DOM element
    ↓
Toast: "📄 PDF downloaded!"
```

---

## 9. Database / Data Storage

### Database technology

- **Local/development**: SQLite (file: `backend/database.db`, WAL mode enabled)
- **Production**: PostgreSQL (via `DATABASE_URL` environment variable, connected through `psycopg2`)

The backend detects which database to use at runtime via `os.getenv("DATABASE_URL")`.

### Schema

#### Table: `users`

| Column | SQLite Type | PostgreSQL Type | Constraints | Purpose |
|---|---|---|---|---|
| `id` | TEXT | VARCHAR(100) | PRIMARY KEY | Unique user identifier (e.g. `talati_001`) |
| `username` | TEXT | VARCHAR(100) | UNIQUE NOT NULL | Login username |
| `password_hash` | TEXT | VARCHAR(255) | NOT NULL | bcrypt hashed password |
| `role` | TEXT | VARCHAR(50) | NOT NULL | User role (e.g. `talati`) |
| `district` | TEXT | VARCHAR(100) | NOT NULL | District name in Gujarati (e.g. `મહેસાણા`) |
| `taluka` | TEXT | VARCHAR(100) | NOT NULL | Taluka name in Gujarati (e.g. `ઊંઝા`) |
| `created_at` | TEXT | VARCHAR(100) | NOT NULL | ISO 8601 timestamp of creation |

**Default user**: `id=talati_001`, `username=nikunjdarji`, `role=talati`, `district=મહેસાણા`, `taluka=ઊંઝા`

#### Table: `beneficiaries`

| Column | SQLite Type | PostgreSQL Type | Constraints | Purpose |
|---|---|---|---|---|
| `sr_no` | INTEGER | INTEGER | PRIMARY KEY | Serial number (1–270) |
| `name` | TEXT | VARCHAR(255) | NOT NULL | Beneficiary full name (uppercase English) |
| `ration_card` | TEXT | VARCHAR(100) | NOT NULL | Ration card number with spaces (e.g. `10400 30041 20560`) |
| `clean_ration_card` | TEXT | VARCHAR(100) | NOT NULL | Ration card number without spaces for search |
| `card_type` | TEXT | VARCHAR(50) | NOT NULL | Category: PHH, AAY, APL-1, BPL |
| `shop_name` | TEXT | VARCHAR(255) | NOT NULL | FPS (Fair Price Shop) operator name |
| `area_name` | TEXT | VARCHAR(255) | NOT NULL | Area code and name (e.g. `14785 :પળી`) |
| `mobile` | TEXT | VARCHAR(50) | (nullable) | Masked mobile number (e.g. `XXXXX-X7359`) |
| `member_id` | TEXT | VARCHAR(100) | NOT NULL | Member ID (masked) |
| `uid_masked` | TEXT | VARCHAR(50) | NOT NULL | Masked Aadhaar number (e.g. `XXXX-XXXX-8203`) |
| `onboarded` | TEXT | VARCHAR(10) | DEFAULT 'No' | CBDC wallet onboarding status: `Yes` or `No` |
| `rc_onboarded` | TEXT | VARCHAR(10) | DEFAULT 'No' | Ration card verification status: `Yes` or `No` |
| `onboarded_date` | TEXT | VARCHAR(100) | DEFAULT NULL | ISO 8601 timestamp of when onboarded |
| `rc_onboarded_date` | TEXT | VARCHAR(100) | DEFAULT NULL | ISO 8601 timestamp of when RC was verified |
| `version` | INTEGER | INTEGER | DEFAULT 0 | Optimistic locking version counter |

#### Table: `audit_logs`

| Column | SQLite Type | PostgreSQL Type | Constraints | Purpose |
|---|---|---|---|---|
| `id` | INTEGER | SERIAL | PRIMARY KEY (AUTOINCREMENT) | Auto-incrementing log ID |
| `user_id` | TEXT | VARCHAR(100) | NOT NULL | ID of the user who performed the action |
| `action` | TEXT | VARCHAR(100) | NOT NULL | Action type (currently only `onboarding_update`) |
| `sr_no` | INTEGER | INTEGER | (nullable) | Beneficiary serial number affected |
| `beneficiary_name` | TEXT | VARCHAR(255) | (nullable) | Name of the affected beneficiary |
| `field` | TEXT | VARCHAR(50) | (nullable) | Field that was changed (`onboarded` or `rc_onboarded`) |
| `old_status` | TEXT | VARCHAR(50) | (nullable) | Previous value |
| `new_status` | TEXT | VARCHAR(50) | (nullable) | New value |
| `remarks` | TEXT | TEXT | (nullable) | Optional admin remarks |
| `ip` | TEXT | VARCHAR(255) | (nullable) | Client IP address |
| `timestamp` | TEXT | VARCHAR(100) | NOT NULL | ISO 8601 timestamp of the event |

#### Table: `metadata`

| Column | SQLite Type | PostgreSQL Type | Constraints | Purpose |
|---|---|---|---|---|
| `district` | TEXT | VARCHAR(100) | NOT NULL | District name (મહેસાણા) |
| `taluka` | TEXT | VARCHAR(100) | NOT NULL | Taluka name (ઊંઝા) |
| `fps_area` | TEXT | VARCHAR(255) | NOT NULL | FPS area description |
| `generated_on` | TEXT | VARCHAR(100) | NOT NULL | Data generation timestamp |

### Relationships

- **`beneficiaries`** are grouped by `ration_card` to form households (done in frontend JS, not via foreign keys).
- **`audit_logs.user_id`** references `users.id` (logical relationship, no foreign key constraint).
- **`audit_logs.sr_no`** references `beneficiaries.sr_no` (logical relationship, no foreign key constraint).

### Migrations

Migrations are handled inline in the `on_startup` event handler of `main.py` (lines 26–141):

1. **PostgreSQL**: Checks if tables exist, auto-seeds if not. Ensures `audit_logs.ip` is `VARCHAR(255)`. Adds `onboarded_date` and `rc_onboarded_date` columns if missing.
2. **SQLite**: Checks `PRAGMA table_info()` for missing columns, adds them via `ALTER TABLE`.

### Data lifecycle

- **Created by**: `seed.py` (initial load from `data.json`)
- **Modified by**: Admin via `PATCH /api/beneficiaries/{srNo}/onboarding`
- **Backed up to**: `frontend/assets/data/data.json` (regenerated after each status change)
- **No deletion mechanism**: There is no endpoint or functionality to delete beneficiaries

### Static data fallback (`data.json`)

File: `frontend/assets/data/data.json` (156 KB, 4600 lines)

Contains the full beneficiary dataset as a JSON object with `metadata` and `beneficiaries` arrays. This file is:
- Read by `seed.py` to populate the database
- Regenerated by the backend after each onboarding status update
- Used as a fallback by the frontend when the API is unreachable

---

## 10. API / Communication Layer

All endpoints are under the `/api` prefix. The backend is a REST API built with FastAPI.

### Authentication endpoints

#### POST `/api/auth/login`

| Attribute | Value |
|---|---|
| **Purpose** | Authenticate a Talati user and issue a JWT token |
| **Authentication** | None (public, rate-limited) |
| **Rate limit** | 5 attempts per minute per IP (in-memory) |
| **Input** | `{ "username": "string", "password": "string" }` |
| **Output (200)** | `{ "token": "jwt_string", "user": { "id", "username", "role", "district", "taluka" } }` |
| **Errors** | 401 (wrong credentials), 429 (too many attempts) |
| **Side effects** | None |

#### POST `/api/auth/logout`

| Attribute | Value |
|---|---|
| **Purpose** | Acknowledge logout (stateless — no server-side session invalidation) |
| **Authentication** | None |
| **Input** | None |
| **Output** | `{ "success": true }` |
| **Side effects** | None (JWT is not blacklisted) |

#### GET `/api/auth/me`

| Attribute | Value |
|---|---|
| **Purpose** | Validate token and return current user info |
| **Authentication** | Bearer JWT (required) |
| **Input** | None |
| **Output** | `{ "id", "username", "role", "district", "taluka" }` |
| **Errors** | 401 (invalid/expired token) |

### Beneficiary endpoints

#### GET `/api/beneficiaries`

| Attribute | Value |
|---|---|
| **Purpose** | Retrieve all beneficiaries with metadata |
| **Authentication** | None (public) |
| **Query params** | `status` (optional): `ONBOARDED` or `PENDING` |
| **Output** | `{ "metadata": {...}, "beneficiaries": [{...}, ...] }` |

#### GET `/api/beneficiaries/{srNo}`

| Attribute | Value |
|---|---|
| **Purpose** | Retrieve a single beneficiary by serial number |
| **Authentication** | None (public) |
| **Output** | `{ "sr_no", "name", "ration_card", ... }` |
| **Errors** | 404 (not found) |

#### PATCH `/api/beneficiaries/{srNo}/onboarding`

| Attribute | Value |
|---|---|
| **Purpose** | Update onboarding or RC verification status |
| **Authentication** | Bearer JWT (required) |
| **Input** | `{ "field": "onboarded"|"rc_onboarded", "status": "Yes"|"No", "version": int, "remarks": "string" }` |
| **Output** | `{ "sr_no", "onboarded", "rc_onboarded", "onboarded_date", "rc_onboarded_date", "version", "updatedBy", "updatedAt" }` |
| **Errors** | 400 (invalid field/status), 401 (not authenticated), 404 (not found), 409 (version conflict) |
| **Side effects** | Database update, audit log entry, `data.json` regeneration |

### Dashboard and analytics endpoints

#### GET `/api/dashboard`

| Attribute | Value |
|---|---|
| **Purpose** | Get dashboard KPI summary and recent activity |
| **Authentication** | Bearer JWT (required) |
| **Output** | `{ "total", "totalCards", "onboarded", "onboardedPercent", "rcOnboarded", "rcOnboardedPercent", "pending", "recentActivity": [...], "cachedAt" }` |

#### GET `/api/audit`

| Attribute | Value |
|---|---|
| **Purpose** | Get audit log events for the current user |
| **Authentication** | Bearer JWT (required) |
| **Query params** | `limit` (default: 20, max: 100) |
| **Output** | `{ "events": [{...}, ...] }` |

#### GET `/api/sync/latest`

| Attribute | Value |
|---|---|
| **Purpose** | Get latest onboarding overrides for sync |
| **Authentication** | Bearer JWT (required) |
| **Output** | `{ "overrides": { "srNo": { "onboarded", "rc_onboarded", "version" } }, "syncedAt" }` |

### Root endpoint

#### GET `/`

| Attribute | Value |
|---|---|
| **Purpose** | Health check / status |
| **Output** | `{ "status": "online", "message": "CBDC Ration Portal API is running successfully.", "version": "1.0.0" }` |

---

## 11. Authentication & Authorization

### Authentication flow

```
User enters username + password on Talati tab
    ↓
Frontend calls POST /api/auth/login
    ↓
Backend: rate_limit_login() checks IP (5/min limit)
    ↓
Backend: Queries users table by username
    ↓
Backend: bcrypt.checkpw() verifies password
    ↓
Backend: Generates JWT with { userId, username, role, exp: 30 min }
    ↓
Frontend: createAdminSession() stores token in sessionStorage
    ↓
Frontend: Schedules expiry timer (30 minutes)
    ↓
Frontend: Shows admin dashboard, starts auto-refresh
```

### JWT structure

| Claim | Value | Purpose |
|---|---|---|
| `userId` | `talati_001` | User identifier for database queries |
| `username` | `nikunjdarji` | Display name |
| `role` | `talati` | Role identifier |
| `exp` | UTC timestamp + 30 min | Token expiry |

- **Algorithm**: HS256
- **Secret**: `JWT_SECRET` environment variable (falls back to hardcoded dev key locally)

### Session management (frontend)

- **Storage**: JWT token in `sessionStorage` (key: `cbdc_jwt`), session metadata in `sessionStorage` (key: `cbdc_admin_session`)
- **Session ID**: Random 8-character alphanumeric prefixed with `SES-CBDC-` (e.g. `SES-CBDC-A3B5K7N2`)
- **Expiry**: Derived from JWT `exp` claim (30 minutes from login)
- **Restoration**: On page reload, `checkAndRestoreAdminSession()` validates the stored JWT by calling `GET /api/auth/me`. If valid, the session is restored without re-login.
- **Destruction**: On logout (user action), expiry (timer), or API validation failure

### Authorization

- **Role-based**: Only one role exists (`talati`). All authenticated endpoints simply check for a valid JWT — there is no granular permission system.
- **Audit scoping**: Audit log queries (`GET /api/dashboard`, `GET /api/audit`) are scoped to `WHERE user_id = ?`, so each Talati only sees their own activity.
- **No admin creation UI**: New users can only be added via direct database insertion or by modifying `seed.py`.

### Password handling

- **Hashing**: bcrypt with auto-generated salt (`bcrypt.hashpw()`)
- **Default password**: Hardcoded in `seed.py` line 169 as `Nikunj@97` (see Known Issues)
- **No password change mechanism**: There is no endpoint or UI to change passwords

---

## 12. Security Analysis

### Implemented

| Mechanism | Details | Location |
|---|---|---|
| **Password hashing** | bcrypt with auto-generated salt | `backend/main.py` (line 357), `backend/seed.py` (line 170) |
| **JWT authentication** | HS256 signed tokens with 30-minute expiry | `backend/main.py` (lines 168–179, 361–367) |
| **CORS restrictions** | Whitelist of allowed origins (Vercel, localhost variants) | `backend/main.py` (lines 144–163) |
| **Login rate limiting** | 5 attempts per minute per IP (in-memory dictionary) | `backend/main.py` (lines 319–341) |
| **Input validation** | Pydantic models validate request bodies; field/status whitelist | `backend/main.py` (lines 308–316, 441–444) |
| **Optimistic locking** | Version field prevents conflicting concurrent updates | `backend/main.py` (lines 460–472) |
| **SQLite WAL mode** | Prevents write locking issues during concurrent reads | `backend/main.py` (lines 254–257) |
| **JWT secret enforcement** | Runtime error if `JWT_SECRET` is missing in production | `backend/main.py` (lines 14–20) |
| **SQL parameterization** | All queries use parameterized queries (no string interpolation) | Throughout `backend/main.py` |
| **Keyboard accessibility** | Focus-visible outlines on interactive elements | `frontend/assets/css/style.css` (lines 46–61) |

### Partially implemented

| Mechanism | Details | Gap |
|---|---|---|
| **CORS** | Origins are whitelisted, but `allow_methods=["*"]` and `allow_headers=["*"]` are overly permissive | Should be restricted to specific methods/headers |
| **Rate limiting** | Only applied to login endpoint, not to other API endpoints | Beneficiary listing and updates have no rate limits |
| **Audit logging** | Onboarding changes are logged, but login/logout events are not | Incomplete audit trail |

### Missing

| Mechanism | Impact |
|---|---|
| **JWT blacklisting** | Logged-out tokens remain valid until expiry (30 minutes). A stolen token cannot be revoked. |
| **CSRF protection** | Not applicable for API-only (Bearer token) usage, but the static file serving mode has no CSRF tokens. |
| **HTTPS enforcement** | No redirect from HTTP to HTTPS in the application. Relies on Render/Vercel platform-level SSL. |
| **Content Security Policy (CSP)** | No CSP headers configured. CDN scripts (SheetJS, html2pdf) are loaded without integrity checks. |
| **Subresource Integrity (SRI)** | CDN script tags have no `integrity` attributes. |
| **Secure cookie flags** | Not applicable — tokens are stored in `sessionStorage`, not cookies. |
| **Password complexity enforcement** | No password strength requirements. |
| **Account lockout** | Rate limiting resets after 60 seconds. No permanent lockout mechanism. |

### Potential concerns

| Concern | Severity | Details |
|---|---|---|
| **Hardcoded default password** | **High** | `seed.py` line 169 contains the plain-text default password `Nikunj@97`. Anyone with access to the source code knows the admin password. |
| **API keys in `.env`** | **Critical** | The `.env` file contains what appear to be external API keys (`GEMINI_API_KEY`, `openrouter`). These should NOT be committed to version control. The `.gitignore` includes `*.env` and `.env`, which should prevent this, but the file exists in the repository directory. |
| **In-memory rate limiter** | **Medium** | Resets on server restart. Does not work across multiple server instances (if horizontally scaled). |
| **Beneficiary data is publicly accessible** | **Medium** | `GET /api/beneficiaries` requires no authentication. All 270 records (including masked Aadhaar and mobile numbers) are publicly available. |
| **Dynamic SQL column names** | **Low** | `backend/main.py` line 484 uses f-string interpolation for column names (`{body.field}`), but the field is validated against a whitelist on line 441, mitigating SQL injection risk. |
| **Error message information leakage** | **Low** | Database connection errors are printed to stdout (`print(f"Failed to connect to PostgreSQL: {e}")`) which could expose connection details in logs. |

---

## 13. Frontend / UI

### Page structure

The frontend is a **single-page application (SPA)** built with vanilla HTML/CSS/JS. All content is in `frontend/index.html` (1028 lines). Navigation is tab-based with hash routing.

### Tabs (pages)

| Tab | Hash Route | Purpose | Auth Required |
|---|---|---|---|
| **🏠 હોમ (Home)** | `#home` | Welcome banner, live stats grid (total members, ration cards, last update), quick search, CBDC benefits showcase, action cards | No |
| **📋 યાદી (List)** | `#list` | Beneficiary list grouped by household, search with highlight, filter pills (ALL, PHH, AAY, APL-1, BPL, ONBOARDED), load-more pagination, sync controls | No |
| **📲 સ્ટેપ (Steps)** | `#process` | 8-step CBDC onboarding guide with screenshots, YouTube video guide link | No |
| **ℹ️ માહિતી (Info)** | `#info` | CBDC pilot overview, how it works, key benefits, helpdesk contact (phone: 9313840278) | No |
| **🔑 તલાટી (Talati/Admin)** | `#admin` | Login form → Admin dashboard with 4 sub-pages | Yes (JWT) |

### Admin sub-pages

| Sub-page | Purpose |
|---|---|
| **📊 ડેશબોર્ડ (Dashboard)** | KPI cards (total members, ration cards, onboarded count/percentage, shared mobiles, shared cards), quick action buttons |
| **⚙️ સ્ટેટસ (Status)** | Full beneficiary table with one-click toggle switches for onboarding status, search and filter controls |
| **🔍 શેરિંગ (Sharing)** | Analytics tabs — shared mobile numbers (numbers used by 2+ beneficiaries), family size breakdown by ration card |
| **📁 અહેવાલ (Reports)** | Card type breakdown, export modal button |

### Design system

- **Color palette**: Deep Navy (`#0b1a3a`) + Warm Gold (`#c5a043`) — defined as CSS custom properties in `:root`
- **Typography**: Noto Sans Gujarati (primary, for Gujarati text) + Outfit (secondary, for Latin text) — loaded from Google Fonts
- **Border radius**: 3-tier system (sm: 8px, md: 16px, lg: 24px)
- **Shadows**: 3-tier system (sm, md, lg) using navy-tinted rgba
- **Transitions**: Fast (0.2s) and Normal (0.3s) with cubic-bezier easing
- **Responsive**: Mobile-first design with container padding scaling (16px → 24px → 32px)
- **Max content width**: 1200px (default), 1320px (desktop)

### UI components

- **Stat cards**: Icon + value + label, color-coded wrappers (blue, green, amber, purple)
- **Household cards**: Expandable cards showing ration card number, member list, onboarding badges, shop info
- **Filter pills**: Horizontally scrollable category buttons with active state
- **Skeleton loaders**: Shimmer animation placeholders for stat cards, household cards, KPI cards, table rows, shared mobile items, and breakdown cards
- **Toast notifications**: Auto-dismissing (3s) toast messages with emoji indicators
- **Lightbox modal**: Full-screen image viewer for step screenshots with overlay and close button
- **Export modal**: Complex multi-tab modal with filter configuration, column selection, sorting, styling options, format selection, and live document preview
- **Toggle switches**: Animated CSS toggle switches for onboarding status (admin only)

### Responsive behavior

The CSS includes media queries for:
- Mobile-first base styles
- Tablet breakpoints (container padding increases)
- Desktop navigation (hides bottom nav bar, shows top nav menu)

### Accessibility

- `lang="gu"` attribute on `<html>`
- `aria-label` attributes on inputs and interactive elements
- `focus-visible` outlines for keyboard navigation
- Semantic HTML (header, main, nav, section, button)
- `loading="lazy"` on step images

### State management (see Section 16)

### Offline behavior

When the backend API is unreachable:
1. Frontend loads data from `frontend/assets/data/data.json`
2. Onboarding toggles save to `localStorage` as overrides
3. Toast shows "Offline mode active" indicator

---

## 14. Backend / Server

### Server startup sequence (`backend/main.py`)

1. **Load environment**: Read `JWT_SECRET`, `DATABASE_PATH`, `DATABASE_URL`, `RENDER`, `PORT`
2. **Create FastAPI app**: Title "CBDC Ration Portal API"
3. **Startup event** (`on_startup`, lines 26–141):
   - If `DATABASE_URL` is set: Connect to PostgreSQL, check if `users` table exists, auto-seed if needed, run column migrations
   - If SQLite: Check if `database.db` exists and has data, auto-seed if needed, run column migrations
4. **Add CORS middleware**: Whitelist origins from hardcoded list + `CORS_ORIGINS` env var
5. **Register routes**: All `/api/*` endpoints
6. **Mount static files** (local only): Serve `frontend/` directory at `/` when not on Render
7. **Start Uvicorn**: `127.0.0.1:8080` (local with reload) or `0.0.0.0:$PORT` (Render)

### Middleware

| Middleware | Purpose | Configuration |
|---|---|---|
| **CORSMiddleware** | Cross-origin request handling | Origins: Vercel URL, localhost:3000/5000/8080 + env-configurable. Credentials: true. Methods/Headers: wildcard. |

### Important behaviors

- **Auto-seeding**: The backend automatically detects an empty or missing database and runs the seed script. This means the first startup after deployment will populate the database from `data.json`.
- **JSON backup regeneration**: After every successful onboarding status change, `regenerate_json_backup()` writes the entire beneficiary dataset from the database to `frontend/assets/data/data.json`. This keeps the static fallback in sync.
- **Graceful database fallback**: If PostgreSQL connection fails, the code falls back to SQLite with a warning message.
- **WAL mode**: SQLite is configured with `journal_mode=WAL` for better concurrent read performance.

---

## 15. External Services & Integrations

### Vercel (Frontend hosting)

| Attribute | Value |
|---|---|
| **Service** | Vercel |
| **Purpose** | Static site hosting for the frontend |
| **Integration method** | `frontend/vercel.json` — defines URL rewrites |
| **Configuration** | `cleanUrls: true`, rewrite `/api/:path*` → `https://cbdc-backend.onrender.com/api/:path*` |
| **Data sent** | API requests proxied transparently |
| **Data received** | API responses proxied back to client |
| **Failure behavior** | Frontend loads but API calls fail; falls back to `data.json` |
| **URL** | `pali-omega.vercel.app` (verified from CORS origins list) |

### Render (Backend hosting)

| Attribute | Value |
|---|---|
| **Service** | Render |
| **Purpose** | Python web service hosting for the backend |
| **Integration method** | `render.yaml` — Infrastructure-as-Code blueprint |
| **Configuration** | Free plan, Python runtime, build: `pip install -r requirements.txt`, start: `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Environment variables** | `JWT_SECRET` (auto-generated), `RENDER=true` |
| **URL** | `cbdc-backend.onrender.com` (verified from `vercel.json`) |

### Google Fonts (CDN)

| Attribute | Value |
|---|---|
| **Service** | Google Fonts |
| **Purpose** | Load Noto Sans Gujarati and Outfit typefaces |
| **Integration method** | `<link>` tags in `frontend/index.html` with `preconnect` hints |
| **Failure behavior** | Browser falls back to system fonts; layout may shift |

### SheetJS / xlsx (CDN)

| Attribute | Value |
|---|---|
| **Service** | jsDelivr CDN |
| **Purpose** | Client-side Excel (XLSX) file generation |
| **Version** | 0.18.5 |
| **Integration method** | `<script>` tag loading `xlsx.full.min.js` |
| **Used by** | `generateExcelExport()` in `app.js` |
| **Failure behavior** | Falls back to CSV export |

### html2pdf.js (CDN)

| Attribute | Value |
|---|---|
| **Service** | Cloudflare CDN (cdnjs) |
| **Purpose** | Client-side HTML-to-PDF conversion using html2canvas + jsPDF |
| **Version** | 0.10.1 |
| **Integration method** | `<script>` tag loading `html2pdf.bundle.min.js` |
| **Used by** | `generatePDFExport()` in `app.js` |
| **Failure behavior** | Falls back to opening a new print window |

### YouTube (External link)

| Attribute | Value |
|---|---|
| **Purpose** | Video guide for CBDC onboarding process |
| **Video ID** | `ppYai076W9Q` |
| **Integration** | External link + thumbnail image (loaded from `img.youtube.com`) |

---

## 16. State Management & Caching

### Frontend global state

The application uses three global JavaScript objects to manage state:

#### `appData` — Application data

```javascript
{
  metadata: { district, taluka, fps_area, generated_on },
  beneficiaries: [...],  // Array of 270 beneficiary objects
  households: [...]       // Beneficiaries grouped by ration_card
}
```

- **Populated by**: `loadData()` → API or `data.json` fallback
- **Modified by**: `toggleBeneficiaryStatus()` (optimistic updates)

#### `filterState` — Search/filter state

```javascript
{
  query: "",                // Current search text
  selectedCategory: "ALL",  // Filter pill selection
  filteredHouseholds: [],   // Currently filtered household list
  displayedCount: 15        // Number of cards currently shown (load-more pagination)
}
```

#### `adminState` — Admin session state

```javascript
{
  isAuthenticated: false,
  username: "",
  searchQuery: "",          // Admin table search
  filterStatus: "ALL",      // Admin table filter
  activeSubpage: "dashboard",
  sessionId: "",            // e.g. "SES-CBDC-A3B5K7N2"
  onboardingOverrides: {},  // Offline changes stored locally
  versions: {}              // Version numbers keyed by sr_no
}
```

### Storage mechanisms

| Storage | Key | Purpose | Cleared on |
|---|---|---|---|
| `sessionStorage` | `cbdc_jwt` | JWT token | Logout, tab close |
| `sessionStorage` | `cbdc_admin_session` | Session metadata (sessionId, username, createdAt, expiresAt) | Logout, expiry, tab close |
| `localStorage` | `cbdc_onboarding_overrides` | Offline onboarding status changes | Never (persists across sessions) |

### Auto-refresh (polling)

- **Interval**: 5 seconds (`setInterval` in `startAutoRefresh()`)
- **Behavior**: Calls `loadDataFromAPI()`, then `groupHouseholds()`, `renderStats()`, `renderList()`. If authenticated, also calls `renderAdminDashboard()`.
- **Visibility check**: Skips API call if `document.hidden` is true (tab not visible)
- **Superseded request handling**: GET requests track an incrementing ID per path. If a newer request has been issued, the older response is discarded.

---

## 17. Error Handling

### Backend error handling

| Error Type | HTTP Status | Response | Location |
|---|---|---|---|
| Invalid credentials | 401 | `{ "detail": "Incorrect ID or password" }` | `main.py` login route |
| Expired JWT | 401 | `{ "detail": "Session expired, please login again" }` | `get_current_user()` |
| Invalid JWT | 401 | `{ "detail": "Invalid session token" }` | `get_current_user()` |
| User not found | 401 | `{ "detail": "User not found" }` | `get_me()` |
| Rate limit exceeded | 429 | `{ "detail": "Too many login attempts. Please try again in a minute." }` | `rate_limit_login()` |
| Invalid field name | 400 | `{ "detail": "Invalid field name" }` | `update_onboarding()` |
| Invalid status value | 400 | `{ "detail": "Invalid status value" }` | `update_onboarding()` |
| Beneficiary not found | 404 | `{ "detail": "Beneficiary not found" }` | `get_beneficiary()`, `update_onboarding()` |
| Version conflict | 409 | `{ "detail": { "error": "Version conflict", "currentVersion", "yourVersion", "currentData" } }` | `update_onboarding()` |

### Frontend error handling

| Scenario | Behavior |
|---|---|
| API fetch fails | Falls back to `data.json`; shows toast "Offline mode active" |
| Login fails (401) | Shows error message "ખોટો આઈડી/પાસવર્ડ" |
| Login fails (other) | Shows error message "સર્વર સમસ્યા. ફરી પ્રયત્ન કરો." |
| Onboarding update fails (409) | Shows conflict toast, reloads all data from API |
| Onboarding update fails (network) | Reverts optimistic update, shows error toast |
| Session expired | Destroys session, shows expiry toast, returns to login form |
| Superseded GET request | Silently discards the response (prevents stale data rendering) |
| Empty search results | Shows empty state with search icon and "no results" message |

---

## 18. Testing

### Current state

**No automated tests exist in this project.**

There is no test directory, no test files, no test configuration, and no test dependencies in `requirements.txt`.

The `.gitignore` includes `.pytest_cache/` entries, suggesting pytest may have been considered but is not currently used.

### Areas that would benefit from testing

| Area | Priority | Reason |
|---|---|---|
| Authentication flow | Critical | Incorrect auth could expose admin functionality |
| Onboarding update with version conflict | Critical | Core business logic with optimistic locking |
| Database abstraction layer (SQLite ↔ PostgreSQL) | High | Dual-database support needs validation |
| Rate limiting | High | Security mechanism needs verification |
| Data loading fallback chain | Medium | API → JSON fallback logic |
| Export filtering and sorting | Medium | Complex filtering logic |

---

## 19. Build System

This project has **no build step** for either frontend or backend.

- **Frontend**: Vanilla HTML/CSS/JS — no transpilation, bundling, or minification
- **Backend**: Python — no compilation needed
- **Render build command**: `pip install -r requirements.txt` (dependency installation only)

There is no `package.json`, `webpack.config.js`, `vite.config.js`, or similar build configuration.

---

## 20. Configuration & Environment Variables

| Variable | Purpose | Required | Default | Used By |
|---|---|---|---|---|
| `JWT_SECRET` | Secret key for signing JWT tokens | **Yes** (production) | `cbdc_dev_fallback_secret_key_change_me_in_prod` (dev only) | `backend/main.py` |
| `RENDER` | Flag indicating Render production environment | No | Not set | `backend/main.py` (host binding, static file serving) |
| `PORT` | Server port number | No | `8080` | `backend/main.py` |
| `DATABASE_URL` | PostgreSQL connection string | No (uses SQLite if absent) | Not set | `backend/main.py`, `backend/seed.py` |
| `DATABASE_PATH` | Path to SQLite database file | No | `backend/database.db` | `backend/main.py`, `backend/seed.py` |
| `CORS_ORIGINS` | Comma-separated list of additional allowed CORS origins | No | Empty | `backend/main.py` |
| `NODE_ENV` | Standard Node.js env variable — only checked for `production` | No | Not set | `backend/main.py` (JWT secret enforcement) |

> **⚠️ WARNING**: The `backend/.env` file in the current repository contains what appear to be API keys for external services (`GEMINI_API_KEY`, `openrouter`). These are **not used** by any code in this project and appear to be accidentally placed here. They should be removed and the keys rotated if they are valid.

---

## 21. Dependencies

### Backend dependencies (`backend/requirements.txt`)

| Package | Version Constraint | Purpose |
|---|---|---|
| `fastapi` | ≥ 0.100.0 | Web framework for building REST APIs |
| `uvicorn` | ≥ 0.22.0 | ASGI server for running FastAPI |
| `pydantic` | ≥ 2.0 | Data validation and serialization for request/response models |
| `PyJWT` | ≥ 2.7.0 | JWT token creation and verification |
| `bcrypt` | ≥ 4.0.0 | Password hashing |
| `psycopg2-binary` | ≥ 2.9.0 | PostgreSQL database adapter (used in production on Render) |

**Note**: `sqlite3` is part of the Python standard library and is not listed.

### Frontend dependencies (CDN)

| Library | Version | CDN | Purpose |
|---|---|---|---|
| SheetJS (xlsx) | 0.18.5 | jsDelivr | Excel file generation |
| html2pdf.js | 0.10.1 | Cloudflare cdnjs | HTML-to-PDF conversion |
| Noto Sans Gujarati | Latest | Google Fonts | Gujarati typography |
| Outfit | Latest | Google Fonts | Latin typography |

There is no `package.json` — the frontend has no npm/yarn dependencies.

---

## 22. Deployment

### Production architecture

```
┌─────────────────────────┐      ┌─────────────────────────────┐
│    Vercel                │      │    Render                    │
│    (Static hosting)     │      │    (Python web service)      │
│                          │      │                              │
│  pali-omega.vercel.app  │      │  cbdc-backend.onrender.com  │
│                          │      │                              │
│  Serves:                │      │  Runs:                       │
│  - index.html           │  ──→ │  - FastAPI (uvicorn)         │
│  - assets/css/style.css │ /api │  - SQLite or PostgreSQL      │
│  - assets/js/app.js     │      │                              │
│  - assets/data/data.json│      │  Env vars:                   │
│  - assets/images/*      │      │  - JWT_SECRET (auto-gen)     │
│                          │      │  - RENDER=true               │
│  vercel.json rewrites   │      │  - DATABASE_URL (if PG)      │
│  /api/* → Render        │      │                              │
└─────────────────────────┘      └─────────────────────────────┘
```

### Backend deployment (Render)

Configured in `render.yaml`:
- **Type**: Web service
- **Runtime**: Python
- **Plan**: Free
- **Root directory**: `backend`
- **Build command**: `pip install -r requirements.txt`
- **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Environment variables**: `JWT_SECRET` (auto-generated by Render), `RENDER=true`
- **Build filter**: Only rebuilds when `backend/**` files change

### Frontend deployment (Vercel)

Configured in `frontend/vercel.json`:
- **Framework preset**: None (static site)
- **Root directory**: `frontend`
- **Clean URLs**: Enabled
- **Rewrites**: `/api/:path*` → `https://cbdc-backend.onrender.com/api/:path*`

### CI/CD

**No CI/CD pipeline exists.** There are no GitHub Actions, GitLab CI, or other automation files. Deployment is presumed to be triggered by Git pushes to the connected repositories on Vercel and Render.

---

## 23. Local Development

### Prerequisites

- Python 3.8+ installed
- Git installed
- A modern web browser

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd CBDCP

# Create and activate a virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r backend/requirements.txt
```

### Environment configuration

Create `backend/.env` with:
```
JWT_SECRET=your_custom_secret_here
```

Or simply run without it — the backend will use a hardcoded fallback key for local development.

### Database setup

The database is **automatically created and seeded** on first startup. If you need to manually seed or reset:

```bash
# Seed the database (skips if database.db already exists)
python backend/seed.py

# Force re-seed (deletes and recreates database.db)
python backend/seed.py --force
```

### Running the application

```bash
python backend/main.py
```

This starts the server at `http://127.0.0.1:8080` with:
- FastAPI backend serving API routes at `/api/*`
- Frontend static files served at `/` (via StaticFiles middleware)
- Hot-reload enabled (Uvicorn `reload=True`)

### Default login credentials

| Field | Value |
|---|---|
| Username | `nikunjdarji` |
| Password | `Nikunj@97` |

---

## 24. Important User / Business Flows

### Flow 1: Citizen checking eligibility

```
1. Citizen opens the portal (home tab)
2. Sees live statistics: total members, ration cards, shop name, last update
3. Types their name or ration card number in "Quick Search" box
4. Clicks "શોધો" (Search) button
5. Automatically redirected to List tab with search results highlighted
6. Sees their household card with all family members listed
7. Each member shows "✓ ઓનબોર્ડ" (onboarded) or "⏳ પેન્ડિંગ" (pending) status
```

### Flow 2: Talati daily onboarding workflow

```
1. Talati navigates to "તલાટી" tab
2. Enters username and password → clicks "પ્રવેશ કરો" (Login)
3. JWT token received, session created (30-minute timer starts)
4. Dashboard sub-page shows:
   - Total members, ration cards, onboarded count, onboarded percentage
   - Shared mobile numbers count, multi-member cards count
5. Talati clicks "⚙️ સ્ટેટસ બદલો" (Change Status)
6. Status Manager shows full beneficiary table with toggle switches
7. Talati can search by name/card/mobile and filter by ALL/PENDING/ONBOARDED
8. Clicks toggle switch next to a beneficiary → status flips immediately (optimistic)
9. Backend receives PATCH request → validates version → updates DB → logs audit
10. Toast confirms "✅ Updated!" or shows conflict warning
11. JSON backup regenerated on backend
```

### Flow 3: Generating official government PDF report

```
1. Talati clicks "📥 ડાઉનલોડ" button
2. Export modal opens with 3 configuration tabs:
   a. FILTERS tab: Select data group (ALL/PENDING/ONBOARDED/SHARED_MOBILE/SHARED_CARD),
      card type filter, RC status filter, date range, text search
   b. COLUMNS tab: Toggle which columns appear in the report,
      select sort field and order
   c. SETTINGS tab: Customize title/subtitle, watermark,
      government emblem toggle, signature/stamp block toggle
3. Right panel shows LIVE preview of the document as settings change
4. Bottom shows total matching beneficiary count
5. Select format: PDF Document or Excel/Sheet
6. Click "📥 સત્તાવાર અહેવાલ ડાઉનલોડ કરો"
7. PDF: html2pdf.js renders and downloads a government-style A4 document
   Excel: SheetJS generates XLSX with header metadata rows and auto-fit columns
```

---

## 25. Performance Analysis

### Current optimizations

| Optimization | Details |
|---|---|
| **SQLite WAL mode** | Enables concurrent read access without blocking writes |
| **Lazy image loading** | Step screenshots use `loading="lazy"` attribute |
| **Font preconnect** | `<link rel="preconnect">` hints for Google Fonts |
| **Superseded request detection** | Prevents stale API responses from overwriting newer data |
| **Visibility-aware polling** | Skips API calls when the browser tab is hidden |
| **Pagination** | List tab renders 15 households at a time with "Load More" button |
| **Atomic JSON backup writes** | Writes to `.tmp` file first, then `os.replace()` for crash safety |
| **Skeleton loading states** | Perceived performance improvement — UI shows shimmer placeholders while data loads |

### Potential bottlenecks

| Bottleneck | Severity | Details |
|---|---|---|
| **5-second polling** | Medium | Every browser tab polls the API every 5 seconds. With multiple tabs or users, this creates unnecessary load. WebSocket or Server-Sent Events would be more efficient. |
| **Full dataset fetch on every poll** | Medium | `GET /api/beneficiaries` returns all 270 records every 5 seconds. A delta-sync approach (only changed records) would reduce bandwidth. |
| **Full JSON regeneration on every update** | Low | `regenerate_json_backup()` reads all beneficiaries from DB and writes the entire JSON file on every single onboarding toggle. For 270 records this is fast, but it wouldn't scale. |
| **In-memory rate limiter** | Low | The `login_attempts` dictionary grows unbounded (cleaned only within per-IP checks). No global cleanup mechanism. |
| **Single-file frontend** | Low | All 1028 lines of HTML, 4175 lines of CSS, and 2272 lines of JS are loaded upfront. No code splitting or lazy loading of UI components. Acceptable for the current scale. |
| **PDF generation in browser** | Low | `html2pdf.js` renders the full HTML table to canvas and converts to PDF. For 270 rows this takes a few seconds. For thousands of rows it could be slow or fail. |

### Recommended improvements

1. Replace polling with WebSocket or SSE for real-time updates
2. Implement delta-sync: only fetch records modified since last sync timestamp
3. Add database indexes on `beneficiaries.onboarded` and `beneficiaries.ration_card` for filtered queries
4. Add a global cleanup interval for the `login_attempts` dictionary

---

## 26. Scalability

### Current limitations

| Dimension | Limitation | Details |
|---|---|---|
| **Database** | SQLite is single-writer | Only one write operation at a time. WAL mode helps reads. PostgreSQL support exists for production. |
| **Users** | Designed for 1 admin | Single hardcoded admin user. No multi-user or multi-village support. |
| **Data volume** | 270 beneficiaries | Frontend loads and renders all records. No server-side pagination. |
| **Horizontal scaling** | Not possible | In-memory rate limiter, SQLite file-based DB, and JSON file backup all require a single server instance. |
| **File storage** | `data.json` regenerated on every update | Works for small datasets but would create I/O bottlenecks at scale. |

### What would need to change for scale

1. **PostgreSQL only**: Drop SQLite support, use PostgreSQL with connection pooling
2. **Redis-based rate limiting**: Replace in-memory dictionary with Redis
3. **Server-side pagination**: Add `limit`/`offset` to beneficiary queries
4. **Remove JSON backup**: Use API-only data access, or generate JSON on a schedule
5. **Multi-user support**: Role-based access control, user management API
6. **Multi-village support**: Tenant isolation by village/gram panchayat

---

## 27. Code Quality

### Strengths

| Aspect | Assessment |
|---|---|
| **Clear purpose** | Every function has a clear, focused purpose |
| **Consistent naming** | Gujarati UI terms are consistently translated; JS uses camelCase, Python uses snake_case |
| **Error messaging** | User-facing errors are in Gujarati with emoji indicators |
| **Dual-database abstraction** | Clean wrapper classes for SQLite/PostgreSQL compatibility |
| **Progressive enhancement** | Frontend works without API (offline fallback), PDF fallback to print window, XLSX fallback to CSV |
| **Optimistic UI** | Status toggles update immediately with rollback on failure |

### Areas for improvement

| Issue | Severity | Details |
|---|---|---|
| **Monolithic backend** | Medium | All routes, models, middleware, database logic, and helpers are in a single 654-line file (`main.py`). Should be split into modules (routes, models, database, auth, utils). |
| **Monolithic frontend** | Medium | All 2272 lines of JS logic are in a single `app.js` file. Would benefit from module organization. |
| **Monolithic HTML** | Medium | All 1028 lines of HTML (5 tabs, modals, components) are in a single `index.html`. Could use a templating system or web components. |
| **Global mutable state** | Medium | Frontend uses three global objects (`appData`, `filterState`, `adminState`) mutated from many functions. Difficult to trace state changes. |
| **Inline event handlers** | Low | Some HTML uses `onclick` attributes (e.g., `onclick="switchTab('home-tab')"`) mixed with `addEventListener` bindings in JS. Should be consistent. |
| **Commented duplicate line** | Low | `main.py` line 265–266 has a duplicate comment: `# Keep JSON file in sync as a backup by regenerating it from the DB`. |
| **Undefined variable reference** | Low | `app.js` line 332: `def_stopAutoRefresh` — uses `def_` prefix which is unusual for JavaScript (appears to be a Python naming convention leaking into JS). Functionally correct but confusing. |
| **Unused QR code function** | Low | `drawMockQRCode()` function exists in `app.js` (lines 1363–1407) but the QR toggle (`export-toggle-qrcode`) is referenced in code (line 1431) but does not exist in the HTML. Dead code. |
| **Undefined variable in PDF fallback** | Low | `app.js` line 1972 references `qrCanvasId` which is not defined in `generatePDFExport()`. This would cause a ReferenceError in the print-window fallback path. |

---

## 28. Legacy / Unused / Suspicious Files

| Item | Type | Details |
|---|---|---|
| **`raw data.xlsx`** | Missing file | README (line 16) mentions `raw data.xlsx` in the backend directory, but this file does not exist in the current codebase. Either removed or never committed. |
| **`backend/reports/`** | Empty directory | Placeholder directory with no contents. No code references it for reading or writing. |
| **`backend/.env`** | Suspicious content | Contains `GEMINI_API_KEY` and `openrouter` API keys that are **not used** by any code in this project. These appear to be accidentally placed here. Should be removed and keys rotated. |
| **`drawMockQRCode()`** | Dead code | Function in `app.js` (lines 1363–1407) that draws a mock QR code on a canvas. The corresponding HTML checkbox (`export-toggle-qrcode`) does not exist. The `showQR` variable is read (line 1431, 1765) but never used to conditionally render anything. |
| **`qrCanvasId`** | Undefined variable | Referenced in `generatePDFExport()` at line 1972 within the print fallback path. Would cause a `ReferenceError` if the `html2pdf` library is unavailable. |
| **`COLUMN_HEADERS_ENG`** | Unused constant | Defined at `app.js` lines 1195–1208 but never referenced anywhere in the code. |
| **`psycopg2-binary`** | Potentially unused locally | Listed in `requirements.txt` but only used when `DATABASE_URL` is set (production). Will install PostgreSQL C libraries locally even though only SQLite is used in development. |

---

## 29. Known Issues

### Critical

| Issue | Location | Current Behavior | Impact | Possible Solution |
|---|---|---|---|---|
| **Hardcoded default password in source code** | `backend/seed.py` line 169 | Password `Nikunj@97` is in plain text | Anyone with source code access knows the admin password | Generate random password during seeding and print it once, or require it as an env variable |
| **Leaked API keys in `.env`** | `backend/.env` | Contains `GEMINI_API_KEY` and `openrouter` keys | If committed to a public/shared repo, these keys are exposed | Remove immediately, rotate the keys, ensure `.gitignore` properly excludes `.env` |

### High

| Issue | Location | Current Behavior | Impact | Possible Solution |
|---|---|---|---|---|
| **No JWT blacklisting on logout** | `backend/main.py` line 380–382 | `POST /api/auth/logout` returns `{ success: true }` but does not invalidate the token | A stolen token remains valid for up to 30 minutes after "logout" | Implement token blacklist (Redis or DB-based) |
| **Beneficiary data publicly accessible** | `backend/main.py` line 393 | `GET /api/beneficiaries` has no authentication | Masked Aadhaar numbers and mobile numbers are accessible to anyone | Add authentication or at least limit exposed fields for unauthenticated users |
| **In-memory rate limiter resets on restart** | `backend/main.py` line 319 | `login_attempts = {}` is a global dictionary | Server restart clears all rate limit state | Use Redis or persistent storage for rate limiting |

### Medium

| Issue | Location | Current Behavior | Impact | Possible Solution |
|---|---|---|---|---|
| **`ReferenceError` in PDF print fallback** | `frontend/assets/js/app.js` line 1972 | References undefined `qrCanvasId` variable | Print fallback path would crash if `html2pdf` is unavailable | Remove the QR-related code or define the variable |
| **No login/logout audit logging** | `backend/main.py` | Only onboarding changes are logged | Incomplete security audit trail | Add audit log entries for login/logout events |
| **`data.json` regeneration on Render** | `backend/main.py` line 267 | Attempts to write to `../frontend/assets/data/data.json` | On Render, this path may not exist or may not persist between deploys | Skip regeneration on Render or use a different persistence mechanism |

### Low

| Issue | Location | Current Behavior | Impact | Possible Solution |
|---|---|---|---|---|
| **Duplicate comment** | `backend/main.py` lines 264–265 | Same comment appears twice | Code cleanliness | Remove duplicate |
| **`def_stopAutoRefresh` naming** | `frontend/assets/js/app.js` line 332 | Uses Python-like `def_` prefix | Confusing to JavaScript developers | Rename to standard JS convention |
| **Unused `COLUMN_HEADERS_ENG`** | `frontend/assets/js/app.js` line 1195 | Constant defined but never used | Dead code | Remove or use in export functionality |

---

## 30. Limitations

| Limitation | Category | Details |
|---|---|---|
| **Single village** | Architecture | Designed exclusively for Pali Gram Panchayat. No multi-village or multi-district support. |
| **Single admin** | Architecture | Only one Talati account. No user management. |
| **No real-time sync** | Architecture | Uses polling (5s interval), not WebSocket. Changes take up to 5 seconds to appear in other tabs. |
| **No mobile app** | Platform | Web-only, responsive design. No native Android/iOS app for the Talati. |
| **No data import** | Features | Beneficiary data can only be loaded via `seed.py`. No UI for importing new beneficiary lists. |
| **No data deletion** | Features | No way to remove beneficiaries or users through the application. |
| **No reporting history** | Features | Generated reports are downloaded but not saved server-side. No record of which reports were generated. |
| **Free tier hosting** | Infrastructure | Render free tier has cold starts (service sleeps after inactivity). First API call after idle may take 30+ seconds. |
| **SQLite concurrent writes** | Database | SQLite allows only one write at a time. With WAL mode, reads are concurrent but writes are serialized. Acceptable for single-admin use. |
| **No email/SMS notifications** | Features | No mechanism to notify beneficiaries of their onboarding status. |
| **Masked data only** | Data | Mobile numbers and Aadhaar numbers are pre-masked in the source data. The system never handles or stores full sensitive identifiers. |

---

## 31. Architectural Decisions

### Decision 1: Separated frontend and backend deployment

- **What**: Frontend on Vercel (static), backend on Render (Python), connected via API proxy rewrite
- **Why**: Inferred — Vercel provides free, fast static hosting with global CDN; Render provides free Python hosting. This avoids a single-server setup.
- **Benefits**: Independent scaling, CDN for static assets, no CORS issues via proxy rewrite
- **Trade-offs**: Added complexity (two deployment targets), Render cold starts on free tier, API proxy adds latency
- **Alternative**: Single-server deployment with FastAPI serving both static files and API

### Decision 2: Vanilla JS instead of a framework

- **What**: No React, Vue, Angular, or other frontend framework
- **Why**: *Reason not explicitly documented; inferred from implementation.* The application is relatively simple (5 tabs, no complex state transitions), and the developer likely prioritized simplicity and deployment speed.
- **Benefits**: Zero build step, no node_modules, instant deployment on Vercel, no framework lock-in
- **Trade-offs**: Manual DOM manipulation, global mutable state, no component reuse, harder to maintain as complexity grows
- **Alternative**: React or Vue SPA with API client

### Decision 3: Dual-database support (SQLite + PostgreSQL)

- **What**: Backend transparently supports both SQLite (local) and PostgreSQL (production)
- **Why**: *Inferred from implementation.* SQLite is zero-config for local development; PostgreSQL is more robust for production on Render.
- **Benefits**: No database setup needed for local dev, production-grade database in deployment
- **Trade-offs**: Database abstraction layer adds complexity; query syntax differences must be handled (e.g., `?` vs `%s`)
- **Alternative**: Use PostgreSQL everywhere (with Docker for local dev)

### Decision 4: Static JSON fallback

- **What**: `data.json` is maintained as a backup data source, regenerated after each status change
- **Why**: *Inferred from implementation.* Enables the frontend to function when the backend is down (Render cold starts, offline use).
- **Benefits**: Offline capability, fast initial load, resilience to backend downtime
- **Trade-offs**: Data may be stale if regeneration fails, dual data source can cause confusion
- **Alternative**: Service Worker with IndexedDB cache

### Decision 5: Gujarati-language UI

- **What**: Entire UI is in Gujarati script with Noto Sans Gujarati font
- **Why**: The target users are village-level government staff and citizens in rural Gujarat who primarily communicate in Gujarati.
- **Benefits**: Accessible to the target audience, culturally appropriate for government use
- **Trade-offs**: Limits usability for non-Gujarati speakers, no language toggle

### Decision 6: Optimistic concurrency control with version field

- **What**: Each beneficiary has a `version` integer that is incremented on update. Clients must send the current version with update requests.
- **Why**: Prevents lost updates when multiple admin sessions modify the same record.
- **Benefits**: Simple, effective conflict detection without pessimistic locking
- **Trade-offs**: Client must handle 409 conflicts gracefully (which it does — reload and re-render)

---

## 32. Future Roadmap

### Critical (Security & Functionality)

1. **Remove hardcoded password from `seed.py`** — Generate and display a random password at seed time, or require it via environment variable
2. **Remove leaked API keys from `.env`** — Delete the `GEMINI_API_KEY` and `openrouter` entries, rotate the compromised keys
3. **Add authentication to `GET /api/beneficiaries`** — Or create a separate public endpoint with reduced data (no masked Aadhaar/mobile)
4. **Implement JWT blacklist** — Use Redis or database to invalidate tokens on logout

### High (Reliability & Performance)

5. **Replace polling with WebSocket/SSE** — Eliminate 5-second polling overhead for real-time updates
6. **Add automated tests** — Unit tests for auth flow, onboarding logic, database abstraction; integration tests for API endpoints
7. **Add login/logout audit logging** — Record authentication events alongside onboarding changes
8. **Persistent rate limiting** — Use Redis instead of in-memory dictionary
9. **Fix `qrCanvasId` ReferenceError** — Remove dead QR code-related code from the export system

### Medium (Maintainability & UX)

10. **Split monolithic files** — Separate `main.py` into modules (routes, models, database, auth); split `app.js` into modules (api, state, ui, export)
11. **Add password change functionality** — API endpoint and UI for Talati to change their password
12. **Add user management** — API and UI for creating additional admin users
13. **Add CI/CD pipeline** — GitHub Actions for automated testing and deployment
14. **Add loading error states** — Show meaningful error pages when API is completely unreachable
15. **Add data import functionality** — UI for uploading new beneficiary lists (Excel/CSV)

### Low (Optional Enhancements)

16. **Add dark mode** — CSS custom properties already provide a good foundation
17. **Add language toggle** — English/Gujarati switch for broader accessibility
18. **Add beneficiary detail modal** — Click a member to see full details including onboarding history
19. **Add report saving** — Store generated reports server-side with metadata
20. **Add Subresource Integrity (SRI)** — Add `integrity` attributes to CDN script tags

---

## 33. Important File Index

| File | Purpose | Importance |
|---|---|---|
| `backend/main.py` | FastAPI app — all routes, middleware, DB logic, auth, CORS | **Critical** |
| `backend/seed.py` | Database schema creation and data seeding | **Critical** |
| `frontend/index.html` | Entire SPA — all tabs, modals, forms, navigation | **Critical** |
| `frontend/assets/js/app.js` | All frontend logic — API, state, rendering, export | **Critical** |
| `frontend/assets/css/style.css` | Complete design system and responsive layout | **High** |
| `frontend/assets/data/data.json` | Static fallback beneficiary data (270 records) | **High** |
| `backend/requirements.txt` | Python dependency manifest | **High** |
| `render.yaml` | Render deployment blueprint | **Medium** |
| `frontend/vercel.json` | Vercel deployment config with API proxy | **Medium** |
| `backend/.env.example` | Environment variable template | **Medium** |
| `.gitignore` | Git ignore rules | **Low** |
| `README.md` | Project overview and setup instructions | **Low** |
| `frontend/assets/images/logo_web.png` | Pali Gram Panchayat official logo/seal | **Low** |
| `frontend/assets/images/steps/*.jpg` | CBDC onboarding step screenshots (8 images) | **Low** |

---

## 34. Glossary

| Term | Definition |
|---|---|
| **CBDC** | Central Bank Digital Currency — India's digital rupee (e₹) issued by the Reserve Bank of India |
| **e₹ (ઈ-રૂપિયો)** | The digital form of the Indian Rupee, used in this pilot for ration distribution |
| **PDS** | Public Distribution System — India's government food distribution network |
| **FPS** | Fair Price Shop — Government-authorized retail outlet for distributing subsidized food grains |
| **Talati (તલાટી)** | Village-level administrative clerk (Talati-cum-Mantri) — the primary government user of this system |
| **Gram Panchayat (ગ્રામ પંચાયત)** | Village council — the local self-government body (here: Pali village) |
| **Ration Card (રેશન કાર્ડ)** | Government-issued card entitling a household to subsidized food grains |
| **PHH** | Priority Household — ration card category for priority families |
| **AAY** | Antyodaya Anna Yojana — ration card category for the poorest of the poor |
| **APL-1** | Above Poverty Line (Tier 1) — ration card category |
| **BPL** | Below Poverty Line — ration card category |
| **Onboarded (ઓનબોર્ડ)** | A beneficiary who has completed CBDC e₹ wallet registration |
| **RC Onboarded** | A beneficiary whose ration card has been verified/linked in the CBDC system |
| **Pali (પળી)** | The specific village where this pilot is deployed (Taluka Unjha, District Mehsana, Gujarat) |
| **Unjha (ઊંઝા)** | The taluka (sub-district) containing Pali village |
| **Mehsana (મહેસાણા)** | The district containing Unjha taluka |
| **KYC** | Know Your Customer — identity verification process for wallet registration |
| **Annapurti (અન્નપૂર્ણા)** | Automated grain ATM/dispensing system used with CBDC |
| **WAL** | Write-Ahead Logging — SQLite journal mode for concurrent read access |
| **SPA** | Single-Page Application — web app that loads once and updates dynamically |
| **ASGI** | Asynchronous Server Gateway Interface — Python web server interface used by Uvicorn/FastAPI |

---

## 35. Final System Summary

### What is this project?

A full-stack web portal for managing CBDC (Digital Rupee) ration distribution onboarding in Pali village, Gujarat, India. It serves both citizens (eligibility checking) and the village Talati (administrative management).

### How does it work?

The system has two independently deployed parts:
- A **vanilla HTML/CSS/JS frontend** hosted on Vercel, providing a tab-based SPA with public information pages, a searchable beneficiary list, and a protected admin dashboard.
- A **Python FastAPI backend** hosted on Render, providing REST API endpoints for authentication, beneficiary data, onboarding status management, dashboard analytics, and audit logging.

Communication happens via HTTP REST API calls, proxied through Vercel rewrites to avoid CORS issues. The frontend polls the backend every 5 seconds for updates and falls back to a static JSON file when offline.

### Major components

1. **Public tabs** (Home, List, Steps, Info) — citizen-facing, no authentication
2. **Admin tab** (Dashboard, Status Manager, Sharing Analysis, Reports) — JWT-protected
3. **Export engine** — configurable PDF and Excel report generation with live preview
4. **Database layer** — dual SQLite/PostgreSQL support with auto-seeding and migrations
5. **Sync system** — 5-second polling with offline fallback and optimistic concurrency

### How do components communicate?

Frontend → (HTTP fetch) → Vercel proxy → Render backend → Database (SQLite/PostgreSQL)

### Where is data stored?

- **Primary**: SQLite file (`backend/database.db`) locally, or PostgreSQL (via `DATABASE_URL`) in production
- **Fallback**: Static JSON file (`frontend/assets/data/data.json`), regenerated from DB after each update
- **Session data**: Browser `sessionStorage` (JWT, session metadata)
- **Offline changes**: Browser `localStorage` (onboarding overrides)

### How is it configured?

Via environment variables: `JWT_SECRET` (required in production), `DATABASE_URL` (optional, enables PostgreSQL), `RENDER` (production flag), `PORT`, `CORS_ORIGINS`.

### How is it deployed?

Frontend → Vercel (static site, auto-deploy from Git). Backend → Render (Python web service, `render.yaml` blueprint).

### How is it secured?

JWT authentication (HS256, 30-min expiry), bcrypt password hashing, CORS restrictions, login rate limiting (5/min/IP), SQL parameterization, optimistic locking, input validation via Pydantic.

### Major limitations

Single village, single admin, polling-based sync, no tests, no CI/CD, free-tier hosting with cold starts, no JWT blacklisting, publicly accessible beneficiary data.

### What should be improved next?

1. Remove hardcoded password from seed script
2. Remove leaked API keys from `.env`
3. Add authentication to beneficiary listing endpoint
4. Implement JWT blacklist for secure logout
5. Replace polling with WebSocket/SSE
6. Add automated tests
7. Split monolithic files into modules

---

*This document was generated by deep analysis of the actual codebase as it exists today. Facts are stated from verified code. Inferences are marked where reasoning is not explicitly documented in the source.*
