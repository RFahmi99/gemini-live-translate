#!/usr/bin/env bash
# Seed env files (idempotent) and install both halves' dependencies.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "→ Created .env.local — fill in your LiveKit credentials"
fi

if [[ ! -f translator/.env.local ]]; then
  cp translator/.env.example translator/.env.local
  echo "→ Created translator/.env.local — fill in your LiveKit + Gemini credentials"
fi

echo "→ Installing frontend deps (pnpm)…"
pnpm install

echo "→ Installing agent deps (uv sync)…"
(cd translator && uv sync)

cat <<'EOF'

✓ Setup complete.

Next steps:
  1. Edit .env.local and translator/.env.local with your credentials.
  2. Run: pnpm run dev

EOF
