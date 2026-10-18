"""
Django settings for agrishield_project project.
"""

from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / '.env')
except ImportError:
    pass

SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-glecfj_w4d9q=-ful1obuz7@oo00sir+d2@g&+-(_9at$tai4l')
DEBUG = os.getenv('DEBUG', 'True') == 'True'

# Allowed Hosts (domains, subdomains, server IPs)
allowed_hosts_env = os.getenv('ALLOWED_HOSTS')
if allowed_hosts_env:
    ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_env.split(',') if h.strip()]
else:
    ALLOWED_HOSTS = [
        'agrishieldrw.com',
        'www.agrishieldrw.com',
        '.agrishieldrw.com',
        '173.208.162.233',
        'localhost',
        '127.0.0.1',
        '*',
    ]

# CSRF Trusted Origins (required for HTTP and HTTPS form submissions & API calls)
csrf_origins_env = os.getenv('CSRF_TRUSTED_ORIGINS')
if csrf_origins_env:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in csrf_origins_env.split(',') if o.strip()]
else:
    CSRF_TRUSTED_ORIGINS = [
        'http://agrishieldrw.com',
        'https://agrishieldrw.com',
        'http://www.agrishieldrw.com',
        'https://www.agrishieldrw.com',
        'http://173.208.162.233',
        'http://173.208.162.233:8004',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
    ]

# Detect HTTPS when requests are reverse-proxied by Nginx
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'agrishield_app',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

try:
    import whitenoise
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
except ImportError:
    pass

ROOT_URLCONF = 'agrishield_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'agrishield_app' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'agrishield_project.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Kigali'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'agrishield_app' / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGIN_URL = 'agrishield:login'
LOGIN_REDIRECT_URL = 'agrishield:index'
LOGOUT_REDIRECT_URL = 'agrishield:landing'
