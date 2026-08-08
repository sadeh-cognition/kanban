"""
URL configuration for config project.
"""

from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.http import HttpRequest, HttpResponse
from django.urls import path, re_path
from django.views.static import serve

from kanban_app.api import api
from kanban_app.views import spa_index

DIST_DIR = Path(settings.BASE_DIR) / "frontend" / "dist"


def dist_asset(request: HttpRequest, path: str) -> HttpResponse:
    return serve(request, path, document_root=str(DIST_DIR / "assets"))


def dist_favicon(request: HttpRequest) -> HttpResponse:
    return serve(request, "favicon.svg", document_root=str(DIST_DIR))


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
    path("assets/<path:path>", dist_asset),
    path("favicon.svg", dist_favicon),
    re_path(r"^(?!api/|admin/).*$", spa_index),
]
