#!/usr/bin/env bash
# Tao DB + user rieng cho app tren MariaDB local (chay 1 lan). Mat khau root nhap tai prompt, mat khau app lay tu server/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
echo "Se tao DB '${DB_NAME}' (+ '${DB_NAME}_test') va user '${DB_USER}' tren MariaDB local. Nhap mat khau root MariaDB:"
mysql -u root -p <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}_test\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}_test\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
MYSQL_PWD="${DB_PASSWORD}" mysql -h 127.0.0.1 -u "${DB_USER}" "${DB_NAME}" -e "SELECT 'OK: user app dang nhap duoc' AS ket_qua;"
