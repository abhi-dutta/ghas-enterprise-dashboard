#!/usr/bin/env python3
"""Seed the timeline DB with historical data points for both Dependabot and Secrets."""
import duckdb
from datetime import datetime, timezone, timedelta

CACHE = '/Users/abhishek/Desktop/source-codes/ghas-dashboard/backend/.cache'

conn = duckdb.connect(f'{CACHE}/timeline.duckdb')

# Get Dependabot metrics from the cached DB
dep_conn = duckdb.connect(f'{CACHE}/dependabot_alerts_8896727a19ca.duckdb', read_only=True)
dep = dep_conn.execute("""
    SELECT count(*),
           count(*) FILTER (WHERE "State"='open'),
           count(*) FILTER (WHERE "Severity"='critical'),
           count(*) FILTER (WHERE "Severity"='high'),
           count(*) FILTER (WHERE "Severity"='medium'),
           count(*) FILTER (WHERE "Severity"='low'),
           count(*) FILTER (WHERE "State"='fixed'),
           count(*) FILTER (WHERE "State" IN ('dismissed','auto_dismissed')),
           count(DISTINCT "Organization_Name"),
           count(DISTINCT "Repository_Name")
    FROM dependabot_alerts
""").fetchone()
dep_conn.close()

now = datetime.now(timezone.utc)
past = now - timedelta(days=3)

# Dependabot baseline snapshot (backdated)
try:
    conn.execute(
        """INSERT INTO timeline_snapshots
        (id, timestamp, source, fingerprint, total, open, critical, high, medium, low, fixed, dismissed, leaked, bypassed, orgs, repos)
        VALUES (2, ?, 'dependabot', '8896727a19ca', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)""",
        [past, dep[0], dep[1], dep[2], dep[3], dep[4], dep[5], dep[6], dep[7], dep[8], dep[9]]
    )
    print(f"Added Dependabot snapshot: total={dep[0]}, open={dep[1]}")
except Exception as e:
    print(f"Dependabot snapshot skip: {e}")

# Original secrets baseline (before 5k addition, backdated)
try:
    conn.execute(
        """INSERT INTO timeline_snapshots
        (id, timestamp, source, fingerprint, total, open, critical, high, medium, low, fixed, dismissed, leaked, bypassed, orgs, repos)
        VALUES (3, ?, 'secrets', 'original_seed', 5081, 1756, 0, 0, 0, 0, 0, 1612, 2603, 2462, 8, 70)""",
        [past]
    )
    print("Added original Secrets snapshot: total=5081, open=1756")
except Exception as e:
    print(f"Secrets seed skip: {e}")

# Verify
rows = conn.execute('SELECT id, timestamp, source, total, open FROM timeline_snapshots ORDER BY timestamp').fetchall()
print(f"\nTimeline now has {len(rows)} snapshots:")
for r in rows:
    print(f"  id={r[0]} time={r[1]} source={r[2]} total={r[3]} open={r[4]}")

conn.close()
print("\nDone!")
