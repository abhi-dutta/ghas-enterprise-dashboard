"""
FastAPI backend for GHAS Dependabot Dashboard.
All heavy lifting done by DuckDB (engine.py).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import engine
import secrets_engine
import deps_engine
import timeline_engine
import auth

app = FastAPI(title="GHAS Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth routes (public) ───────────────────────────────────────────────────
app.post("/auth/login")(auth.login)
app.get("/auth/me")(auth.me)

# ── Resolve default DB file ────────────────────────────────────────────────
# CHANGED: Replaced exact filename with glob pattern to match any
# dependabot_alerts*.csv (e.g. dependabot_alerts.csv, dependabot_alerts_org1_20260311.csv)
_active_db: dict[str, str] = {}   # simple global state per-process


def _find_dependabot_csv() -> Optional[Path]:
    """Auto-discover a dependabot_alerts*.csv in the project root directory.
    If multiple files match, the first alphabetically is used."""
    root = Path(__file__).parent.parent
    matches = sorted(root.glob("dependabot_alerts*.csv"))
    return matches[0] if matches else None


def _get_db() -> str:
    db = _active_db.get("path")
    if not db or not Path(db).exists():
        # Auto-ingest the first matching CSV if one exists
        csv = _find_dependabot_csv()
        if csv and csv.exists():
            db = engine.ingest(csv)
            _active_db["path"] = db
        else:
            raise HTTPException(
                status_code=404,
                detail="No data loaded. POST /upload first."
            )
    return db


# ── Upload ─────────────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_csv(file: UploadFile = File(...), _: str = Depends(auth.require_auth)):
    """Upload a CSV file. Ingests into DuckDB and returns the db path."""
    engine.CACHE_DIR.mkdir(exist_ok=True)
    tmp = engine.CACHE_DIR / file.filename
    tmp.write_bytes(await file.read())
    db = engine.ingest(tmp)
    _active_db["path"] = db
    return {"status": "ok", "db": db}


# ── Filter options ─────────────────────────────────────────────────────────
@app.get("/filter-options")
def get_filter_options(_: str = Depends(auth.require_auth)):
    return engine.filter_options(_get_db())


@app.get("/filter-options/orgs")
def search_orgs(
    q: str = Query("", description="Search prefix for organization names"),
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(auth.require_auth),
):
    return engine.search_orgs(_get_db(), q, limit)


# ── Metrics ────────────────────────────────────────────────────────────────
@app.get("/metrics")
def get_metrics(_: str = Depends(auth.require_auth)):
    return engine.metrics(_get_db())


# ── Chart aggregations ─────────────────────────────────────────────────────
@app.get("/charts/severity")
def chart_severity(_: str = Depends(auth.require_auth)):
    return engine.agg_severity(_get_db())


@app.get("/charts/state")
def chart_state(_: str = Depends(auth.require_auth)):
    return engine.agg_state(_get_db())


@app.get("/charts/ecosystem")
def chart_ecosystem(_: str = Depends(auth.require_auth)):
    return engine.agg_ecosystem(_get_db())


@app.get("/charts/org")
def chart_org(_: str = Depends(auth.require_auth)):
    return engine.agg_org(_get_db())


@app.get("/charts/trend")
def chart_trend(_: str = Depends(auth.require_auth)):
    return engine.agg_trend(_get_db())


# ── Alerts table (paginated) ───────────────────────────────────────────────
@app.get("/alerts")
def get_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: str = Query(""),
    severity: Annotated[list[str], Query()] = [],
    state: Annotated[list[str], Query()] = [],
    ecosystem: Annotated[list[str], Query()] = [],
    org: Annotated[list[str], Query()] = [],
    _: str = Depends(auth.require_auth),
):
    total, rows = engine.alert_page(
        _get_db(), page, page_size,
        search=search,
        severity=severity or None,
        state=state or None,
        ecosystem=ecosystem or None,
        org=org or None,
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
        "rows": rows,
    }


# ── CSV export ─────────────────────────────────────────────────────────────
@app.get("/alerts/export")
def export_csv(
    search: str = Query(""),
    severity: Annotated[list[str], Query()] = [],
    state: Annotated[list[str], Query()] = [],
    ecosystem: Annotated[list[str], Query()] = [],
    org: Annotated[list[str], Query()] = [],
    _: str = Depends(auth.require_auth),
):
    data = engine.csv_export(
        _get_db(),
        search=search,
        severity=severity or None,
        state=state or None,
        ecosystem=ecosystem or None,
        org=org or None,
    )
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=dependabot_alerts.csv"},
    )


# ── Health ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ── Timeline (persistent metrics history) ──────────────────────────────────
@app.get("/timeline")
def get_timeline(
    source: Optional[str] = Query(None, description="Filter by source: 'dependabot' or 'secrets'"),
    _: str = Depends(auth.require_auth),
):
    """Return historical metrics snapshots recorded on each CSV ingestion.

    Each data point includes timestamp, source, total, open, critical, etc.
    Used to render the vulnerability trend timeline on the Overview page."""
    return timeline_engine.get_timeline(source=source)


# ── Overview (landing page) ────────────────────────────────────────────────
@app.get("/overview")
def overview(_: str = Depends(auth.require_auth)):
    """Combined risk overview across Dependabot + Secret Scanning, grouped by org."""
    dep_db = _try_get_db()
    sec_db = _try_get_secrets_db()

    dep_metrics = engine.metrics(dep_db) if dep_db else None
    sec_metrics = secrets_engine.metrics(sec_db) if sec_db else None

    # Org-level aggregation from both sources
    dep_orgs: dict[str, dict] = {}
    sec_orgs: dict[str, dict] = {}

    if dep_db:
        conn = engine.get_conn(dep_db)
        for row in conn.execute(f"""
            SELECT "Organization_Name" AS org,
                   count(*) AS total,
                   count(*) FILTER (WHERE "State"='open') AS open,
                   count(*) FILTER (WHERE "Severity"='critical') AS critical,
                   count(*) FILTER (WHERE "Severity"='high') AS high,
                   count(DISTINCT "Repository_Name") AS repos
            FROM {engine.TABLE}
            WHERE "Organization_Name" IS NOT NULL
            GROUP BY 1
        """).fetchall():
            dep_orgs[row[0]] = {
                "dep_total": row[1], "dep_open": row[2],
                "dep_critical": row[3], "dep_high": row[4], "dep_repos": row[5],
            }

    if sec_db:
        conn = secrets_engine.get_conn(sec_db)
        for row in conn.execute(f"""
            SELECT "Organization_Name" AS org,
                   count(*) AS total,
                   count(*) FILTER (WHERE "State"='open') AS open,
                   count(*) FILTER (WHERE CAST("Publicly_Leaked" AS VARCHAR) IN ('True','true')) AS leaked,
                   count(*) FILTER (WHERE CAST("Push_Protection_Bypassed" AS VARCHAR) IN ('True','true')) AS bypassed,
                   count(DISTINCT "Repository_Name") AS repos
            FROM {secrets_engine.TABLE}
            WHERE "Organization_Name" IS NOT NULL
            GROUP BY 1
        """).fetchall():
            sec_orgs[row[0]] = {
                "sec_total": row[1], "sec_open": row[2],
                "sec_leaked": row[3], "sec_bypassed": row[4], "sec_repos": row[5],
            }

    # Merge into combined org list
    all_orgs = sorted(set(dep_orgs.keys()) | set(sec_orgs.keys()))
    org_rows = []
    for org in all_orgs:
        d = dep_orgs.get(org, {})
        s = sec_orgs.get(org, {})
        dep_t = d.get("dep_total", 0)
        sec_t = s.get("sec_total", 0)
        dep_o = d.get("dep_open", 0)
        sec_o = s.get("sec_open", 0)
        org_rows.append({
            "org": org,
            "dep_total": dep_t,
            "dep_open": dep_o,
            "dep_critical": d.get("dep_critical", 0),
            "dep_high": d.get("dep_high", 0),
            "sec_total": sec_t,
            "sec_open": sec_o,
            "sec_leaked": s.get("sec_leaked", 0),
            "sec_bypassed": s.get("sec_bypassed", 0),
            "total_vulns": dep_t + sec_t,
            "total_open": dep_o + sec_o,
            "repos": max(d.get("dep_repos", 0), s.get("sec_repos", 0)),
        })
    # Sort by total_vulns descending
    org_rows.sort(key=lambda r: r["total_vulns"], reverse=True)

    return {
        "dependabot": dep_metrics,
        "secrets": sec_metrics,
        "orgs": org_rows,
    }


def _try_get_db() -> Optional[str]:
    """Like _get_db() but returns None instead of raising."""
    try:
        return _get_db()
    except HTTPException:
        return None


def _try_get_secrets_db() -> Optional[str]:
    try:
        return _get_secrets_db()
    except HTTPException:
        return None


# ═══════════════════════════════════════════════════════════════════════════
# ── SECRET SCANNING DASHBOARD ──────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════
# CHANGED: Replaced exact filename "secret_scanning.csv" with glob pattern
# to match any secret_scanning*.csv (e.g. secret_scanning.csv, secret_scanning_org1_20260311.csv)
_active_secrets_db: dict[str, str] = {}


def _find_secrets_csv() -> Optional[Path]:
    """Auto-discover a secret_scanning*.csv in the project root directory.
    If multiple files match, the first alphabetically is used."""
    root = Path(__file__).parent.parent
    matches = sorted(root.glob("secret_scanning*.csv"))
    return matches[0] if matches else None


def _get_secrets_db() -> str:
    db = _active_secrets_db.get("path")
    if not db or not Path(db).exists():
        csv = _find_secrets_csv()
        if csv and csv.exists():
            db = secrets_engine.ingest(csv)
            _active_secrets_db["path"] = db
        else:
            raise HTTPException(
                status_code=404,
                detail="No secret scanning data loaded. POST /secrets/upload first."
            )
    return db


@app.post("/secrets/upload")
async def upload_secrets_csv(file: UploadFile = File(...), _: str = Depends(auth.require_auth)):
    secrets_engine.CACHE_DIR.mkdir(exist_ok=True)
    tmp = secrets_engine.CACHE_DIR / file.filename
    tmp.write_bytes(await file.read())
    db = secrets_engine.ingest(tmp)
    _active_secrets_db["path"] = db
    return {"status": "ok", "db": db}


@app.get("/secrets/filter-options")
def secrets_filter_options(_: str = Depends(auth.require_auth)):
    return secrets_engine.filter_options(_get_secrets_db())


@app.get("/secrets/filter-options/orgs")
def secrets_search_orgs(
    q: str = Query("", description="Search prefix for organization names"),
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(auth.require_auth),
):
    return secrets_engine.search_orgs(_get_secrets_db(), q, limit)


@app.get("/secrets/metrics")
def secrets_metrics(_: str = Depends(auth.require_auth)):
    return secrets_engine.metrics(_get_secrets_db())


@app.get("/secrets/charts/secret-type")
def secrets_chart_type(_: str = Depends(auth.require_auth)):
    return secrets_engine.agg_secret_type(_get_secrets_db())


@app.get("/secrets/charts/state")
def secrets_chart_state(_: str = Depends(auth.require_auth)):
    return secrets_engine.agg_state(_get_secrets_db())


@app.get("/secrets/charts/validity")
def secrets_chart_validity(_: str = Depends(auth.require_auth)):
    return secrets_engine.agg_validity(_get_secrets_db())


@app.get("/secrets/charts/org")
def secrets_chart_org(_: str = Depends(auth.require_auth)):
    return secrets_engine.agg_org(_get_secrets_db())


@app.get("/secrets/charts/trend")
def secrets_chart_trend(_: str = Depends(auth.require_auth)):
    return secrets_engine.agg_trend(_get_secrets_db())


@app.get("/secrets/alerts")
def get_secrets_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: str = Query(""),
    secret_type: Annotated[list[str], Query()] = [],
    state: Annotated[list[str], Query()] = [],
    validity: Annotated[list[str], Query()] = [],
    org: Annotated[list[str], Query()] = [],
    _: str = Depends(auth.require_auth),
):
    total, rows = secrets_engine.alert_page(
        _get_secrets_db(), page, page_size,
        search=search,
        secret_type=secret_type or None,
        state=state or None,
        validity=validity or None,
        org=org or None,
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
        "rows": rows,
    }


@app.get("/secrets/alerts/export")
def export_secrets_csv(
    search: str = Query(""),
    secret_type: Annotated[list[str], Query()] = [],
    state: Annotated[list[str], Query()] = [],
    validity: Annotated[list[str], Query()] = [],
    org: Annotated[list[str], Query()] = [],
    _: str = Depends(auth.require_auth),
):
    data = secrets_engine.csv_export(
        _get_secrets_db(),
        search=search,
        secret_type=secret_type or None,
        state=state or None,
        validity=validity or None,
        org=org or None,
    )
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=secret_scanning_alerts.csv"},
    )


# ═══════════════════════════════════════════════════════════════════════════
# ── DEPENDENCIES DASHBOARD ─────────────────────────────────────────────────
# Routes for the GitHub Dependencies inventory dashboard.
# Auto-loads github_dependencies*.csv from the project root on first access.
# All endpoints require JWT auth and delegate to deps_engine.py for DuckDB SQL.
# ═══════════════════════════════════════════════════════════════════════════
import glob as _glob

# Tracks the active .duckdb file path for the dependencies dashboard
_active_deps_db: dict[str, str] = {}


def _find_deps_csv() -> Optional[Path]:
    """Auto-discover a github_dependencies*.csv in the project root directory."""
    root = Path(__file__).parent.parent
    matches = sorted(root.glob("github_dependencies*.csv"))
    return matches[0] if matches else None


def _get_deps_db() -> str:
    """Return the active .duckdb path, auto-ingesting the default CSV if needed."""
    db = _active_deps_db.get("path")
    if not db or not Path(db).exists():
        csv = _find_deps_csv()
        if csv and csv.exists():
            db = deps_engine.ingest(csv)
            _active_deps_db["path"] = db
        else:
            raise HTTPException(
                status_code=404,
                detail="No dependencies data loaded. POST /deps/upload first."
            )
    return db


def _try_get_deps_db() -> Optional[str]:
    """Like _get_deps_db() but returns None instead of raising on 404."""
    try:
        return _get_deps_db()
    except HTTPException:
        return None


# ── Upload ─────────────────────────────────────────────────────────────────
@app.post("/deps/upload")
async def upload_deps_csv(file: UploadFile = File(...), _: str = Depends(auth.require_auth)):
    """Upload a dependencies CSV file. Ingests into DuckDB and sets it as active."""
    deps_engine.CACHE_DIR.mkdir(exist_ok=True)
    tmp = deps_engine.CACHE_DIR / file.filename
    tmp.write_bytes(await file.read())
    db = deps_engine.ingest(tmp)
    _active_deps_db["path"] = db
    return {"status": "ok", "db": db}


# ── Filter options ─────────────────────────────────────────────────────────
@app.get("/deps/filter-options")
def deps_filter_options(_: str = Depends(auth.require_auth)):
    """Return distinct package file names and open-source values for sidebar filters."""
    return deps_engine.filter_options(_get_deps_db())


@app.get("/deps/filter-options/orgs")
def deps_search_orgs(
    q: str = Query("", description="Search prefix for organization names"),
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(auth.require_auth),
):
    """Typeahead search for organization names (ILIKE, capped at limit)."""
    return deps_engine.search_orgs(_get_deps_db(), q, limit)


@app.get("/deps/filter-options/repos")
def deps_search_repos(
    q: str = Query("", description="Search prefix for repository names"),
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(auth.require_auth),
):
    """Typeahead search for repository names (ILIKE, capped at limit)."""
    return deps_engine.search_repos(_get_deps_db(), q, limit)


# ── Metrics ────────────────────────────────────────────────────────────────
@app.get("/deps/metrics")
def deps_metrics(_: str = Depends(auth.require_auth)):
    """Return aggregate summary metrics for the dependencies dashboard."""
    return deps_engine.metrics(_get_deps_db())


# ── Chart aggregations ────────────────────────────────────────────────────
@app.get("/deps/charts/package-file")
def deps_chart_package_file(_: str = Depends(auth.require_auth)):
    """Dependency count grouped by package file (e.g. package.json, requirements.txt)."""
    return deps_engine.agg_package_file(_get_deps_db())


@app.get("/deps/charts/org")
def deps_chart_org(_: str = Depends(auth.require_auth)):
    """Top 20 organizations by total dependency count."""
    return deps_engine.agg_org(_get_deps_db())


@app.get("/deps/charts/repo")
def deps_chart_repo(_: str = Depends(auth.require_auth)):
    """Top 20 repositories by total dependency count."""
    return deps_engine.agg_repo(_get_deps_db())


@app.get("/deps/charts/top-dependencies")
def deps_chart_top_deps(_: str = Depends(auth.require_auth)):
    """Top 20 most commonly used dependencies across all repos."""
    return deps_engine.agg_top_dependencies(_get_deps_db())


@app.get("/deps/charts/open-source")
def deps_chart_open_source(_: str = Depends(auth.require_auth)):
    """Open source vs non-open source dependency breakdown."""
    return deps_engine.agg_open_source(_get_deps_db())


# ── Dependencies table (paginated) ────────────────────────────────────────
@app.get("/deps/list")
def get_deps_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: str = Query(""),
    org: Annotated[list[str], Query()] = [],
    repo: Annotated[list[str], Query()] = [],
    package_file: Annotated[list[str], Query()] = [],
    is_open_source: Optional[str] = Query(None),
    _: str = Depends(auth.require_auth),
):
    """Server-side paginated dependency list with filter support.

    Only the requested page of rows is returned (LIMIT/OFFSET in DuckDB).
    """
    total, rows = deps_engine.deps_page(
        _get_deps_db(), page, page_size,
        search=search,
        org=org or None,
        repo=repo or None,
        package_file=package_file or None,
        is_open_source=is_open_source,
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
        "rows": rows,
    }


# ── CSV export ─────────────────────────────────────────────────────────────
@app.get("/deps/list/export")
def export_deps_csv(
    search: str = Query(""),
    org: Annotated[list[str], Query()] = [],
    repo: Annotated[list[str], Query()] = [],
    package_file: Annotated[list[str], Query()] = [],
    is_open_source: Optional[str] = Query(None),
    _: str = Depends(auth.require_auth),
):
    data = deps_engine.csv_export(
        _get_deps_db(),
        search=search,
        org=org or None,
        repo=repo or None,
        package_file=package_file or None,
        is_open_source=is_open_source,
    )
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=github_dependencies.csv"},
    )
