from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List, Dict
import sqlite3
import jwt
import bcrypt
import datetime
import os

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    if os.getenv("RENDER") or os.getenv("NODE_ENV") == "production":
        raise RuntimeError("JWT_SECRET environment variable is required in production.")
    else:
        SECRET_KEY = "cbdc_dev_fallback_secret_key_change_me_in_prod"
        print("WARNING: JWT_SECRET environment variable is missing. Using local development fallback secret.")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(BASE_DIR, "database.db"))

app = FastAPI(title="CBDC Ration Portal API")

@app.on_event("startup")
def on_startup():
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        print("Checking if PostgreSQL database needs seeding...")
        needs_seeding = False
        try:
            import psycopg2
            conn = psycopg2.connect(db_url)
            cursor = conn.cursor()
            cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')")
            exists = cursor.fetchone()[0]
            if not exists:
                needs_seeding = True
            else:
                cursor.execute("SELECT COUNT(*) FROM users")
                if cursor.fetchone()[0] == 0:
                    needs_seeding = True
            
            # Ensure audit_logs.ip column type is VARCHAR(255) in existing DB
            try:
                cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs')")
                audit_logs_exists = cursor.fetchone()[0]
                if audit_logs_exists:
                    print("Ensuring audit_logs.ip column type is VARCHAR(255)...")
                    cursor.execute("ALTER TABLE audit_logs ALTER COLUMN ip TYPE VARCHAR(255)")
                    conn.commit()
            except Exception as migration_error:
                print(f"Migration error (altering audit_logs.ip): {migration_error}")
                conn.rollback()

            # Ensure beneficiaries columns onboarded_date and rc_onboarded_date exist
            try:
                cursor.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'beneficiaries')")
                beneficiaries_exists = cursor.fetchone()[0]
                if beneficiaries_exists:
                    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='beneficiaries' AND column_name='onboarded_date'")
                    if not cursor.fetchone():
                        print("Adding column onboarded_date to beneficiaries table (Postgres)...")
                        cursor.execute("ALTER TABLE beneficiaries ADD COLUMN onboarded_date VARCHAR(100) DEFAULT NULL")
                        conn.commit()
                    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='beneficiaries' AND column_name='rc_onboarded_date'")
                    if not cursor.fetchone():
                        print("Adding column rc_onboarded_date to beneficiaries table (Postgres)...")
                        cursor.execute("ALTER TABLE beneficiaries ADD COLUMN rc_onboarded_date VARCHAR(100) DEFAULT NULL")
                        conn.commit()
            except Exception as pg_mig_err:
                print(f"PostgreSQL migration error (onboarded_date columns): {pg_mig_err}")
                conn.rollback()

            conn.close()
        except Exception as e:
            print(f"Error checking PostgreSQL state: {e}")
            
        if needs_seeding:
            print("PostgreSQL needs seeding. Auto-seeding database...")
            from seed import seed
            try:
                seed(force=True)
            except Exception as e:
                print(f"Failed to auto-seed PostgreSQL database: {e}")
        return

    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        
    # Check if database needs seeding (file missing or table missing/empty)
    needs_seeding = False
    if not os.path.exists(DB_PATH):
        needs_seeding = True
    else:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            if not cursor.fetchone():
                needs_seeding = True
            else:
                cursor.execute("SELECT COUNT(*) FROM users")
                if cursor.fetchone()[0] == 0:
                    needs_seeding = True
            conn.close()
        except Exception as e:
            print(f"Error checking database state: {e}")
            needs_seeding = True
            
    if needs_seeding:
        print(f"Database needs seeding. Auto-seeding database at {DB_PATH}...")
        from seed import seed
        try:
            seed(force=True)
        except Exception as e:
            print(f"Failed to auto-seed database: {e}")
    else:
        # Run migration for SQLite if DB exists but missing new columns
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(beneficiaries)")
            columns = [col[1] for col in cursor.fetchall()]
            if columns:
                needs_commit = False
                if "onboarded_date" not in columns:
                    print("Adding column onboarded_date to beneficiaries table (SQLite)...")
                    cursor.execute("ALTER TABLE beneficiaries ADD COLUMN onboarded_date TEXT DEFAULT NULL")
                    needs_commit = True
                if "rc_onboarded_date" not in columns:
                    print("Adding column rc_onboarded_date to beneficiaries table (SQLite)...")
                    cursor.execute("ALTER TABLE beneficiaries ADD COLUMN rc_onboarded_date TEXT DEFAULT NULL")
                    needs_commit = True
                if needs_commit:
                    conn.commit()
            conn.close()
        except Exception as sqlite_mig_err:
            print(f"SQLite migration error (onboarded_date columns): {sqlite_mig_err}")

# Add CORS Middleware with restricted origins
CORS_ORIGINS = [
    "https://pali-omega.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
env_origins = os.getenv("CORS_ORIGINS")
if env_origins:
    CORS_ORIGINS.extend([o.strip() for o in env_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# Dependency to get current user ID from JWT
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("userId")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please login again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")

# Database Connection Wrapper classes
class DatabaseCursor:
    def __init__(self, cursor, is_postgres: bool):
        self.cursor = cursor
        self.is_postgres = is_postgres

    def execute(self, sql: str, params=None):
        if self.is_postgres:
            sql = sql.replace("?", "%s")
        if params is None:
            self.cursor.execute(sql)
        else:
            self.cursor.execute(sql, params)
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows]

    def close(self):
        self.cursor.close()

class DatabaseConnection:
    def __init__(self, conn, is_postgres: bool):
        self.conn = conn
        self.is_postgres = is_postgres

    def cursor(self):
        if self.is_postgres:
            from psycopg2.extras import RealDictCursor
            return DatabaseCursor(self.conn.cursor(cursor_factory=RealDictCursor), True)
        else:
            return DatabaseCursor(self.conn.cursor(), False)

    def execute(self, sql: str, params=None):
        cursor = self.cursor()
        cursor.execute(sql, params)
        return cursor

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

# Database Connection Helper
def get_db():
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        conn = None
        try:
            import psycopg2
            conn = psycopg2.connect(db_url)
        except Exception as e:
            print(f"Failed to connect to PostgreSQL: {e}. Falling back to SQLite.")

        if conn is not None:
            try:
                yield DatabaseConnection(conn, is_postgres=True)
            finally:
                conn.close()
            return

    conn = sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=False)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception as e:
        print(f"Failed to enable WAL mode: {e}")
    conn.row_factory = sqlite3.Row
    try:
        yield DatabaseConnection(conn, is_postgres=False)
    finally:
        conn.close()

# Keep JSON file in sync as a backup by regenerating it from the DB
# Keep JSON file in sync as a backup by regenerating it from the DB
def regenerate_json_backup(db):
    json_path = os.path.join(BASE_DIR, "..", "frontend", "assets", "data", "data.json")
    if not os.path.exists(os.path.dirname(json_path)):
        return
    try:
        import json
        cursor = db.cursor()
        
        # Fetch metadata
        cursor.execute("SELECT district, taluka, fps_area, generated_on FROM metadata LIMIT 1")
        meta_row = cursor.fetchone()
        metadata = dict(meta_row) if meta_row else {
            "district": "મહેસાણા",
            "taluka": "ઊંઝા",
            "fps_area": "",
            "generated_on": ""
        }
        
        # Fetch beneficiaries
        cursor.execute("SELECT * FROM beneficiaries ORDER BY sr_no ASC")
        rows = cursor.fetchall()
        
        beneficiaries = []
        for row in rows:
            b = dict(row)
            b["sr_no"] = int(b["sr_no"])
            b["version"] = int(b["version"])
            beneficiaries.append(b)
            
        data = {
            "metadata": metadata,
            "beneficiaries": beneficiaries
        }
        
        temp_path = json_path + ".tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, json_path)
    except Exception as e:
        print(f"Error regenerating JSON backup: {e}")

# Request Models
class LoginRequest(BaseModel):
    username: str
    password: str

class OnboardingUpdate(BaseModel):
    field: str
    status: str
    version: int
    remarks: Optional[str] = ""

# Simple in-memory rate limiter for login
login_attempts = {}

def rate_limit_login(request: Request):
    client_host = request.client.host if request.client else "unknown"
    client_ip = request.headers.get("x-forwarded-for") or client_host or "unknown"
    
    import datetime
    now = datetime.datetime.utcnow().timestamp()
    
    # Clean old attempts (older than 60 seconds)
    if client_ip in login_attempts:
        login_attempts[client_ip] = [t for t in login_attempts[client_ip] if now - t < 60]
    else:
        login_attempts[client_ip] = []
        
    # Limit to 5 attempts per minute
    if len(login_attempts[client_ip]) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again in a minute."
        )
        
    login_attempts[client_ip].append(now)

# --- API ROUTES ---

@app.post("/api/auth/login")
def login(req: LoginRequest, db = Depends(get_db), _ = Depends(rate_limit_login)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username.strip(),))
    row = cursor.fetchone()
    
    if not row:
        raise HTTPException(status_code=401, detail="Incorrect ID or password")
        
    user = dict(row)
    password_hash = user.get("password_hash")
    
    if not password_hash or not bcrypt.checkpw(req.password.encode('utf-8'), password_hash.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Incorrect ID or password")
        
    # Generate JWT
    token_payload = {
        "userId": user["id"],
        "username": user["username"],
        "role": user["role"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=30)
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm="HS256")
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "district": user["district"],
            "taluka": user["taluka"]
        }
    }

@app.post("/api/auth/logout")
def logout():
    return {"success": True}

@app.get("/api/auth/me")
def get_me(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, username, role, district, taluka FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)

@app.get("/api/beneficiaries")
def get_beneficiaries(status: Optional[str] = None, db = Depends(get_db)):
    cursor = db.cursor()
    
    # Get metadata
    cursor.execute("SELECT district, taluka, fps_area, generated_on FROM metadata LIMIT 1")
    meta_row = cursor.fetchone()
    metadata = dict(meta_row) if meta_row else {
        "district": "મહેસાણા",
        "taluka": "ઊંઝા",
        "fps_area": "ભરતભાઈ હરગોવનજી બારોટ : 2310 (પળી : 14785 - હંગામી )",
        "generated_on": ""
    }
    
    # Get beneficiaries
    query = "SELECT * FROM beneficiaries"
    params = []
    if status == "ONBOARDED":
        query += " WHERE onboarded = 'Yes'"
    elif status == "PENDING":
        query += " WHERE onboarded = 'No'"
        
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    beneficiaries = [dict(row) for row in rows]
    return {
        "metadata": metadata,
        "beneficiaries": beneficiaries
    }

@app.get("/api/beneficiaries/{srNo}")
def get_beneficiary(srNo: int, db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM beneficiaries WHERE sr_no = ?", (srNo,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    return dict(row)

@app.patch("/api/beneficiaries/{srNo}/onboarding")
def update_onboarding(
    srNo: int, 
    body: OnboardingUpdate, 
    request: Request,
    user_id: str = Depends(get_current_user), 
    db = Depends(get_db)
):
    if body.field not in ["onboarded", "rc_onboarded"]:
        raise HTTPException(status_code=400, detail="Invalid field name")
    if body.status not in ["Yes", "No"]:
        raise HTTPException(status_code=400, detail="Invalid status value")
        
    if not db.is_postgres:
        db.conn.execute("BEGIN IMMEDIATE")
    cursor = db.cursor()
    
    # Fetch beneficiary to check existence and current state
    cursor.execute("SELECT * FROM beneficiaries WHERE sr_no = ?", (srNo,))
    beneficiary_row = cursor.fetchone()
    if not beneficiary_row:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
        
    b = dict(beneficiary_row)
    db_version = b["version"]
    
    # Version conflict detection
    if body.version != db_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "Version conflict",
                "currentVersion": db_version,
                "yourVersion": body.version,
                "currentData": {
                    "onboarded": b["onboarded"],
                    "rc_onboarded": b["rc_onboarded"]
                }
            }
        )
        
    # Process update
    old_status = b[body.field]
    new_version = db_version + 1
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    
    date_field = f"{body.field}_date"
    date_val = now_str if body.status == "Yes" else None
    
    # Update DB
    cursor.execute(
        f"UPDATE beneficiaries SET {body.field} = ?, {date_field} = ?, version = ? WHERE sr_no = ?",
        (body.status, date_val, new_version, srNo)
    )
    
    # Log audit trail
    client_host = request.client.host if request.client else "unknown"
    client_ip = request.headers.get("x-forwarded-for") or client_host or "unknown"
    cursor.execute("""
    INSERT INTO audit_logs (
        user_id, action, sr_no, beneficiary_name, field, 
        old_status, new_status, remarks, ip, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, "onboarding_update", srNo, b["name"], body.field,
        old_status, body.status, body.remarks or "", client_ip, now_str
    ))
    
    db.commit()
    regenerate_json_backup(db)
    
    return {
        "sr_no": srNo,
        "onboarded": body.status if body.field == "onboarded" else b["onboarded"],
        "rc_onboarded": body.status if body.field == "rc_onboarded" else b["rc_onboarded"],
        "onboarded_date": date_val if body.field == "onboarded" else b.get("onboarded_date"),
        "rc_onboarded_date": date_val if body.field == "rc_onboarded" else b.get("rc_onboarded_date"),
        "version": new_version,
        "updatedBy": user_id,
        "updatedAt": now_str
    }

@app.get("/api/dashboard")
def get_dashboard(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    cursor = db.cursor()
    
    # Counts
    cursor.execute("SELECT COUNT(*) FROM beneficiaries")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT ration_card) FROM beneficiaries")
    total_cards = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM beneficiaries WHERE onboarded = 'Yes'")
    onboarded = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM beneficiaries WHERE rc_onboarded = 'Yes'")
    rc_onboarded = cursor.fetchone()[0]
    
    onboarded_percent = f"{(onboarded / total * 100):.1f}" if total > 0 else "0.0"
    rc_onboarded_percent = f"{(rc_onboarded / total * 100):.1f}" if total > 0 else "0.0"
    
    # Audit log (recent 5)
    cursor.execute("""
    SELECT id, user_id, action, sr_no, beneficiary_name, field, 
           old_status, new_status, remarks, ip, timestamp 
    FROM audit_logs 
    WHERE user_id = ? 
    ORDER BY id DESC LIMIT 5
    """, (user_id,))
    audit_rows = cursor.fetchall()
    
    recent_activity = []
    for r in audit_rows:
        activity = dict(r)
        # Rename keys to camelCase if needed, or keep standard (frontend uses timestamp and details)
        recent_activity.append({
            "id": activity["id"],
            "userId": activity["user_id"],
            "action": activity["action"],
            "sr_no": activity["sr_no"],
            "beneficiaryName": activity["beneficiary_name"],
            "field": activity["field"],
            "oldStatus": activity["old_status"],
            "newStatus": activity["new_status"],
            "remarks": activity["remarks"],
            "ip": activity["ip"],
            "timestamp": activity["timestamp"]
        })
        
    return {
        "total": total,
        "totalCards": total_cards,
        "onboarded": onboarded,
        "onboardedPercent": onboarded_percent,
        "rcOnboarded": rc_onboarded,
        "rcOnboardedPercent": rc_onboarded_percent,
        "pending": total - onboarded,
        "recentActivity": recent_activity,
        "cachedAt": datetime.datetime.utcnow().isoformat() + "Z"
    }

@app.get("/api/audit")
def get_audit(limit: int = 20, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    safe_limit = min(max(1, limit), 100)
    cursor = db.cursor()
    cursor.execute("""
    SELECT id, user_id, action, sr_no, beneficiary_name, field, 
           old_status, new_status, remarks, ip, timestamp 
    FROM audit_logs 
    WHERE user_id = ? 
    ORDER BY id DESC LIMIT ?
    """, (user_id, safe_limit))
    rows = cursor.fetchall()
    
    events = []
    for r in rows:
        evt = dict(r)
        events.append({
            "id": evt["id"],
            "userId": evt["user_id"],
            "action": evt["action"],
            "sr_no": evt["sr_no"],
            "beneficiaryName": evt["beneficiary_name"],
            "field": evt["field"],
            "oldStatus": evt["old_status"],
            "newStatus": evt["new_status"],
            "remarks": evt["remarks"],
            "ip": evt["ip"],
            "timestamp": evt["timestamp"]
        })
        
    return {"events": events}

@app.get("/api/sync/latest")
def sync_latest(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
    SELECT sr_no, onboarded, rc_onboarded, version 
    FROM beneficiaries 
    WHERE onboarded = 'Yes' OR rc_onboarded = 'Yes' OR version > 0
    """)
    rows = cursor.fetchall()
    
    overrides = {}
    for r in rows:
        d = dict(r)
        overrides[str(d["sr_no"])] = {
            "onboarded": d["onboarded"],
            "rc_onboarded": d["rc_onboarded"],
            "version": d["version"]
        }
        
    return {
        "overrides": overrides,
        "syncedAt": datetime.datetime.utcnow().isoformat() + "Z"
    }



# Root status route for backend
@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "CBDC Ration Portal API is running successfully.",
        "version": "1.0.0"
    }

# Serve static files at root (fallback for local development only, disabled on Render)
if not os.getenv("RENDER"):
    FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
    if os.path.exists(FRONTEND_DIR):
        app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    host = "0.0.0.0" if os.getenv("RENDER") else "127.0.0.1"
    print(f"Starting CBDC Ration Portal FastAPI server at http://{host}:{port} ...")
    uvicorn.run("main:app", host=host, port=port, reload=os.getenv("RENDER") is None)
