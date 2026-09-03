# Production Readiness Audit Report for D:\CBDCP

**Audit Date:** August 26, 2026  
**Auditor:** J.A.R.V.I.S. Software Engineering Swarm  
**Target Repository:** `D:\CBDCP`  
**Deployment Infrastructure:** Render (Backend) + Vercel (Frontend)  
**Safety Protocol:** Read-Only Inspection (0 Files Modified or Deleted)

---

## 1. Executive Summary & Architecture Overview

`D:\CBDCP` is a decoupled web application comprising:
* **Backend:** FastAPI application running on Python 3.12 (entry point `backend/main.py`), utilizing SQLite for local development (`database.db`) and PostgreSQL for production deployments via `psycopg2-binary`. Deployment target is configured via `render.yaml` on Render.
* **Frontend:** Static HTML/CSS/JS web interface hosted via `frontend/index.html` with Vercel edge proxy configuration (`frontend/vercel.json`).

---

## 2. Comprehensive Security & Risk Matrix

| Finding / Issue | Severity | Evidence | Why It Matters | Recommended Action | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hardcoded Secret Key Fallback** | **CRITICAL** | `backend/main.py:19`: `SECRET_KEY = "cbdc_dev_fallback_secret_key_change_me_in_prod"` | If `JWT_SECRET` is missing in non-Render production environments, tokens are signed with a published weak key, enabling token forgery. | Enforce strict startup exception if `JWT_SECRET` is missing regardless of `RENDER` env flag. | **100%** |
| **Plaintext `.env` Committed or Residual on Local Disk** | **HIGH** | `backend/.env` exists containing live credentials/tokens. | Committing `.env` exposes DB passwords and secrets. `.gitignore` line 15 includes `.env`, but local developer workstations may accidentally push untracked secrets. | Run `git rm --cached backend/.env` if present in index. Inject secrets via environment variables in Render dashboard. | **95%** |
| **Missing Dependency Lockfiles** | **HIGH** | `backend/requirements.txt` uses `>=` unpinned dependencies (`fastapi>=0.100.0`); no `requirements.lock` or `Pipfile.lock` present. No `package-lock.json` in `frontend/`. | Builds on Render can pull breaking upstream package updates unexpectedly, breaking production deployments. | Freeze dependencies using `pip freeze > requirements.txt` or `pip-compile`. | **95%** |
| **Cross-Origin Hardcoded Vercel Proxy URL** | **MEDIUM** | `frontend/vercel.json:7`: `https://cbdc-backend.onrender.com/api/:path*` | Frontend API proxy destination is hardcoded to a specific Render app URL. Staging or preview deployments will still send requests to production. | Parametrize Vercel rewrite destination via environment variables. | **90%** |
| **Local SQLite File Inclusion** | **MEDIUM** | `backend/database.db` (94 KB) present in backend directory. `.gitignore` line 2 covers `*.db`. | Local SQLite database should not be packaged into container builds or checked into Git. | Ensure build scripts exclude `database.db` during containerization. | **100%** |
| **`seed.py` Relative Path Dependency** | **LOW** | `backend/seed.py:9`: `DATA_PATH = os.path.join(BASE_DIR, "..", "frontend", "assets", "data", "data.json")` | If backend is containerized in isolation without parent directory context, database seeding fails. | Move reference seed data inside `backend/data/` or bundle seed data as JSON module inside backend package. | **90%** |

---

## 3. Production Categorization & Classification

### A. Repository & Deployment Artifact Classification Table

| File / Item | Git Repository Status | Production Artifact Status | Justification & Verification |
| :--- | :--- | :--- | :--- |
| **`backend/`** | **RETAIN** | **INCLUDE** | Core FastAPI backend application logic (`main.py`, `seed.py`, `requirements.txt`). |
| **`frontend/`** | **RETAIN** | **INCLUDE (Vercel)** | Core frontend static files (`index.html`, `style.css`, `app.js`, assets). |
| **`.gitignore`** | **RETAIN** | **EXCLUDE** | Controls source control exclusions. Irrelevant to production container runtime. |
| **`.env.example`** | **RETAIN** | **EXCLUDE** | Documents required env keys (`JWT_SECRET`, `DATABASE_URL`) without revealing secrets. Useful for dev setup; exclude from runtime container. |
| **`render.yaml`** | **RETAIN** | **EXCLUDE (Container)** | Blueprint declaration for Render PaaS deployment infrastructure. Required for Render service creation, but not required inside running application container. |
| **`frontend/vercel.json`**| **RETAIN** | **INCLUDE (Vercel)** | Edge route proxy configuration required for Vercel static deployment. |
| **`README.md`** | **RETAIN** | **EXCLUDE** | High-level repository documentation. Safe to exclude from production runtime image. |
| **`EXPLAIN.md`** | **RETAIN** | **EXCLUDE** | Technical explanation document (88 KB). Safe to exclude from production runtime image. |
| **`production_cleanup_report.md`** | **RETAIN (or EXCLUDE)** | **EXCLUDE** | Generated audit report artifact; not required for runtime execution. |
| **`venv/`** | **EXCLUDE (`.gitignore`)** | **EXCLUDE** | Local virtual environment binaries. Dependencies must be installed in container via `requirements.txt`. |
| **`__pycache__/`** | **EXCLUDE (`.gitignore`)** | **EXCLUDE** | Compiled Python bytecode. Re-generated during runtime execution. |
| **`backend/database.db`** | **EXCLUDE (`.gitignore`)** | **EXCLUDE** | Local SQLite database file. Production environment utilizes managed PostgreSQL via `DATABASE_URL`. |
| **`backend/.env`** | **EXCLUDE (`.gitignore`)** | **EXCLUDE** | Contains local environment secrets. Secrets must be injected securely via platform env vars. |

---

## 4. Operational Recommendations & Action Items

1. **Dependency Pinning:**
   * Pin exact versions in `backend/requirements.txt` (e.g. `fastapi==0.110.0`, `uvicorn==0.28.0`).
2. **Environment Variable Enforcement:**
   * Modify `backend/main.py` startup check to enforce `JWT_SECRET` and `DATABASE_URL` verification before binding port.
3. **Build Artifact Optimization:**
   * Configure `.dockerignore` or build export scripts to omit `.gitignore`, `.env.example`, `EXPLAIN.md`, and `README.md` from release builds.
