from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpRequest, HttpResponse


def spa_index(request: HttpRequest) -> HttpResponse:
    """Serve the React SPA shell for non-API routes."""
    index_path = Path(settings.BASE_DIR) / "frontend" / "dist" / "index.html"
    if not index_path.exists():
        return HttpResponse(
            "Frontend not built. Run `npm install && npm run build` in frontend/.",
            status=503,
            content_type="text/plain",
        )
    return FileResponse(index_path.open("rb"), content_type="text/html")
