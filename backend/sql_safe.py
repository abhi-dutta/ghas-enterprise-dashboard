"""
Helpers for building DuckDB SQL text safely.

All *values* are always passed as bound parameters.  The few pieces of SQL
that cannot be bound (identifiers and the WHERE skeleton) go through the
validators below so that only allowlisted / well-formed text can reach
``conn.execute``.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

_IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_QUOTED_IDENT_RE = re.compile(r'"[A-Za-z_][A-Za-z0-9_]*"')
# What may remain of a WHERE skeleton once quoted identifiers and the empty
# string literal are removed: keywords (upper-case), spaces, parens, commas,
# '?' placeholders and '='.
_WHERE_SKELETON_RE = re.compile(r"WHERE [A-Z ()?,=]+")


def table_ident(name: str) -> str:
    """Validate a (module-constant) table name and return it unquoted."""
    if not _IDENT_RE.fullmatch(name):
        raise ValueError(f"invalid table name: {name!r}")
    return name


def quote_ident(name: str, allowed: Optional[Iterable[str]] = None) -> str:
    """Return ``name`` as a double-quoted identifier.

    When ``allowed`` is given the name must be a member of it; in every case
    it must look like a plain identifier."""
    if allowed is not None and name not in allowed:
        raise ValueError(f"column not allowed: {name!r}")
    if not _IDENT_RE.fullmatch(name):
        raise ValueError(f"invalid identifier: {name!r}")
    return f'"{name}"'


def quote_ident_escaped(name: str) -> str:
    """Quote an arbitrary identifier (e.g. a CSV header) per SQL rules."""
    if "\x00" in name:
        raise ValueError("invalid identifier")
    return '"' + name.replace('"', '""') + '"'


def safe_where(where: str, params: list) -> str:
    """Return ``where`` unchanged if it is a well-formed, fully parameterised
    WHERE skeleton (no inline literals); raise ValueError otherwise."""
    if not where:
        if params:
            raise ValueError("parameters supplied without a WHERE clause")
        return ""
    skeleton = _QUOTED_IDENT_RE.sub("", where).replace("''", "")
    if not _WHERE_SKELETON_RE.fullmatch(skeleton):
        raise ValueError("unexpected content in WHERE clause")
    if where.count("?") != len(params):
        raise ValueError("placeholder / parameter count mismatch")
    return where


def compose(prefix: str, where: str, params: list, suffix: str = "") -> str:
    """Join a constant SQL prefix, a validated WHERE skeleton and a constant
    suffix into one statement."""
    parts = [prefix, safe_where(where, params)]
    if suffix:
        parts.append(suffix)
    return " ".join(p for p in parts if p)


def distinct_values_sql(table: str, col: str, allowed: Iterable[str]) -> str:
    """SELECT DISTINCT for an allowlisted column of a constant table."""
    q = quote_ident(col, allowed)
    return (
        f"SELECT DISTINCT {q} FROM {table_ident(table)} "
        f"WHERE {q} IS NOT NULL ORDER BY {q}"
    )
