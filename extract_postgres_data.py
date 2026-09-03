import os
import sys
import time
import json
import argparse
import datetime
from decimal import Decimal

DEFAULT_DB_URL = os.environ.get("DATABASE_URL", "")

def json_serial(obj):
    """Custom JSON serializer for non-standard objects."""
    if isinstance(obj, (datetime.datetime, datetime.date, datetime.time)):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return float(obj) if obj % 1 != 0 else int(obj)
    elif isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    raise TypeError(f"Type {type(obj)} not serializable")

def connect_db(db_url, wait_mode=False, max_attempts=60, retry_delay=5):
    import psycopg2
    from psycopg2.extras import RealDictCursor

    if "sslmode" not in db_url:
        delimiter = "&" if "?" in db_url else "?"
        db_url = f"{db_url}{delimiter}sslmode=require"

    attempt = 0
    while True:
        attempt += 1
        try:
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] Attempting connection (attempt {attempt})...")
            conn = psycopg2.connect(db_url, connect_timeout=10)
            print("Successfully connected to PostgreSQL database!")
            return conn
        except Exception as e:
            err_msg = str(e).strip()
            print(f"Connection failed: {err_msg}")
            
            if "SSL connection has been closed unexpectedly" in err_msg or "closed unexpectedly" in err_msg:
                print("\n--> DIAGNOSTIC NOTE:")
                print("    This error typically means the Render PostgreSQL database is currently in 'SUSPENDED' state.")
                print("    Render shuts down database containers when suspended, causing immediate connection drop.")
                print("    Please log into https://dashboard.render.com, locate your database, and click 'Resume Database'.")
            
            if not wait_mode:
                return None
            
            if attempt >= max_attempts:
                print(f"Reached maximum attempts ({max_attempts}). Exiting.")
                return None
            
            print(f"Waiting {retry_delay}s before retrying... (Press Ctrl+C to cancel)\n")
            time.sleep(retry_delay)

def extract_data(conn, output_dir):
    from psycopg2.extras import RealDictCursor

    os.makedirs(output_dir, exist_ok=True)
    cur = conn.cursor()

    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """)
    tables = [row[0] for row in cur.fetchall()]
    print(f"\nFound {len(tables)} tables: {', '.join(tables)}")

    all_data = {}
    summary = {}

    for table in tables:
        print(f"\nExtracting table: '{table}'...")
        dict_cur = conn.cursor(cursor_factory=RealDictCursor)
        dict_cur.execute(f'SELECT * FROM "{table}";')
        rows = dict_cur.fetchall()
        dict_rows = [dict(r) for r in rows]
        all_data[table] = dict_rows
        summary[table] = len(dict_rows)
        print(f" - Fetched {len(dict_rows)} records")

        table_file = os.path.join(output_dir, f"{table}.json")
        with open(table_file, "w", encoding="utf-8") as f:
            json.dump(dict_rows, f, indent=2, default=json_serial, ensure_ascii=False)
        print(f" - Saved: {table_file}")
        dict_cur.close()

    # Save full consolidated dump
    dump_file = os.path.join(output_dir, "cbdc_all_tables_dump.json")
    with open(dump_file, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, default=json_serial, ensure_ascii=False)
    print(f"\nConsolidated dump saved to: {dump_file}")

    # Generate frontend-compatible data.json format if metadata and beneficiaries are present
    if "metadata" in all_data and "beneficiaries" in all_data:
        frontend_format = {
            "metadata": all_data["metadata"][0] if all_data["metadata"] else {},
            "beneficiaries": all_data["beneficiaries"]
        }
        frontend_file = os.path.join(output_dir, "data_frontend_compatible.json")
        with open(frontend_file, "w", encoding="utf-8") as f:
            json.dump(frontend_format, f, indent=2, default=json_serial, ensure_ascii=False)
        print(f"Frontend-compatible data saved to: {frontend_file}")

    # Save summary metadata
    summary_file = os.path.join(output_dir, "extraction_summary.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.datetime.now().isoformat(),
            "total_tables": len(tables),
            "table_record_counts": summary,
            "output_directory": os.path.abspath(output_dir)
        }, f, indent=2)

    cur.close()
    conn.close()

    print("\nExtraction Summary:")
    for t, c in summary.items():
        print(f"  * {t}: {c} records")
    print(f"\nAll files saved in: {os.path.abspath(output_dir)}")
    return True

def main():
    parser = argparse.ArgumentParser(description="Extract PostgreSQL Database to JSON files.")
    parser.add_argument("--url", default=DEFAULT_DB_URL, help="PostgreSQL connection URL")
    parser.add_argument("--output", default=r"d:\CBDCP\extracted_data_postgres", help="Output directory for JSON files")
    parser.add_argument("--wait", action="store_true", help="Wait and auto-retry until the database is resumed")
    args = parser.parse_args()

    print("=" * 60)
    print("PostgreSQL Database Data Extractor")
    print("=" * 60)
    print(f"Target URL: {args.url.split('@')[-1] if '@' in args.url else args.url}")
    print(f"Output Dir: {args.output}")
    print(f"Wait mode : {'Enabled (will poll until online)' if args.wait else 'Disabled (single attempt)'}")
    print("=" * 60)

    conn = connect_db(args.url, wait_mode=args.wait)
    if conn is None:
        print("\nCould not connect to the database.")
        sys.exit(1)

    extract_data(conn, args.output)

if __name__ == "__main__":
    main()
