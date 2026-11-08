// Запись голоса с микрофона: MediaRecorder для звука и AnalyserNode для «волны» по настоящей громкости.

export const canRecord = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

// Chrome и Firefox пишут webm/opus, Safari — mp4/aac.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export type Recording = {
  /** Остановить и получить звук. */
  stop: () => Promise<Blob>
  /** Остановить и выбросить запись. */
  cancel: () => void
}

/** onLevel получает громкость 0..1 примерно 60 раз в секунду. */
export async function startRecording(onLevel: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)
  let raf = 0
  const tick = () => {
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += ((v - 128) / 128) ** 2
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
    raf = requestAnimationFrame(tick)
  }
  tick()
  rec.start()

  const release = () => {
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((t) => t.stop())
    ctx.close().catch(() => {})
  }
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          release()
          resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
        }
        rec.stop()
      }),
    cancel: () => {
      rec.onstop = release
      if (rec.state !== 'inactive') rec.stop()
      else release()
    },
  }
}
