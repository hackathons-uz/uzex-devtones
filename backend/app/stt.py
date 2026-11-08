"""Распознавание речи через UzbekVoice.ai. Ключ живет только на бэкенде, браузер шлет звук сюда.

API: POST https://uzbekvoice.ai/api/v1/stt, multipart/form-data, заголовок Authorization: <ключ>.
Ответ: {"id": ..., "result": {"text": ...}, "state": ...}.
"""

import logging
import os

import httpx

log = logging.getLogger("stt")

URL = "https://uzbekvoice.ai/api/v1/stt"
# Смешанный узбекско-русский: покупатели говорят и так, и так.
LANGUAGE = "uz-ru"
MODEL = "general"
TIMEOUT_S = 40
# Запись в браузере не длиннее 15 секунд; 10 МБ хватает с запасом.
MAX_BYTES = 10 * 1024 * 1024

EXT = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav"}


class SttError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def key_present() -> bool:
    return bool(os.environ.get("UZBEKVOICE_API_KEY"))


def transcribe(audio: bytes, content_type: str) -> str:
    key = os.environ.get("UZBEKVOICE_API_KEY")
    if not key:
        raise SttError(503, "stt_unavailable", "Голосовой ввод не настроен: нет ключа UzbekVoice. Напишите текстом.")
    if not audio:
        raise SttError(422, "empty_audio", "Запись пустая. Попробуйте еще раз.")
    if len(audio) > MAX_BYTES:
        raise SttError(413, "audio_too_large", "Запись слишком длинная. Скажите короче.")
    mime = content_type.split(";")[0].strip().lower() or "application/octet-stream"
    name = f"voice.{EXT.get(mime, 'webm')}"
    try:
        r = httpx.post(
            URL,
            headers={"Authorization": key},
            files={"file": (name, audio, mime)},
            # Запись короткая, поэтому ждем результат сразу, без опроса задачи.
            data={"return_offsets": "false", "run_diarization": "false", "language": LANGUAGE, "model": MODEL, "blocking": "true"},
            timeout=TIMEOUT_S,
        )
    except httpx.HTTPError as e:
        log.warning("UzbekVoice: нет соединения: %s", type(e).__name__)
        raise SttError(502, "stt_unreachable", "Сервис распознавания не отвечает. Попробуйте еще раз или напишите текстом.") from None
    if r.status_code >= 400:
        log.warning("UzbekVoice: HTTP %s %s", r.status_code, r.text[:300])
        raise SttError(502, "stt_failed", f"Сервис распознавания вернул ошибку {r.status_code}. Напишите текстом.")
    try:
        body = r.json()
    except ValueError:
        log.warning("UzbekVoice: ответ не JSON: %r", r.text[:300])
        raise SttError(502, "stt_bad_response", "Сервис распознавания ответил непонятно. Напишите текстом.") from None
    text = ((body.get("result") or {}).get("text") or "").strip()
    if not text:
        log.warning("UzbekVoice: пустой текст, state=%r", body.get("state"))
        raise SttError(422, "nothing_heard", "Не расслышал. Скажите еще раз, ближе к микрофону.")
    return text
