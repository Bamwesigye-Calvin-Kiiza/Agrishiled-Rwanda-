from django.apps import AppConfig
from django.db.models.signals import post_migrate


def create_default_officer(sender, **kwargs):
    from django.contrib.auth.models import User
    try:
        if not User.objects.filter(username='minagri_officer').exists():
            User.objects.create_user(
                username='minagri_officer',
                email='officer@minagri.gov.rw',
                password='AgriShield2026!',
                first_name='MINAGRI',
                last_name='SSIT Taskforce'
            )
            print("Successfully provisioned initial officer: minagri_officer")
    except Exception:
        pass


class AgrishieldAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'agrishield_app'

    def ready(self):
        post_migrate.connect(create_default_officer, sender=self)
