import sqlite3
import json
import os
import bcrypt
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(BASE_DIR, "database.db"))
DATA_PATH = os.path.join(BASE_DIR, "..", "frontend", "assets", "data", "data.json")

def seed(force=False):
    db_url = os.getenv("DATABASE_URL")
    is_postgres = False
    
    if db_url:
        print("Connecting to PostgreSQL database for seeding...")
        import psycopg2
        conn = psycopg2.connect(db_url)
        is_postgres = True
    else:
        print("Initializing SQLite Database Seeding...")
        if os.path.exists(DB_PATH):
            if not force:
                print("Database already exists. Skipping seeding to preserve your changes.")
                return
            os.remove(DB_PATH)
            print("Removed existing database.db")
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        
    cursor = conn.cursor()

    # Drop tables if force seeding on Postgres
    if is_postgres and force:
        print("Dropping existing PostgreSQL tables...")
        cursor.execute("DROP TABLE IF EXISTS users CASCADE")
        cursor.execute("DROP TABLE IF EXISTS beneficiaries CASCADE")
        cursor.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
        cursor.execute("DROP TABLE IF EXISTS metadata CASCADE")

    # Create tables
    print("Creating database tables...")
    
    if is_postgres:
        cursor.execute("""
        CREATE TABLE users (
            id VARCHAR(100) PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL,
            district VARCHAR(100) NOT NULL,
            taluka VARCHAR(100) NOT NULL,
            created_at VARCHAR(100) NOT NULL
        )
        """)
        
        cursor.execute("""
        CREATE TABLE beneficiaries (
            sr_no INTEGER PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            ration_card VARCHAR(100) NOT NULL,
            clean_ration_card VARCHAR(100) NOT NULL,
            card_type VARCHAR(50) NOT NULL,
            shop_name VARCHAR(255) NOT NULL,
            area_name VARCHAR(255) NOT NULL,
            mobile VARCHAR(50),
            member_id VARCHAR(100) NOT NULL,
            uid_masked VARCHAR(50) NOT NULL,
            onboarded VARCHAR(10) DEFAULT 'No',
            rc_onboarded VARCHAR(10) DEFAULT 'No',
            version INTEGER DEFAULT 0
        )
        """)
        
        cursor.execute("""
        CREATE TABLE audit_logs (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(100) NOT NULL,
            action VARCHAR(100) NOT NULL,
            sr_no INTEGER,
            beneficiary_name VARCHAR(255),
            field VARCHAR(50),
            old_status VARCHAR(50),
            new_status VARCHAR(50),
            remarks TEXT,
            ip VARCHAR(255),
            timestamp VARCHAR(100) NOT NULL
        )
        """)
        
        cursor.execute("""
        CREATE TABLE metadata (
            district VARCHAR(100) NOT NULL,
            taluka VARCHAR(100) NOT NULL,
            fps_area VARCHAR(255) NOT NULL,
            generated_on VARCHAR(100) NOT NULL
        )
        """)
    else:
        cursor.execute("""
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            district TEXT NOT NULL,
            taluka TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE beneficiaries (
            sr_no INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            ration_card TEXT NOT NULL,
            clean_ration_card TEXT NOT NULL,
            card_type TEXT NOT NULL,
            shop_name TEXT NOT NULL,
            area_name TEXT NOT NULL,
            mobile TEXT,
            member_id TEXT NOT NULL,
            uid_masked TEXT NOT NULL,
            onboarded TEXT DEFAULT 'No',
            rc_onboarded TEXT DEFAULT 'No',
            version INTEGER DEFAULT 0
        )
        """)

        cursor.execute("""
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            sr_no INTEGER,
            beneficiary_name TEXT,
            field TEXT,
            old_status TEXT,
            new_status TEXT,
            remarks TEXT,
            ip TEXT,
            timestamp TEXT NOT NULL
        )
        """)

        cursor.execute("""
        CREATE TABLE metadata (
            district TEXT NOT NULL,
            taluka TEXT NOT NULL,
            fps_area TEXT NOT NULL,
            generated_on TEXT NOT NULL
        )
        """)

    # Helper function to run query dynamically
    def run_query(sql, params=None):
        if is_postgres:
            sql = sql.replace("?", "%s")
        if params is None:
            cursor.execute(sql)
        else:
            cursor.execute(sql, params)

    # 3. Seed Default Talati User
    print("Creating default admin user...")
    admin_password = "Nikunj@97"
    hashed_password = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    import datetime
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    
    run_query("""
    INSERT INTO users (id, username, password_hash, role, district, taluka, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("talati_001", "nikunjdarji", hashed_password, "talati", "મહેસાણા", "ઊંઝા", now_str))

    # 4. Load and insert data.json
    print(f"Reading data from {DATA_PATH}...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Source data.json not found at {DATA_PATH}")

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # Insert metadata
    meta = raw_data.get("metadata", {})
    run_query("""
    INSERT INTO metadata (district, taluka, fps_area, generated_on)
    VALUES (?, ?, ?, ?)
    """, (meta.get("district", "મહેસાણા"), meta.get("taluka", "ઊંઝા"), meta.get("fps_area", ""), meta.get("generated_on", "")))

    # Insert beneficiaries
    beneficiaries = raw_data.get("beneficiaries", [])
    print(f"Seeding {len(beneficiaries)} beneficiaries...")
    for b in beneficiaries:
        run_query("""
        INSERT INTO beneficiaries (
            sr_no, name, ration_card, clean_ration_card, card_type, 
            shop_name, area_name, mobile, member_id, uid_masked, 
            onboarded, rc_onboarded, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            b.get("sr_no"),
            b.get("name"),
            b.get("ration_card"),
            b.get("clean_ration_card"),
            b.get("card_type"),
            b.get("shop_name"),
            b.get("area_name"),
            b.get("mobile"),
            b.get("member_id"),
            b.get("uid_masked"),
            b.get("onboarded", "No"),
            b.get("rc_onboarded", "No"),
            0 # version
        ))

    conn.commit()
    conn.close()
    print("Database successfully seeded!")

if __name__ == "__main__":
    force = "--force" in sys.argv
    seed(force)
