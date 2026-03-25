"""
DuckDB engine for GHAS Secret Scanning dashboard.
Mirrors engine.py architecture: one-time CSV → DuckDB, all queries pure SQL.
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
TABLE = "secret_scanning_alerts"

DATE_COLS = ["Created_At", "Updated_At", "Resolved_At"]

DISPLAY_COLS = [
    "Alert_Number", "Organization_Name", "Repository_Name",
    "Secret_Type", "State", "Validity", "Resolution",
    "Push_Protection_Bypassed", "Publicly_Leaked",
    "Location_Path", "Created_At", "URL",
]

# ── Thread-local connections ───────────────────────────────────────────────
_local = threading.local()
_lock = threading.Lock()
_col_cache: dict[str, list[str]] = {}


def get_conn(db_file: str) -> duckdb.DuckDBPyConnection:
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
    for old in CACHE_DIR.glob("secret_scanning*.duckdb"):
        if old.resolve() != keep.resolve():
            try:
                old.unlink()
                with _lock:
                    _col_cache.pop(str(old), None)
            except OSError:
                pass


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
                timeline_engine.record_snapshot("secrets", _fingerprint(csv_path), m)
            except Exception:
                pass
            return str(db)

    conn = duckdb.connect(str(db))
    try:
        # Use pandas for CSV reading to avoid DuckDB's sniffing issues,
        # then register the DataFrame as a DuckDB table.
        df = pd.read_csv(str(csv_path), dtype=str, keep_default_na=False)
        conn.execute(f"CREATE TABLE {TABLE} AS SELECT * FROM df")
        existing = _col_set(conn)
        # Replace empty strings with NULL (pandas read everything as str)
        for col in existing:
            try:
                conn.execute(f'UPDATE {TABLE} SET "{col}" = NULL WHERE "{col}" = \'\'')
            except Exception:
                pass
        # Cast numeric columns from VARCHAR
        for col in ["Alert_Number", "Location_Start_Line", "Location_End_Line",
                     "Location_Start_Column", "Location_End_Column"]:
            if col in existing:
                try:
                    conn.execute(f"""
                        ALTER TABLE {TABLE}
                        ALTER COLUMN "{col}"
                        SET DATA TYPE BIGINT
                        USING TRY_CAST("{col}" AS BIGINT)
                    """)
                except Exception:
                    pass
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
        for col in ["Secret_Type", "State", "Validity", "Resolution",
                     "Organization_Name", "Repository_Name"]:
            if col in existing:
                conn.execute(
                    f'CREATE INDEX IF NOT EXISTS idx_ss_{col.lower().replace(" ","_")} '
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
        timeline_engine.record_snapshot("secrets", _fingerprint(csv_path), m)
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


# ── JSON-safe serialisation ───────────────────────────────────────────────
def _clean_records(df: pd.DataFrame) -> list[dict]:
    df = df.where(df.notna(), other=None)
    df = df.replace([float("inf"), float("-inf")], None)
    records = df.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if isinstance(v, float) and not math.isfinite(v):
                row[k] = None
            elif hasattr(v, "item"):
                row[k] = v.item()
    return records


# ── WHERE builder ──────────────────────────────────────────────────────────
def where_clause(
    search: str = "",
    secret_type: Optional[list[str]] = None,
    state: Optional[list[str]] = None,
    validity: Optional[list[str]] = None,
    org: Optional[list[str]] = None,
) -> tuple[str, list]:
    clauses, params = [], []
    if secret_type:
        clauses.append(f'"Secret_Type" IN ({",".join(["?"]*len(secret_type))})')
        params.extend(secret_type)
    if state:
        clauses.append(f'"State" IN ({",".join(["?"]*len(state))})')
        params.extend(state)
    if validity:
        clauses.append(f'"Validity" IN ({",".join(["?"]*len(validity))})')
        params.extend(validity)
    if org:
        clauses.append(f'"Organization_Name" IN ({",".join(["?"]*len(org))})')
        params.extend(org)
    if search:
        t = f"%{search}%"
        clauses.append(
            '(COALESCE("Secret_Type",\'\') ILIKE ? '
            'OR COALESCE("Repository_Name",\'\') ILIKE ? '
            'OR COALESCE("Location_Path",\'\') ILIKE ? '
            'OR COALESCE("Organization_Name",\'\') ILIKE ?)'
        )
        params.extend([t] * 4)
    return ("WHERE " + " AND ".join(clauses)) if clauses else "", params


# ── Query functions ────────────────────────────────────────────────────────
def filter_options(db_file: str) -> dict:
    conn = get_conn(db_file)
    result = {}
    for key, col in [
        ("secret_types", "Secret_Type"),
        ("states", "State"),
        ("validities", "Validity"),
    ]:
        rows = conn.execute(
            f'SELECT DISTINCT "{col}" FROM {TABLE} WHERE "{col}" IS NOT NULL ORDER BY "{col}"'
        ).fetchall()
        result[key] = [str(r[0]) for r in rows]
    return result


def search_orgs(db_file: str, q: str = "", limit: int = 50) -> list[str]:
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
            count(*) FILTER (WHERE "State"='resolved'),
            count(*) FILTER (WHERE "Validity"='active'),
            count(*) FILTER (WHERE "Validity"='inactive'),
            count(*) FILTER (WHERE "Validity"='unknown'),
            count(*) FILTER (WHERE CAST("Push_Protection_Bypassed" AS VARCHAR)='True'
                              OR CAST("Push_Protection_Bypassed" AS VARCHAR)='true'),
            count(*) FILTER (WHERE CAST("Publicly_Leaked" AS VARCHAR)='True'
                              OR CAST("Publicly_Leaked" AS VARCHAR)='true'),
            count(DISTINCT "Secret_Type"),
            count(DISTINCT "Repository_Name"),
            count(DISTINCT "Organization_Name")
        FROM {TABLE}
    """).fetchone()
    keys = ["total", "open", "resolved", "active", "inactive", "unknown",
            "push_bypassed", "publicly_leaked", "secret_types", "repos", "orgs"]
    return {
        k: (None if isinstance(v, float) and not math.isfinite(v) else (v if v is not None else 0))
        for k, v in zip(keys, row)
    }


def alert_page(db_file: str, page: int, page_size: int,
               search="", secret_type=None, state=None, validity=None, org=None
               ) -> tuple[int, list[dict]]:
    conn = get_conn(db_file)
    where, params = where_clause(search, secret_type, state, validity, org)
    total = conn.execute(f"SELECT count(*) FROM {TABLE} {where}", params).fetchone()[0]
    cols = display_col_sql(db_file)
    offset = (page - 1) * page_size
    df: pd.DataFrame = conn.execute(
        f"SELECT {cols} FROM {TABLE} {where} LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchdf()
    return total, _clean_records(df)


def agg_secret_type(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "Secret_Type", count(*) AS "count" FROM {TABLE} '
        f'GROUP BY "Secret_Type" ORDER BY "count" DESC LIMIT 15'
    ).fetchdf())


def agg_state(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "State", count(*) AS "count" FROM {TABLE} '
        f'GROUP BY "State" ORDER BY "count" DESC'
    ).fetchdf())


def agg_validity(db_file: str) -> list[dict]:
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "Validity", count(*) AS "count" FROM {TABLE} '
        f'WHERE "Validity" IS NOT NULL '
        f'GROUP BY "Validity" ORDER BY "count" DESC'
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


def csv_export(db_file: str, search="", secret_type=None, state=None,
               validity=None, org=None) -> bytes:
    conn = get_conn(db_file)
    where, params = where_clause(search, secret_type, state, validity, org)
    df = conn.execute(f"SELECT * FROM {TABLE} {where}", params).fetchdf()
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()
