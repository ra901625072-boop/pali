import os
import sys
import json
import sqlite3

BASE_DIR = r"d:\CBDCP"
DB_PATH = os.path.join(BASE_DIR, "backend", "database.db")
OUTPUT_DIR = os.path.join(BASE_DIR, "extracted_data_local_sqlite")

os.makedirs(OUTPUT_DIR, exist_ok=True)

if not os.path.exists(DB_PATH):
    print(f"Error: {DB_PATH} does not exist.")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
tables = [row[0] for row in cur.fetchall()]

all_data = {}
summary = {}

for table in tables:
    cur.execute(f"SELECT * FROM {table}")
    rows = [dict(row) for row in cur.fetchall()]
    all_data[table] = rows
    summary[table] = len(rows)
    
    table_file = os.path.join(OUTPUT_DIR, f"{table}.json")
    with open(table_file, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(rows)} records from '{table}' to {table_file}")

dump_file = os.path.join(OUTPUT_DIR, "all_database_dump.json")
with open(dump_file, "w", encoding="utf-8") as f:
    json.dump(all_data, f, indent=2, ensure_ascii=False)

print("\nExtracted local SQLite database successfully!")
for t, c in summary.items():
    print(f"  {t}: {c} records")
