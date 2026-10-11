#!/bin/bash
# deploy.sh
# Docker Build, Push, and Automated Remote Deploy Script
# Specifically configured for AgriShield Rwanda on Ubuntu Linux target server

# --- Ensure Docker and common binaries are in PATH on macOS ---
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# --- Colors for Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Configuration ---
IMAGE_BASE_NAME="bamwesigyecalvinkiiza/agrishield"
CONTAINER_NAME="agrishield"
HOST_PORT="${HOST_PORT:-8004}" # Port 8002 & 8003 are already occupied on the server; default to 8004
CONTAINER_PORT="8000"
SERVER_HOST="173.208.162.233"
SERVER_USER="administrator" # Change if SSH user differs (e.g., ubuntu or root)
REMOTE_ENV_FILE=".env.agrishield" # Dedicated env file to avoid collisions with other projects

# --- Versioning Logic ---
get_next_version() {
    # Send informational messages to stderr so they aren't captured by $(get_next_version)
    echo -e "${CYAN}Fetching latest version from local images...${NC}" >&2
    
    # Get all tags that look like v1.0 or 1.0
    tags=$(docker images --format "{{.Tag}}" "$IMAGE_BASE_NAME" | grep -E '^v?[0-9]+\.[0-9]+$')

    if [ -n "$tags" ]; then
        # Remove 'v', sort numerically by major and minor, take the last one
        latest=$(echo "$tags" | sed 's/^v//' | sort -t. -k1,1n -k2,2n | tail -1)
        major=$(echo "$latest" | cut -d. -f1)
        minor=$(echo "$latest" | cut -d. -f2)
        echo "v${major}.$((minor + 1))"
    else
        echo -e "${YELLOW}Could not determine latest version, starting from v1.0${NC}" >&2
        echo "v1.0"
    fi
}

# --- Helper Functions ---
# Runs a command with a timeout in seconds
run_with_timeout() {
    local timeout_secs=$1
    shift
    # Run command in background
    "$@" &
    local cmd_pid=$!
    
    # Start a watcher process in background
    (
        sleep "$timeout_secs"
        kill -0 "$cmd_pid" 2>/dev/null && kill "$cmd_pid" 2>/dev/null
    ) &
    local watcher_pid=$!
    
    # Wait for the command to finish
    wait "$cmd_pid" 2>/dev/null
    local exit_status=$?
    
    # Kill the watcher process
    kill "$watcher_pid" 2>/dev/null
    wait "$watcher_pid" 2>/dev/null
    
    return $exit_status
}

# --- Check if Docker Daemon is Running ---
if ! run_with_timeout 3 docker info >/dev/null 2>&1; then
    echo -e "${RED}Error: Docker daemon is not running or not responding.${NC}"
    echo -e "${YELLOW}Please start Docker Desktop on your Mac and try again.${NC}"
    exit 1
fi

# --- Version Argument ---
VERSION="$1"

if [ -z "$VERSION" ]; then
    VERSION=$(get_next_version)
    echo -e "Auto-detected next version: ${GREEN}$VERSION${NC}"
else
    # Ensure version starts with 'v'
    [[ "$VERSION" != v* ]] && VERSION="v$VERSION"
fi

FULL_IMAGE_NAME="${IMAGE_BASE_NAME}:${VERSION}"
LATEST_IMAGE_NAME="${IMAGE_BASE_NAME}:latest"

echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}AgriShield Rwanda: Docker Build & Deploy${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "Image:     ${GREEN}$FULL_IMAGE_NAME${NC}"
echo -e "Container: ${GREEN}$CONTAINER_NAME${NC}"
echo -e "Port:      ${GREEN}${HOST_PORT}:${CONTAINER_PORT}${NC}"
echo -e "Server:    ${GREEN}${SERVER_USER}@${SERVER_HOST}${NC}"
echo -e "${CYAN}========================================${NC}\n"

# Step 1: Build
echo -e "${YELLOW}[1/4] Building Docker image locally (AMD64 Linux)...${NC}"
docker build --platform linux/amd64 -t "$FULL_IMAGE_NAME" -t "$LATEST_IMAGE_NAME" .
if [ $? -ne 0 ]; then 
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Build successful!${NC}"

# Step 2: Push
echo -e "\n${YELLOW}[2/4] Pushing to Docker Hub...${NC}"
docker push "$FULL_IMAGE_NAME"
if [ $? -ne 0 ]; then 
    echo -e "${RED}Push failed! Try running 'docker login' first.${NC}"
    exit 1
fi
docker push "$LATEST_IMAGE_NAME"
echo -e "${GREEN}Push successful!${NC}"

# Step 3: Server Prep
echo -e "\n${YELLOW}[3/4] Preparing server configuration...${NC}"
if [ -f ".env" ]; then
    echo -e "${CYAN}Sanitizing and uploading .env to remote server as ${REMOTE_ENV_FILE}...${NC}"
    # Clean whitespace around equals signs and trailing spaces for Docker compatibility
    TEMP_ENV=$(mktemp)
    sed -E 's/^[[:space:]]*//; s/[[:space:]]*=[[:space:]]*/=/; s/[[:space:]]*$//' ".env" > "$TEMP_ENV"
    scp "$TEMP_ENV" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_ENV_FILE}"
    SCP_STATUS=$?
    rm -f "$TEMP_ENV"
    if [ $SCP_STATUS -ne 0 ]; then
        echo -e "${RED}Failed to upload .env file! Check SSH connectivity and credentials.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Warning: Local .env file not found, creating placeholder on remote server...${NC}"
    ssh "${SERVER_USER}@${SERVER_HOST}" "touch ${REMOTE_ENV_FILE}"
fi

# Step 4: Remote Deploy
echo -e "\n${YELLOW}[4/4] Executing remote deployment...${NC}"

# Pull latest image, stop/remove existing container, run container, apply migrations
SSH_COMMANDS="docker pull $LATEST_IMAGE_NAME && \
  docker rm -f $CONTAINER_NAME 2>/dev/null || true && \
  docker run -d --restart always \
    -p ${HOST_PORT}:${CONTAINER_PORT} \
    -v agrishield_data:/app/data \
    -v agrishield_db:/app/db_persist \
    --name $CONTAINER_NAME \
    --env-file ${REMOTE_ENV_FILE} \
    $LATEST_IMAGE_NAME && \
  docker exec $CONTAINER_NAME python manage.py migrate --noinput && \
  docker ps --filter name=$CONTAINER_NAME"

ssh "${SERVER_USER}@${SERVER_HOST}" "$SSH_COMMANDS"

if [ $? -ne 0 ]; then
    echo -e "${RED}Remote deployment command failed!${NC}"
    exit 1
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}AgriShield Rwanda Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Version:   $VERSION"
echo -e "Access at: ${CYAN}http://${SERVER_HOST}:${HOST_PORT}${NC}"
