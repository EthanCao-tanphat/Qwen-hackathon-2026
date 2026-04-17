/**
 * Healix API client
 * All endpoints proxy through Vite → FastAPI at localhost:8000
 */

const BASE = '/api'

export async function analyzeLabs(files, language = 'auto') {
  const form = new FormData()
  const fileList = Array.isArray(files) ? files : [files]
  form.append('file', fileList[0])
  form.append('language', language)

  const res = await fetch(`${BASE}/labs/analyze`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Labs API error: ${res.status}`)
  return res.json()
}

export async function transcribeAudio(audio, language = 'auto') {
  const form = new FormData()
  form.append('audio', audio)
  form.append('language', language)

  const res = await fetch(`${BASE}/scribe/transcribe`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Scribe API error: ${res.status}`)
  return res.json()
}

export async function analyzeBody(frontImage, sideImage, heightCm, weightKg, gender = 'male', age = 25) {
  const form = new FormData()
  form.append('front_image', frontImage)
  if (sideImage) form.append('side_image', sideImage)
  form.append('height_cm', String(heightCm))
  form.append('weight_kg', String(weightKg))
  form.append('gender', gender)
  form.append('age', String(age))

  const res = await fetch(`${BASE}/bodyscan/analyze`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`BodyScan API error: ${res.status}`)
  return res.json()
}

export async function evaluatePhoto(imageBlob, photoType = 'front') {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.jpg')
  form.append('photo_type', photoType)

  const res = await fetch(`${BASE}/bodyscan/evaluate-photo`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Photo evaluation failed')
  return res.json()
}

export async function healthCheck() {
  const res = await fetch('/health')
  return res.json()
}