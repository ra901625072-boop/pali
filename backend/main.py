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

SECRET_KEY = os.getenv("JWT_SECRET", "cbdc_super_secret_jwt_key_97_pali")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")

app = FastAPI(title="CBDC Ration Portal API")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# Database Connection Helper
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# Keep JSON file in sync as a backup
def update_json_backup(sr_no: int, field: str, status: str):
    json_path = os.path.join(BASE_DIR, "..", "frontend", "assets", "data", "data.json")
    if not os.path.exists(json_path):
        return
    try:
        import json
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        updated = False
        for b in data.get("beneficiaries", []):
            if b.get("sr_no") == sr_no:
                b[field] = status
                updated = True
                break
        
        if updated:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error updating JSON backup: {e}")

# Request Models
class LoginRequest(BaseModel):
    username: str
    password: str

class OnboardingUpdate(BaseModel):
    field: str
    status: str
    version: int
    remarks: Optional[str] = ""

# --- API ROUTES ---

@app.post("/api/auth/login")
def login(req: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username.strip(),))
    row = cursor.fetchone()
    
    if not row:
        raise HTTPException(status_code=401, detail="Incorrect ID or password")
        
    user = dict(row)
    password_hash = user.get("password_hash")
    
    if not bcrypt.checkpw(req.password.encode('utf-8'), password_hash.encode('utf-8')):
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
def get_me(user_id: str = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, username, role, district, taluka FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)

@app.get("/api/beneficiaries")
def get_beneficiaries(status: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
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
def get_beneficiary(srNo: int, db: sqlite3.Connection = Depends(get_db)):
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
    db: sqlite3.Connection = Depends(get_db)
):
    if body.field not in ["onboarded", "rc_onboarded"]:
        raise HTTPException(status_code=400, detail="Invalid field name")
    if body.status not in ["Yes", "No"]:
        raise HTTPException(status_code=400, detail="Invalid status value")
        
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
    
    # Update DB
    cursor.execute(
        f"UPDATE beneficiaries SET {body.field} = ?, version = ? WHERE sr_no = ?",
        (body.status, new_version, srNo)
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
    update_json_backup(srNo, body.field, body.status)
    
    return {
        "sr_no": srNo,
        "onboarded": body.status if body.field == "onboarded" else b["onboarded"],
        "rc_onboarded": body.status if body.field == "rc_onboarded" else b["rc_onboarded"],
        "version": new_version,
        "updatedBy": user_id,
        "updatedAt": now_str
    }

@app.get("/api/dashboard")
def get_dashboard(user_id: str = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
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
def get_audit(limit: int = 20, user_id: str = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
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
def sync_latest(user_id: str = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
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



# Serve static files at root (fallback for local development)
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    host = "0.0.0.0" if os.getenv("RENDER") else "127.0.0.1"
    print(f"Starting CBDC Ration Portal FastAPI server at http://{host}:{port} ...")
    uvicorn.run("main:app", host=host, port=port, reload=os.getenv("RENDER") is None)
