from django.urls import path
from . import views

app_name = 'agrishield'

urlpatterns = [
    path('', views.landing_view, name='landing'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('dashboard/', views.index_view, name='index'),
    path('api/simulate/', views.api_simulate, name='api_simulate'),
    path('api/shap/', views.api_shap, name='api_shap'),
    path('api/export-csv/', views.api_export_csv, name='api_export_csv'),
    path('api/metrics/', views.api_metrics, name='api_metrics'),
    path('api/chatbot/', views.api_chatbot, name='api_chatbot'),
    path('robots.txt', views.robots_txt_view, name='robots_txt'),
    path('sitemap.xml', views.sitemap_xml_view, name='sitemap_xml'),
]
