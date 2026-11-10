#!/usr/bin/env bash
# ==============================================================================
# EMS Intelligence — Automated AWS EC2 Deployment Script
# Target OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting EMS Intelligence Automated AWS EC2 Provisioning"
echo "=========================================================="

APP_DIR="/var/www/ems"
APP_USER="ubuntu"
DB_NAME="ems_intelligence"
DB_USER="ems_user"
DB_PASS="StrongSecurePassword2026!" # Change in production!
DOMAIN="ems.yourdomain.com"          # Change to your domain or EC2 Public IP

# 1. Update OS packages
echo "[1/7] Updating system packages..."
sudo apt update -y && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv git nginx certbot python3-certbot-nginx postgresql postgresql-contrib libpq-dev curl htop

# 2. Configure PostgreSQL Database
echo "[2/7] Configuring PostgreSQL database and credentials..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

# 3. Setup Application Directory & Virtualenv
echo "[3/7] Setting up application workspace at ${APP_DIR}..."
sudo mkdir -p ${APP_DIR}
sudo chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

if [ ! -d "${APP_DIR}/venv" ]; then
    python3 -m venv ${APP_DIR}/venv
fi

# 4. Install Dependencies
echo "[4/7] Installing Python dependencies..."
${APP_DIR}/venv/bin/pip install --upgrade pip
if [ -f "${APP_DIR}/requirements.txt" ]; then
    ${APP_DIR}/venv/bin/pip install -r ${APP_DIR}/requirements.txt
else
    ${APP_DIR}/venv/bin/pip install fastapi uvicorn[standard] openpyxl pandas sqlalchemy psycopg2-binary bcrypt PyJWT pydantic-settings python-multipart
fi

# 5. Setup Environment Configuration & Run Migrations
echo "[5/7] Initializing environment and database schema..."
if [ ! -f "${APP_DIR}/.env" ]; then
    cat <<EOF > ${APP_DIR}/.env
PROJECT_NAME="EMS Intelligence — Energy Management System"
VERSION="1.0.0"
SECRET_KEY="$(openssl rand -hex 32)"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=720
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
MAX_UPLOAD_SIZE_BYTES=52428800
EOF
fi

# Run Database Seeder
cd ${APP_DIR}
${APP_DIR}/venv/bin/python -m backend.app.seed

# 6. Setup Systemd Service
echo "[6/7] Enabling and starting Systemd service..."
sudo cp ${APP_DIR}/deploy/ems.service /etc/systemd/system/ems.service
sudo systemctl daemon-reload
sudo systemctl enable ems
sudo systemctl restart ems

# 7. Configure Nginx Reverse Proxy (Isolated without touching other sites)
echo "[7/7] Configuring Nginx reverse proxy for EMS..."
sudo cp ${APP_DIR}/deploy/nginx.conf /etc/nginx/sites-available/ems
sudo ln -sf /etc/nginx/sites-available/ems /etc/nginx/sites-enabled/ems
sudo nginx -t
sudo systemctl reload nginx

echo "=========================================================="
echo " EMS Intelligence Successfully Deployed to AWS EC2!"
echo " Live Service: http://${DOMAIN}"
echo " Default Admin User: admin / AdminPassword2026!"
echo "=========================================================="
