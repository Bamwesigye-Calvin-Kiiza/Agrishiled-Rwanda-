# Dockerfile for AgriShield Rwanda Django Platform
FROM python:3.11-slim

# Prevent Python from writing bytecode and enable immediate log streaming
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install minimal OS dependencies needed for compiling packages and healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code and dataset assets
COPY . /app/

# Collect static files for production serving
RUN python manage.py collectstatic --noinput

# Expose Django port
EXPOSE 8000

# Start production server with Gunicorn WSGI
CMD ["gunicorn", "agrishield_project.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
