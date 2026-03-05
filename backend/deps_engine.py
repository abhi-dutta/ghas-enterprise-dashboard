"""
DuckDB engine for GitHub Dependencies dashboard.
Mirrors engine.py / secrets_engine.py architecture:
  one-time CSV → DuckDB ingestion, all queries pure SQL.

CSV columns: org_name, repo_name, package_name, dependency_name, is_open_source

This module provides:
  - CSV ingestion with DuckDB caching (fingerprinted by file name, size, mtime)
  - Thread-safe database connections via threading.local()
  - Parameterised SQL filters for org, repo, package file, open-source status
  - Full-text ILIKE search across all columns
  - Aggregation queries for charts (package files, orgs, repos, top deps, open source)
  - Server-side LIMIT/OFFSET pagination for the table view
  - CSV export with the same filter support
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

# ── Constants ──────────────────────────────────────────────────────────────
# Cache directory for ingested .duckdb files (auto-created, gitignored)
CACHE_DIR = Path(__file__).parent / ".cache"
# DuckDB table name used for all queries
TABLE = "github_dependencies"

# Columns shown in the paginated table view
DISPLAY_COLS = [
    "org_name", "repo_name", "package_name",
    "dependency_name", "is_open_source",
]

# ── Thread-local connections ───────────────────────────────────────────────
# Each FastAPI worker thread gets its own DuckDB connection so concurrent
# requests never share state (DuckDB is not thread-safe with shared conns).
_local = threading.local()
_lock = threading.Lock()
# Maps db_file path → list of valid display column names (warmed on first access)
_col_cache: dict[str, list[str]] = {}


def get_conn(db_file: str) -> duckdb.DuckDBPyConnection:
    """Return a per-thread read-only DuckDB connection for the given db file.

    If the cached connection is stale (e.g. file was replaced), it is
    discarded and a fresh one is created."""
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
    """Generate a short hash from filename + size + mtime to detect changes.

    Two uploads of the same file with identical content produce the same
    fingerprint and reuse the cached .duckdb, avoiding redundant ingestion."""
    s = p.stat()
    return hashlib.md5(f"{p.name}-{s.st_size}-{s.st_mtime_ns}".encode()).hexdigest()[:12]


def db_path_for(csv_path: Path) -> Path:
    """Compute the .duckdb cache path for a given CSV file."""
    return CACHE_DIR / f"{csv_path.stem}_{_fingerprint(csv_path)}.duckdb"


def _cleanup_old_dbs(keep: Path) -> None:
    """Delete all github_dependencies*.duckdb files except the one we just created.

    This prevents stale cache files from accumulating on disk when a new
    CSV is uploaded or the same file changes content."""
    for old in CACHE_DIR.glob("github_dependencies*.duckdb"):
        if old.resolve() != keep.resolve():
            try:
                old.unlink()
                with _lock:
                    _col_cache.pop(str(old), None)
            except OSError:
                pass


def ingest(csv_path: Path) -> str:
    """Ingest a GitHub Dependencies CSV into DuckDB.

    Steps:
      1. Check if a cached .duckdb already exists (fingerprint match)
      2. If cached and valid, return its path immediately (skip ingestion)
      3. Otherwise, read CSV via pandas (all-varchar to avoid type sniffing issues)
      4. Create the DuckDB table, replace empty strings with NULL
      5. Build indexes on frequently-filtered columns for fast queries
      6. Warm the column cache and clean up old .duckdb files

    Returns:
        Path to the .duckdb file (string).
    """
    CACHE_DIR.mkdir(exist_ok=True)
    db = db_path_for(csv_path)
    if db.exists():
        # Verify the cached DB actually contains our table
        try:
            conn = duckdb.connect(str(db), read_only=True)
            conn.execute(f"SELECT 1 FROM {TABLE} LIMIT 1")
            conn.close()
        except Exception:
            # Stale or corrupt cache — delete and re-ingest below
            db.unlink(missing_ok=True)
        else:
            _warm_col_cache(db)
            _cleanup_old_dbs(keep=db)
            return str(db)

    # Fresh ingestion: read CSV with pandas, then load into DuckDB
    conn = duckdb.connect(str(db))
    try:
        # Read everything as string to avoid DuckDB's CSV type-sniffing issues
        df = pd.read_csv(str(csv_path), dtype=str, keep_default_na=False)
        conn.execute(f"CREATE TABLE {TABLE} AS SELECT * FROM df")
        existing = _col_set(conn)

        # Replace empty strings with NULL for cleaner queries
        for col in existing:
            try:
                conn.execute(f'UPDATE {TABLE} SET "{col}" = NULL WHERE "{col}" = \'\'')
            except Exception:
                pass

        # Create indexes on columns used in WHERE / GROUP BY for fast filtering
        for col in ["org_name", "repo_name", "package_name", "dependency_name", "is_open_source"]:
            if col in existing:
                conn.execute(
                    f'CREATE INDEX IF NOT EXISTS idx_deps_{col.lower().replace(" ","_")} '
                    f'ON {TABLE} ("{col}")'
                )
    finally:
        conn.close()

    _warm_col_cache(db)
    _cleanup_old_dbs(keep=db)
    return str(db)


def _col_set(conn) -> set[str]:
    """Return the set of column names for the dependencies table."""
    return {r[0] for r in conn.execute(
        f"SELECT column_name FROM information_schema.columns WHERE table_name='{TABLE}'"
    ).fetchall()}


def _warm_col_cache(db: Path):
    """Pre-load the list of valid display columns for the given .duckdb file.

    This avoids querying information_schema on every paginated request."""
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
    """Build a quoted, comma-separated SQL column list for SELECT statements.

    Uses the cached column list to only select columns that actually exist
    in the ingested table (handles CSVs with varying schemas gracefully)."""
    cols = _col_cache.get(db_file)
    if not cols:
        _warm_col_cache(Path(db_file))
        cols = _col_cache.get(db_file, [])
    return ", ".join(f'"{c}"' for c in cols) if cols else "*"


# ── JSON-safe serialisation ───────────────────────────────────────────────
def _clean_records(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to JSON-safe list of dicts.

    Handles NaN, NaT, Inf, -Inf, and numpy scalar types that would
    otherwise cause json.dumps to fail or produce invalid JSON."""
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
    org: Optional[list[str]] = None,
    repo: Optional[list[str]] = None,
    package_file: Optional[list[str]] = None,
    is_open_source: Optional[str] = None,
) -> tuple[str, list]:
    """Build a parameterised SQL WHERE clause from the active filters.

    Args:
        search:         Free-text ILIKE search across dependency, repo, package, org
        org:            Filter by exact organization name(s)
        repo:           Filter by exact repository name(s)
        package_file:   Filter by package file name(s) (e.g. 'package.json')
        is_open_source: Filter by open source status ('true' or 'false')

    Returns:
        Tuple of (WHERE clause string, list of parameter values).
        Returns ("", []) if no filters are active.
    """
    clauses, params = [], []
    if org:
        clauses.append(f'"org_name" IN ({",".join(["?"]*len(org))})')
        params.extend(org)
    if repo:
        clauses.append(f'"repo_name" IN ({",".join(["?"]*len(repo))})')
        params.extend(repo)
    if package_file:
        clauses.append(f'"package_name" IN ({",".join(["?"]*len(package_file))})')
        params.extend(package_file)
    if is_open_source is not None:
        clauses.append('"is_open_source" = ?')
        params.append(is_open_source)
    if search:
        t = f"%{search}%"
        clauses.append(
            '(COALESCE("dependency_name",\'\') ILIKE ? '
            'OR COALESCE("repo_name",\'\') ILIKE ? '
            'OR COALESCE("package_name",\'\') ILIKE ? '
            'OR COALESCE("org_name",\'\') ILIKE ?)'
        )
        params.extend([t] * 4)
    return ("WHERE " + " AND ".join(clauses)) if clauses else "", params


# ── Query functions ────────────────────────────────────────────────────────

def filter_options(db_file: str) -> dict:
    """Return distinct values for sidebar filter dropdowns.

    Returns dict with keys: package_files, is_open_source — each a sorted list."""
    conn = get_conn(db_file)
    result = {}
    for key, col in [
        ("package_files", "package_name"),
        ("is_open_source", "is_open_source"),
    ]:
        rows = conn.execute(
            f'SELECT DISTINCT "{col}" FROM {TABLE} WHERE "{col}" IS NOT NULL ORDER BY "{col}"'
        ).fetchall()
        result[key] = [str(r[0]) for r in rows]
    return result


def search_orgs(db_file: str, q: str = "", limit: int = 50) -> list[str]:
    """Typeahead search for organization names via ILIKE.

    Returns up to `limit` distinct org names matching the query substring.
    If q is empty, returns the first `limit` orgs alphabetically."""
    conn = get_conn(db_file)
    if q.strip():
        rows = conn.execute(
            f'SELECT DISTINCT "org_name" FROM {TABLE} '
            f'WHERE "org_name" IS NOT NULL '
            f'AND "org_name" ILIKE ? '
            f'ORDER BY "org_name" LIMIT ?',
            [f"%{q}%", limit],
        ).fetchall()
    else:
        rows = conn.execute(
            f'SELECT DISTINCT "org_name" FROM {TABLE} '
            f'WHERE "org_name" IS NOT NULL '
            f'ORDER BY "org_name" LIMIT ?',
            [limit],
        ).fetchall()
    return [str(r[0]) for r in rows]


def search_repos(db_file: str, q: str = "", limit: int = 50) -> list[str]:
    """Typeahead search for repository names via ILIKE.

    Returns up to `limit` distinct repo names matching the query substring.
    If q is empty, returns the first `limit` repos alphabetically."""
    conn = get_conn(db_file)
    if q.strip():
        rows = conn.execute(
            f'SELECT DISTINCT "repo_name" FROM {TABLE} '
            f'WHERE "repo_name" IS NOT NULL '
            f'AND "repo_name" ILIKE ? '
            f'ORDER BY "repo_name" LIMIT ?',
            [f"%{q}%", limit],
        ).fetchall()
    else:
        rows = conn.execute(
            f'SELECT DISTINCT "repo_name" FROM {TABLE} '
            f'WHERE "repo_name" IS NOT NULL '
            f'ORDER BY "repo_name" LIMIT ?',
            [limit],
        ).fetchall()
    return [str(r[0]) for r in rows]


def metrics(db_file: str) -> dict:
    """Compute summary metrics for the dependencies dashboard.

    Returns a dict with:
        total_entries, unique_dependencies, repos, orgs,
        package_files, open_source, not_open_source

    All values are integers; NaN/None are coerced to 0."""
    conn = get_conn(db_file)
    row = conn.execute(f"""
        SELECT
            count(*),
            count(DISTINCT "dependency_name"),
            count(DISTINCT "repo_name"),
            count(DISTINCT "org_name"),
            count(DISTINCT "package_name"),
            count(*) FILTER (WHERE LOWER("is_open_source") = 'true'),
            count(*) FILTER (WHERE LOWER("is_open_source") != 'true')
        FROM {TABLE}
    """).fetchone()
    keys = [
        "total_entries", "unique_dependencies", "repos", "orgs",
        "package_files", "open_source", "not_open_source",
    ]
    return {
        k: (None if isinstance(v, float) and not math.isfinite(v) else (v if v is not None else 0))
        for k, v in zip(keys, row)
    }


def deps_page(db_file: str, page: int, page_size: int,
              search="", org=None, repo=None, package_file=None,
              is_open_source=None) -> tuple[int, list[dict]]:
    """Server-side paginated query for the dependencies table.

    Only the requested page of rows is fetched from DuckDB (LIMIT/OFFSET),
    so the browser never receives more than page_size rows.

    Returns:
        Tuple of (total matching row count, list of row dicts for current page)."""
    conn = get_conn(db_file)
    where, params = where_clause(search, org, repo, package_file, is_open_source)
    total = conn.execute(f"SELECT count(*) FROM {TABLE} {where}", params).fetchone()[0]
    cols = display_col_sql(db_file)
    offset = (page - 1) * page_size
    df: pd.DataFrame = conn.execute(
        f"SELECT {cols} FROM {TABLE} {where} ORDER BY \"org_name\", \"repo_name\", \"dependency_name\" LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchdf()
    return total, _clean_records(df)


# ── Chart aggregation queries ──────────────────────────────────────────────
def agg_package_file(db_file: str) -> list[dict]:
    """Count of dependencies grouped by package file (e.g. package.json, requirements.txt).

    Returns top 15 package files ordered by count descending."""
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT "package_name" AS "package_file", count(*) AS "count" '
        f'FROM {TABLE} GROUP BY 1 ORDER BY "count" DESC LIMIT 15'
    ).fetchdf())


def agg_org(db_file: str) -> list[dict]:
    """Top 20 organizations by total dependency count.

    Returns: org, total_deps, unique_deps, repos per org."""
    conn = get_conn(db_file)
    return _clean_records(conn.execute(f"""
        SELECT "org_name" AS "org",
               count(*) AS "total_deps",
               count(DISTINCT "dependency_name") AS "unique_deps",
               count(DISTINCT "repo_name") AS "repos"
        FROM {TABLE} GROUP BY 1 ORDER BY "total_deps" DESC LIMIT 20
    """).fetchdf())


def agg_repo(db_file: str) -> list[dict]:
    """Top 20 repositories by total dependency count.

    Returns: repo, org, total_deps, unique_deps per repo."""
    conn = get_conn(db_file)
    return _clean_records(conn.execute(f"""
        SELECT "repo_name" AS "repo",
               "org_name" AS "org",
               count(*) AS "total_deps",
               count(DISTINCT "dependency_name") AS "unique_deps"
        FROM {TABLE} GROUP BY 1, 2 ORDER BY "total_deps" DESC LIMIT 20
    """).fetchdf())


def agg_top_dependencies(db_file: str) -> list[dict]:
    """Top 20 most common dependencies across all repos.

    Returns: dependency name, repo_count (how many repo×package_file entries
    use it), and distinct repos count."""
    conn = get_conn(db_file)
    return _clean_records(conn.execute(f"""
        SELECT "dependency_name" AS "dependency",
               count(*) AS "repo_count",
               count(DISTINCT "repo_name") AS "repos"
        FROM {TABLE} GROUP BY 1 ORDER BY "repo_count" DESC LIMIT 20
    """).fetchdf())


def agg_open_source(db_file: str) -> list[dict]:
    """Open source vs non-open source breakdown.

    Returns two rows: 'Open Source' and 'Not Open Source' with counts."""
    conn = get_conn(db_file)
    return _clean_records(conn.execute(
        f'SELECT CASE WHEN LOWER("is_open_source") = \'true\' THEN \'Open Source\' '
        f'ELSE \'Not Open Source\' END AS "category", count(*) AS "count" '
        f'FROM {TABLE} GROUP BY 1 ORDER BY "count" DESC'
    ).fetchdf())


# ── Export ─────────────────────────────────────────────────────────────────
def csv_export(db_file: str, search="", org=None, repo=None,
               package_file=None, is_open_source=None) -> bytes:
    """Export filtered dependencies as a CSV byte string.

    Applies the same filters as deps_page() but returns ALL matching rows
    (no pagination). Used by the /deps/list/export endpoint."""
    conn = get_conn(db_file)
    where, params = where_clause(search, org, repo, package_file, is_open_source)
    df = conn.execute(f"SELECT * FROM {TABLE} {where}", params).fetchdf()
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()
