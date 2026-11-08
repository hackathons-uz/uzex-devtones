import os
import tempfile
from pathlib import Path

# До импорта приложения: отдельная база и кэш, Claude выключен — проверяем шаблоны.
_tmp = Path(tempfile.mkdtemp())
os.environ["DB_PATH"] = str(_tmp / "test.db")
os.environ["AI_CACHE_PATH"] = str(_tmp / "ai_cache.db")
os.environ["AI_DISABLED"] = "1"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        assert c.post("/demo/reset").status_code == 200
        yield c
