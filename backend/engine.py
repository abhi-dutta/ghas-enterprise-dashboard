"""
DuckDB engine for GHAS Dependabot dashboard.
One-time CSV → DuckDB ingestion, then all queries are pure SQL.
Thread-safe module-level connection pool.
"""
from __future__ import annotations

import hashlib
import io
import math
import threading
from pathlib import Path
from typing import Optional

import duckdb
import pandas as pd

CACHE_DIR = Path(__file__).parent / ".cache"
TABLE = "dependabot_alerts"

DATE_COLS = ["Created_At", "Updated_At", "Dismissed_At", "Fixed_At", "Auto_Dismissed_At"]

DISPLAY_COLS = [
    "Alert_Number", "Organization_Name", "Repository_Name", "State",
    "Severity", "Dependency_Package_Ecosystem", "Dependency_Package_Name",
    "CVE_ID", "CVSS_Score", "Advisory_Summary", "Created_At", "URL",
]

# ── Thread-local connections ───────────────────────────────────────────────
_local = threading.local()
_lock = threading.Lock()
_col_cache: dict[str, list[str]] = {}


def get_conn(db_file: str) -> duckdb.DuckDBPyConnection:
    """Return a per-thread DuckDB connection. Each thread gets its own
    connection so concurrent FastAPI requests never share state."""
    conns: dict[str, duckdb.DuckDBPyConnection] = getattr(_local, "conns", None)
    if conns is None:
        _local.conns = {}
        conns = _local.conns
    conn = conns.get(db_file)
    if conn is not None:
        try:
            conn.execute("SELECT 1")
            return conn
        except Exception:
            conns.pop(db_file, None)
    conn = duckdb.connect(db_file, read_only=True)
    conns[db_file] = conn
    return conn


# ── Ingestion ──────────────────────────────────────────────────────────────
def _fingerprint(p: Path) -> str:
    s = p.stat()
    return hashlib.md5(f"{p.name}-{s.st_size}-{s.st_mtime_ns}".encode()).hexdigest()[:12]


def db_path_for(csv_path: Path) -> Path:
    return CACHE_DIR / f"{csv_path.stem}_{_fingerprint(csv_path)}.duckdb"


def _cleanup_old_dbs(keep: Path) -> None:
    """Delete all .duckdb files in CACHE_DIR except the one we just created
    and the persistent timeline.duckdb."""
    for old in CACHE_DIR.glob("*.duckdb"):
        if old.resolve() != keep.resolve() and old.name != "timeline.duckdb":
            try:
                old.unlink()
                _pool_key = str(old)
                with _lock:
                    _col_cache.pop(_pool_key, None)
                # Also evict any thread-local connections for the old db
                # (they will fail-safe on next access and be re-created)
            except OSError:
                pass  # file already gone or locked — ignore


def ingest(csv_path: Path) -> str:
    """CSV → DuckDB. Returns path to .duckdb file."""
    CACHE_DIR.mkdir(exist_ok=True)
    db = db_path_for(csv_path)
    if db.exists():
        # Verify the cached DB actually contains our table
        try:
            conn = duckdb.connect(str(db), read_only=True)
            conn.execute(f"SELECT 1 FROM {TABLE} LIMIT 1")
            conn.close()
        except Exception:
            # Stale/corrupt cache — delete and re-ingest
            db.unlink(missing_ok=True)
        else:
            _warm_col_cache(db)
            _cleanup_old_dbs(keep=db)
            # Record timeline snapshot even for cached DBs (captures initial state on restart)
            try:
                import timeline_engine
                m = metrics(str(db))
                timeline_engine.record_snapshot("dependabot", _fingerprint(csv_path), m)
            except Exception:
                pass
            return str(db)

    conn = duckdb.connect(str(db))
    try:
        conn.execute(f"""
            CREATE TABLE {TABLE} AS
            SELECT * FROM read_csv_auto(
                '{csv_path}',
                sample_size=20000,
                all_varchar=false,
                ignore_errors=true
            )
        """)
        existing = _col_set(conn)
        for col in DATE_COLS:
            if col in existing:
                dtype = conn.execute(
                    f"SELECT data_type FROM information_schema.columns "
                    f"WHERE table_name='{TABLE}' AND column_name='{col}'"
                ).fetchone()[0]
                if "VARCHAR" in dtype.upper():
                    conn.execute(f"""
                        ALTER TABLE {TABLE}
                        ALTER COLUMN "{col}"
                        SET DATA TYPE TIMESTAMP
                        USING TRY_CAST("{col}" AS TIMESTAMP)
                    """)
        for col in ["Severity", "State", "Dependency_Package_Ecosystem",
                    "Organization_Name", "Repository_Name", "CVE_ID"]:
            if col in existing:
                conn.execute(
                    f'CREATE INDEX IF NOT EXISTS idx_{col.lower().replace(" ","_")} '
                    f'ON {TABLE} ("{col}")'
                )
    finally:
        conn.close()

    _warm_col_cache(db)
    _cleanup_old_dbs(keep=db)

    # Record a timeline snapshot for this new ingestion
    try:
        import timeline_engine
        m = metrics(str(db))
        timeline_engine.record_snapshot("dependabot", _fingerprint(csv_path), m)
    except Exception:
        pass  # Timeline recording is best-effort; never block ingestion

    return str(db)


def _col_set(conn) -> set[str]:
    return {r[0] for r in conn.execute(
        f"SELECT column_name FROM information_schema.columns WHERE table_name='{TABLE}'"
    ).fetchall()}


def _warm_col_cache(db: Path):
    key = str(db)
    if key in _col_cache:
        return
    conn = duckdb.connect(key, read_only=True)
    try:
        existing = _col_set(conn)
        _col_cache[key] = [c for c in DISPLAY_COLS if c in existing]
    finally:
        conn.close()


def display_col_sql(db_file: str) -> str:
    cols = _col_cache.get(db_file)
    if not cols:
        _warm_col_cache(Path(db_file))
        cols = _col_cache.get(db_file, [])
    return ", ".join(f'"{c}"' for c in cols) if cols else "*"


# ── JSON-safe serialisation helper ────────────────────────────────────────
def _clean_records(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to JSON-safe records.
    Replaces NaN, NaT, Inf, -Inf and numpy scalar types with plain Python."""
    df = df.where(df.notna(), other=None)
    df = df.replace([float("inf"), float("-inf")], None)
    records = df.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if isinstance(v, float) and not math.isfinite(v):
                row[k] = None
            # numpy int64 / float64 → plain Python so json.dumps never chokes
            elif hasattr(v, "item"):
                row[k] = v.item()
    return records


# ── WHERE builder ──────────────────────────────────────────────────────────
def where_clause(
    search: str = "",
    severity: Optional[list[str]] = None,
    state: Optional[list[str]] = None,
    ecosystem: Optional[list[str]] = None,
    org: Optional[list[str]] = None,
) -> tuple[str, list]:
    clauses, params = [], []
    if severity:
        clauses.append(f'"Severity" IN ({",".join(["?"]*len(severity))})')
        params.extend(severity)
    if state:
        clauses.append(f'"State" IN ({",".join(["?"]*len(state))})')
        params.extend(state)
    if ecosystem:
        clauses.append(f'"Dependency_Package_Ecosystem" IN ({",".join(["?"]*len(ecosystem))})')
        params.extend(ecosystem)
    if org:
        clauses.append(f'"Organization_Name" IN ({",".join(["?"]*len(org))})')
        params.extend(org)
    if search:
        t = f"%{search}%"
        clauses.append(
            '(COALESCE("Advisory_Summary",\'\') ILIKE ? '
            'OR COALESCE("CVE_ID",\'\') ILIKE ? '
            'OR COALESCE("Dependency_Package_Name",\'\') ILIKE ? '
            'OR COALESCE("Repository_Name",\'\') ILIKE ? '
            'OR COALESCE("Organization_Name",\'\') ILIKE ?)'
        )
        params.extend([t] * 5)
    return ("WHERE " + " AND ".join(clauses)) if clauses else "", params


# ── Query functions ────────────────────────────────────────────────────────
def filter_options(db_file: str) -> dict:
    conn = get_conn(db_file)
    result = {}
    for key, col in [
        ("severities", "Severity"),
        ("states", "State"),
        ("ecosystems", "Dependency_Package_Ecosystem"),
    ]:
        rows = conn.execute(
            f'SELECT DISTINCT "{col}" FROM {TABLE} WHERE "{col}" IS NOT NULL ORDER BY "{col}"'
        ).fetchall()
        result[key] = [str(r[0]) for r in rows]
    return result


def search_orgs(db_file: str, q: str = "", limit: int = 50) -> list[str]:
    """Return org names matching a prefix/substring, capped at `limit`."""
    conn = get_conn(db_file)
    if q.strip():
        rows = conn.execute(
            f'SELECT DISTINCT "Organization_Name" FROM {TABLE} '
            f'WHERE "Organization_Name" IS NOT NULL '
            f'AND "Organization_Name" ILIKE ? '
            f'ORDER BY "Organization_Name" LIMIT ?',
            [f"%{q}%", limit],
        ).fetchall()
    else:
        rows = conn.execute(
            f'SELECT DISTINCT "Organization_Name" FROM {TABLE} '
            f'WHERE "Organization_Name" IS NOT NULL '
            f'ORDER BY "Organization_Name" LIMIT ?',
            [limit],
        ).fetchall()
    return [str(r[0]) for r in rows]


def metrics(db_file: str) -> dict:
    conn = get_conn(db_file)
    row = conn.execute(f"""
        SELECT
            count(*),
            count(*) FILTER (WHERE "State"='open'),
            count(*) FILTER (WHERE "State"='fixed'),
            count(*) FILTER (WHERE "State" IN ('dismissed','auto_dismissed')),
            count(*) FILTER (WHERE "Severity"='critical'),
            count(*) FILTER (WHERE "Severity"='high'),
            count(*) FILTER (WHERE "Severity"='medium'),
            count(*) FILTER (WHERE "Severity"='low'),
            ROUND(AVG(TRY_CAST("CVSS_Score" AS DOUBLE)),2),
            count(DISTINCT "Repository_Name"),
            count(DISTINCT "Organization_Name"),
            count(DISTINCT "CVE_ID")
        FROM {TABLE}
    """).fetchone()
    keys = ["total","open","fixed","dismissed","critical","high","medium",
            "low","avg_cvss","repos","orgs","cves"]
    return {
        k: (None if isinstance(v, float) and not math.isfinite(v) else (v if v is not None else 0))
        for k, v in zip(keys, row)
    }


def alert_page(db_file: str, page: int, page_size: int,
               search="", severity=None, state=None, ecosystem=None, org=None
               ) -> tuple[int, list[dict]]:
    conn = get_conn(db_file)
    where, params = where_clause(search, severity, state, ecosystem, org)
    total = conn.execute(f"SELECT count(*) FROM {TABLE} {where}", params).fetchone()[0]
    cols = display_col_sql(db_file)
    offset = (page - 1) * page_size
    df: pd.DataFrame = conn.execute(
        f"SELECT {cols} FROM {TABLE} {where} LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchdf()
    # Convert NaT / NaN / Inf to None for JSON serialisation
    return total, _clean_records(df)


def agg_severity(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "Severity", count(*) AS "count" FROM {TABLE} '
        f'GROUP BY "Severity" ORDER BY "count" DESC'
    ).fetchdf())


def agg_state(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "State", count(*) AS "count" FROM {TABLE} '
        f'GROUP BY "State" ORDER BY "count" DESC'
    ).fetchdf())


def agg_ecosystem(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "Dependency_Package_Ecosystem" AS "ecosystem", count(*) AS "count" '
        f'FROM {TABLE} GROUP BY 1 ORDER BY "count" DESC LIMIT 10'
    ).fetchdf())


def agg_org(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(f"""
        SELECT "Organization_Name" AS "org",
               count(*) AS "total",
               count(*) FILTER (WHERE "State"='open') AS "open",
               count(DISTINCT "Repository_Name") AS "repos"
        FROM {TABLE} GROUP BY 1 ORDER BY "total" DESC LIMIT 20
    """).fetchdf())


def agg_trend(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    df = conn.execute(f"""
        SELECT CAST("Created_At" AS DATE) AS "date", count(*) AS "count"
        FROM {TABLE} WHERE "Created_At" IS NOT NULL
        GROUP BY 1 ORDER BY 1
    """).fetchdf()
    df["date"] = df["date"].astype(str)
    return _clean_records(df)


def csv_export(db_file: str, search="", severity=None, state=None,
               ecosystem=None, org=None) -> bytes:
    conn = get_conn(db_file)
    where, params = where_clause(search, severity, state, ecosystem, org)
    df = conn.execute(f"SELECT * FROM {TABLE} {where}", params).fetchdf()
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()
