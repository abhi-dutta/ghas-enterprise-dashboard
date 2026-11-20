# Security

Security rules for this repository. Marked blocks are maintained by Harness remediation. Text outside those blocks is left as written.


<!-- harness-remediation:sec-sql-safe-helpers -->
### sec-sql-safe-helpers — Build SQL through backend/sql_safe.py

Table and column names are validated or allowlisted with the sql_safe helpers, and WHERE text must be a fully parameterised skeleton. Values, LIMIT and OFFSET stay bound as ? parameters; new queries should not interpolate request-derived text with f-strings.
<!-- /harness-remediation -->

<!-- harness-remediation:sec-secure-random -->
### sec-secure-random — Use secrets.SystemRandom for random values

Scripts in this repo draw random values from secrets.SystemRandom rather than the module-level random generator. Only use a seeded generator when reproducibility is explicitly required, and keep it away from anything security-relevant.
<!-- /harness-remediation -->
