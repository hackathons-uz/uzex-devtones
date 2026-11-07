"""Точка входа Vercel: FastAPI из backend/ под префиксом /api.

Фронтенд ходит на /api/..., а роуты бэкенда без префикса — поэтому монтируем приложение под /api.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi import FastAPI  # noqa: E402

from app.main import app as backend  # noqa: E402

app = FastAPI(title="Биржа доверия — Vercel")
app.mount("/api", backend)
