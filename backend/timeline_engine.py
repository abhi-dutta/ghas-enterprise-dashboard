"""
Timeline engine — persistent metrics history across CSV ingestions.

Stores a snapshot of key metrics (total, open, critical, leaked, etc.) each
time a new CSV is ingested into the Dependabot or Secret Scanning dashboards.
Data is stored in a dedicated timeline.duckdb that is NEVER auto-deleted,
so history survives across app restarts and new CSV uploads.

Schema:
    timeline_snapshots(
        id            INTEGER PRIMARY KEY (auto-increment),
        timestamp     TIMESTAMP,
        source        VARCHAR,        -- 'dependabot' or 'secrets'
        fingerprint   VARCHAR,        -- CSV fingerprint (dedup key)
        total         INTEGER,
        open          INTEGER,
        critical      INTEGER,
        high          INTEGER,
        medium        INTEGER,
        low           INTEGER,
        fixed         INTEGER,
        dismissed     INTEGER,
        leaked        INTEGER,
        bypassed      INTEGER,
        orgs          INTEGER,
        repos         INTEGER,
    )
"""
from __future__ import annotations

import math
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import duckdb
import pandas as pd

# ── Constants ──────────────────────────────────────────────────────────────
CACHE_DIR = Path(__file__).parent / ".cache"
# Persistent timeline DB — never auto-deleted unlike per-CSV caches
TIMELINE_DB = CACHE_DIR / "timeline.duckdb"
TABLE = "timeline_snapshots"

# ── Thread safety ──────────────────────────────────────────────────────────
_local = threading.local()
_write_lock = threading.Lock()


def _get_read_conn() -> duckdb.DuckDBPyConnection:
    """Return a per-thread read-only connection to the timeline DB.

    Returns None-safe: callers should handle the case where the DB
    doesn't exist yet (before first ingestion)."""
    if not TIMELINE_DB.exists():
        return None
    conn = getattr(_local, "timeline_read", None)
    if conn is not None:
        try:
            conn.execute("SELECT 1")
            return conn
        except Exception:
            _local.timeline_read = None
    conn = duckdb.connect(str(TIMELINE_DB), read_only=True)
    _local.timeline_read = conn
    return conn


def _ensure_table() -> None:
    """Create the timeline table if it doesn't exist (idempotent).

    Uses the write lock to avoid concurrent CREATE TABLE conflicts.
    Checks with a read-only connection first to avoid unnecessary write locks."""
    CACHE_DIR.mkdir(exist_ok=True)

    # Fast path: check if table already exists via a read-only connection
    if TIMELINE_DB.exists():
        try:
            rconn = duckdb.connect(str(TIMELINE_DB), read_only=True)
            rconn.execute(f"SELECT 1 FROM {TABLE} LIMIT 1")
            rconn.close()
            return  # Table exists — nothing to do
        except Exception:
            pass  # Table doesn't exist yet — create it below

    with _write_lock:
        conn = duckdb.connect(str(TIMELINE_DB))
        try:
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {TABLE} (
                    id            INTEGER PRIMARY KEY,
                    timestamp     TIMESTAMP NOT NULL,
                    source        VARCHAR NOT NULL,
                    fingerprint   VARCHAR NOT NULL,
                    total         INTEGER DEFAULT 0,
                    open          INTEGER DEFAULT 0,
                    critical      INTEGER DEFAULT 0,
                    high          INTEGER DEFAULT 0,
                    medium        INTEGER DEFAULT 0,
                    low           INTEGER DEFAULT 0,
                    fixed         INTEGER DEFAULT 0,
                    dismissed     INTEGER DEFAULT 0,
                    leaked        INTEGER DEFAULT 0,
                    bypassed      INTEGER DEFAULT 0,
                    orgs          INTEGER DEFAULT 0,
                    repos         INTEGER DEFAULT 0
                )
            """)
            # Create a unique index to prevent duplicate snapshots for the same CSV
            conn.execute(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_timeline_dedup
                ON {TABLE} (source, fingerprint)
            """)
        finally:
            conn.close()
        # Invalidate any cached read connections so they pick up the new table
        _local.timeline_read = None


def record_snapshot(source: str, fingerprint: str, metrics_dict: dict) -> bool:
    """Record a metrics snapshot for a given source and CSV fingerprint.

    Args:
        source:       'dependabot' or 'secrets'
        fingerprint:  CSV fingerprint hash (from engine._fingerprint)
        metrics_dict: Dict returned by engine.metrics() or secrets_engine.metrics()

    Returns:
        True if a new row was inserted, False if fingerprint already existed (dedup).
    """
    _ensure_table()

    # Normalise metric keys for both Dependabot and Secrets schemas
    total     = _safe_int(metrics_dict.get("total", 0))
    open_     = _safe_int(metrics_dict.get("open", 0))
    critical  = _safe_int(metrics_dict.get("critical", 0))
    high      = _safe_int(metrics_dict.get("high", 0))
    medium    = _safe_int(metrics_dict.get("medium", 0))
    low       = _safe_int(metrics_dict.get("low", 0))
    fixed     = _safe_int(metrics_dict.get("fixed", 0))
    dismissed = _safe_int(metrics_dict.get("dismissed", 0))
    leaked    = _safe_int(metrics_dict.get("publicly_leaked", metrics_dict.get("leaked", 0)))
    bypassed  = _safe_int(metrics_dict.get("push_bypassed", metrics_dict.get("bypassed", 0)))
    orgs      = _safe_int(metrics_dict.get("orgs", 0))
    repos     = _safe_int(metrics_dict.get("repos", 0))

    now = datetime.now(timezone.utc)

    with _write_lock:
        conn = duckdb.connect(str(TIMELINE_DB))
        try:
            # Check if this fingerprint already has a snapshot
            existing = conn.execute(
                f'SELECT id FROM {TABLE} WHERE source = ? AND fingerprint = ?',
                [source, fingerprint]
            ).fetchone()
            if existing:
                return False  # Already recorded — skip duplicate

            # Get next ID
            max_id = conn.execute(f"SELECT COALESCE(MAX(id), 0) FROM {TABLE}").fetchone()[0]
            next_id = max_id + 1

            conn.execute(
                f"""INSERT INTO {TABLE}
                    (id, timestamp, source, fingerprint,
                     total, open, critical, high, medium, low,
                     fixed, dismissed, leaked, bypassed, orgs, repos)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [next_id, now, source, fingerprint,
                 total, open_, critical, high, medium, low,
                 fixed, dismissed, leaked, bypassed, orgs, repos]
            )
            return True
        finally:
            conn.close()
            # Invalidate read connections so they see the new data
            _local.timeline_read = None


def get_timeline(source: Optional[str] = None) -> list[dict]:
    """Retrieve all timeline snapshots, ordered by timestamp.

    Args:
        source: Optional filter — 'dependabot', 'secrets', or None for all.

    Returns:
        List of dicts with timestamp (ISO string), source, and metric values.
        Returns empty list if no timeline data exists yet.
    """
    if not TIMELINE_DB.exists():
        return []

    try:
        conn = _get_read_conn()
        if conn is None:
            return []
    except Exception:
        _local.timeline_read = None
        try:
            conn = _get_read_conn()
            if conn is None:
                return []
        except Exception:
            return []

    try:
        if source:
            df = conn.execute(
                f'SELECT * FROM {TABLE} WHERE source = ? ORDER BY timestamp ASC',
                [source]
            ).fetchdf()
        else:
            df = conn.execute(
                f'SELECT * FROM {TABLE} ORDER BY timestamp ASC'
            ).fetchdf()
        return _clean_records(df)
    except Exception:
        # Table might not exist yet
        return []


def _safe_int(v) -> int:
    """Safely convert a value to int, handling None/NaN/Inf."""
    if v is None:
        return 0
    if isinstance(v, float):
        if not math.isfinite(v):
            return 0
        return int(v)
    try:
        return int(v)
    except (ValueError, TypeError):
        return 0


def _clean_records(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to JSON-safe list of dicts with ISO timestamp strings."""
    df = df.where(df.notna(), other=None)
    df = df.replace([float("inf"), float("-inf")], None)

    # Convert timestamp to ISO string for JSON serialisation
    if "timestamp" in df.columns:
        def _fmt_ts(v):
            if v is None:
                return None
            if hasattr(v, "isoformat"):
                return v.isoformat()
            return str(v)
        df["timestamp"] = df["timestamp"].apply(_fmt_ts)

    records = df.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if isinstance(v, float) and not math.isfinite(v):
                row[k] = None
            elif hasattr(v, "item"):
                row[k] = v.item()
        # Remove internal fields the frontend doesn't need
        row.pop("id", None)
        row.pop("fingerprint", None)
    return records
