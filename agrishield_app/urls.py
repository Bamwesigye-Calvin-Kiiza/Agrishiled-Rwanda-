from django.urls import path
from . import views

app_name = 'agrishield'

urlpatterns = [
    path('', views.index_view, name='index'),
    path('api/simulate/', views.api_simulate, name='api_simulate'),
    path('api/shap/', views.api_shap, name='api_shap'),
    path('api/export-csv/', views.api_export_csv, name='api_export_csv'),
    path('api/metrics/', views.api_metrics, name='api_metrics'),
]
