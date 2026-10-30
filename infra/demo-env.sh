#!/usr/bin/env sh
# Writes .env for compose.demo.yaml with distinct random secrets. Non-production demo only.
# Usage (from the repository root): sh infra/demo-env.sh demo.example.com
set -eu
domain=${1:-}
case "$domain" in
  ''|*://*|*/*|*:*) echo "Usage: sh infra/demo-env.sh <hostname>   (hostname only, e.g. demo.example.com)" >&2; exit 2;;
esac
if [ -e .env ]; then echo ".env already exists; refusing to replace its secrets" >&2; exit 1; fi
umask 077
seed=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-20)
cat > .env <<EOF
APP_DOMAIN=$domain
POSTGRES_PASSWORD=$(openssl rand -hex 24)
RUNTIME_DATABASE_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
OTP_SECRET=$(openssl rand -hex 32)
MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)
SEED_PASSWORD=$seed
EOF
echo "Wrote .env for https://$domain"
echo "Demo sign-in password for <role>@cargoorbit.test: $seed"
