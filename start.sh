#!/usr/bin/env bash
# Start both FastAPI backend and React frontend dev server
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

# ── Backend: create venv if needed, install deps, start uvicorn ────────────
echo "==> Setting up backend venv…"
if [ ! -f "$BACKEND/.venv/bin/uvicorn" ]; then
  python3 -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install -r "$BACKEND/requirements.txt" -q
fi

echo "==> Starting FastAPI backend on http://0.0.0.0:8000 …"
cd "$BACKEND"
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# ── Frontend: install deps if needed, start Vite ──────────────────────────
echo "==> Starting React frontend on http://localhost:3000 …"
cd "$FRONTEND"
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  ✅ Dashboard: http://localhost:3000"
echo "  📖 API docs:  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
