import sqlite3
import json
import os
import bcrypt
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(BASE_DIR, "database.db"))
DATA_PATH = os.path.join(BASE_DIR, "..", "frontend", "assets", "data", "data.json")

def seed(force=False):
    print("Initializing SQLite Database Seeding...")
    
    # 1. Delete existing database if it exists to preserve old changes
    if os.path.exists(DB_PATH):
        if not force:
            print("Database already exists. Skipping seeding to preserve your changes.")
            return
        os.remove(DB_PATH)
        print("Removed existing database.db")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 2. Create tables
    print("Creating database tables...")
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

    # 3. Seed Default Talati User
    print("Creating default admin user...")
    admin_password = "Nikunj@97"
    hashed_password = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    cursor.execute("""
    INSERT INTO users (id, username, password_hash, role, district, taluka, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    """, ("talati_001", "nikunjdarji", hashed_password, "talati", "મહેસાણા", "ઊંઝા"))

    # 4. Load and insert data.json
    print(f"Reading data from {DATA_PATH}...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Source data.json not found at {DATA_PATH}")

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # Insert metadata
    meta = raw_data.get("metadata", {})
    cursor.execute("""
    INSERT INTO metadata (district, taluka, fps_area, generated_on)
    VALUES (?, ?, ?, ?)
    """, (meta.get("district", "મહેસાણા"), meta.get("taluka", "ઊંઝા"), meta.get("fps_area", ""), meta.get("generated_on", "")))

    # Insert beneficiaries
    beneficiaries = raw_data.get("beneficiaries", [])
    print(f"Seeding {len(beneficiaries)} beneficiaries...")
    for b in beneficiaries:
        cursor.execute("""
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
