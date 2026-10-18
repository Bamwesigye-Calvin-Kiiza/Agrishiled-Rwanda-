#!/bin/bash
# setup_nginx.sh
# Automated Nginx Configuration for agrishieldrw.com on Remote Server
# This does NOT affect any existing sites running on Nginx.

SERVER_USER="administrator"
SERVER_HOST="173.208.162.233"
HOST_PORT="8004"
DOMAIN="agrishieldrw.com"
WWW_DOMAIN="www.agrishieldrw.com"

echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;36mConfiguring Nginx on $SERVER_HOST for $DOMAIN\033[0m"
echo -e "\033[0;36m========================================\033[0m"

# Remote Nginx config creation and reload
ssh -t "${SERVER_USER}@${SERVER_HOST}" "bash -s" << REMOTE_SCRIPT
set -e

echo "[1/4] Creating Nginx configuration for $DOMAIN..."
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << 'EOF'
server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$HOST_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }
}
EOF

# Substitute domain and port variables
sudo sed -i "s/\\\$DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
sudo sed -i "s/\\\$WWW_DOMAIN/$WWW_DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
sudo sed -i "s/\\\$HOST_PORT/$HOST_PORT/g" /etc/nginx/sites-available/$DOMAIN

echo "[2/4] Enabling site..."
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

echo "[3/4] Testing Nginx configuration syntax..."
sudo nginx -t

echo "[4/4] Reloading Nginx (zero downtime)..."
sudo systemctl reload nginx

echo ""
echo "Nginx successfully configured for http://$DOMAIN and http://$WWW_DOMAIN!"
echo "To enable HTTPS with SSL, run on the server:"
echo "sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
REMOTE_SCRIPT
