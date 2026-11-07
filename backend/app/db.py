"""Подключение к SQLite и схема по разделу «Модель данных» PRD v3."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

# На Vercel файловая система только для чтения, писать можно лишь в /tmp.
_DEFAULT_DB = Path("/tmp/data.db") if os.environ.get("VERCEL") else Path(__file__).resolve().parent.parent / "data.db"
DB_PATH = Path(os.environ.get("DB_PATH", _DEFAULT_DB))

SCHEMA = """
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','both')),
  region TEXT NOT NULL,
  parent_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS rating_snapshots (
  participant_id TEXT PRIMARY KEY REFERENCES participants(id),
  value INTEGER NOT NULL,
  components TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deal_history (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES participants(id),
  seller_id TEXT NOT NULL REFERENCES participants(id),
  amount_uzs INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','default','dispute_lost')),
  paid_on_time INTEGER NOT NULL,
  delivered_on_time INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES participants(id),
  product TEXT NOT NULL,
  grade TEXT NOT NULL,
  volume_t INTEGER NOT NULL,
  price_per_t INTEGER NOT NULL,
  region TEXT NOT NULL,
  deadline TEXT NOT NULL,
  pool_allowed INTEGER NOT NULL,
  min_fill_pct INTEGER NOT NULL,
  rules_json TEXT NOT NULL,
  rules_text TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES participants(id),
  lot_id TEXT NOT NULL REFERENCES lots(id),
  qty_t INTEGER NOT NULL,
  region TEXT NOT NULL,
  deadline TEXT NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('deposit','insurance')),
  guarantor_id TEXT REFERENCES participants(id),
  bid_price_per_t INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES lots(id),
  status TEXT NOT NULL CHECK (status IN ('proposed','confirming','locked','closed','failed')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pool_members (
  pool_id TEXT NOT NULL REFERENCES pools(id),
  request_id TEXT NOT NULL REFERENCES requests(id),
  share_t INTEGER NOT NULL,
  deposit_uzs INTEGER NOT NULL,
  confirmed_at TEXT,
  PRIMARY KEY (pool_id, request_id)
);
CREATE TABLE IF NOT EXISTS guarantees (
  id TEXT PRIMARY KEY,
  guarantor_id TEXT NOT NULL REFERENCES participants(id),
  beneficiary_id TEXT NOT NULL REFERENCES participants(id),
  status TEXT NOT NULL CHECK (status IN ('active','closed'))
);
CREATE TABLE IF NOT EXISTS decisions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('admission','deposit','risk','pool','rule_parse')),
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  explanation TEXT,
  source TEXT NOT NULL CHECK (source IN ('formula','ai','template')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS region_distance (
  region_a TEXT NOT NULL,
  region_b TEXT NOT NULL,
  km INTEGER NOT NULL,
  PRIMARY KEY (region_a, region_b)
);
"""

# Таблицы с данными демо, которые сбрасывает seed. Кэш Claude лежит в отдельном файле (ai.py).
DEMO_TABLES = [
    "decisions_log",
    "pool_members",
    "pools",
    "guarantees",
    "requests",
    "lots",
    "deal_history",
    "rating_snapshots",
    "participants",
    "region_distance",
]


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path or DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def session(path: Path | str | None = None):
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)


def log_decision(
    conn: sqlite3.Connection,
    entity_type: str,
    entity_id: str,
    kind: str,
    input_obj,
    output_obj,
    explanation: str | None,
    source: str,
) -> None:
    """Пишет решение в журнал. Одинаковое решение подряд не дублирует."""
    inp, out = dumps(input_obj), dumps(output_obj)
    last = conn.execute(
        "SELECT input_json, output_json, explanation FROM decisions_log "
        "WHERE entity_type=? AND entity_id=? AND kind=? ORDER BY id DESC LIMIT 1",
        (entity_type, entity_id, kind),
    ).fetchone()
    if last and last["input_json"] == inp and last["output_json"] == out and last["explanation"] == explanation:
        return
    conn.execute(
        "INSERT INTO decisions_log (entity_type, entity_id, kind, input_json, output_json, explanation, source, created_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (entity_type, entity_id, kind, inp, out, explanation, source, now_iso()),
    )
