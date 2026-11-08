"""SQLite: схема и подключение. Состояние демо живет здесь, расчеты — в formulas.py."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).resolve().parent.parent / "data.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS business (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  city TEXT NOT NULL,
  clean_deals INTEGER NOT NULL,
  tax_clean_years INTEGER NOT NULL,
  business_years INTEGER NOT NULL,
  stable_turnover INTEGER NOT NULL,
  late_payments TEXT NOT NULL,      -- JSON: даты ISO
  past_prices TEXT NOT NULL         -- JSON: цены прошлых закупок муки, сум/кг
);
CREATE TABLE IF NOT EXISTS pool (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  grade TEXT NOT NULL,
  city TEXT NOT NULL,
  title TEXT NOT NULL,
  audience TEXT NOT NULL,
  lot_t INTEGER NOT NULL,
  lot_unit TEXT NOT NULL,
  deadline TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  hub TEXT NOT NULL,
  avg_exchange_uzs INTEGER NOT NULL,
  avg_month TEXT NOT NULL,
  retail_uzs INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('collecting','filled'))
);
CREATE TABLE IF NOT EXISTS pool_member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id TEXT NOT NULL REFERENCES pool(id),
  business_id TEXT,                  -- наш покупатель; у остальных NULL
  name TEXT NOT NULL,
  members INTEGER NOT NULL DEFAULT 1, -- сколько покупателей в строке
  qty_t REAL NOT NULL,
  deposit_uzs INTEGER,
  joined_seq INTEGER,                -- порядок вступления, для кольца пула
  status TEXT NOT NULL CHECK (status IN ('joined','queued'))
);
CREATE TABLE IF NOT EXISTS seller (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pool(id),
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  rating REAL NOT NULL,
  on_time_pct INTEGER NOT NULL,
  disputes_12m INTEGER NOT NULL,
  linked_to_buyers INTEGER NOT NULL,
  bids TEXT NOT NULL                 -- JSON: ставки по раундам, null — вышел
);
CREATE TABLE IF NOT EXISTS deal (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pool(id),
  business_id TEXT NOT NULL REFERENCES business(id),
  seller_id TEXT NOT NULL REFERENCES seller(id),
  qty_kg INTEGER NOT NULL,
  price_uzs INTEGER NOT NULL,
  deposit_uzs INTEGER NOT NULL,
  stage INTEGER NOT NULL,            -- индекс текущего шага 0..4; 5 — все шаги пройдены
  status TEXT NOT NULL CHECK (status IN ('active','dispute','arbiter','settled')),
  refund_uzs INTEGER NOT NULL DEFAULT 0,
  rating_before INTEGER,
  rating_after INTEGER
);
CREATE TABLE IF NOT EXISTS evidence (
  pool_id TEXT PRIMARY KEY REFERENCES pool(id),
  waybill_kg INTEGER NOT NULL,
  received_kg INTEGER NOT NULL,
  photos INTEGER NOT NULL,
  certificate_ok INTEGER NOT NULL,
  confirmed_others INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL
);
"""


def connect(path: str | Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def session():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False, sort_keys=True)


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def log(conn: sqlite3.Connection, kind: str, payload: dict) -> None:
    conn.execute("INSERT INTO log (at, kind, payload) VALUES (?,?,?)", (now_iso(), kind, dumps(payload)))
