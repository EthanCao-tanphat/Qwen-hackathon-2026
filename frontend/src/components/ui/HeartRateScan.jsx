/**
 * HeartRateScan.jsx — Finger-over-camera PPG heart rate scan.
 *
 * Changes vs. previous version:
 *   - Red-channel mean is now extracted on the client per frame.
 *     We ship a compact `signal: number[]` (the PPG waveform) to the
 *     backend instead of 200 lossy JPEGs. Far faster, far more reliable,
 *     and the raw signal can be logged in devtools for debugging.
 *   - Finger detection must hold steady for `PREROLL_SECONDS` before
 *     the real capture starts — otherwise we were just collecting noise.
 *   - Torch availability is surfaced to the user. If torch is not
 *     available on mobile, the scan still runs but warns up-front.
 *   - Capture loop uses requestAnimationFrame + timestamp gating, which
 *     is much more jitter-free than setInterval at 10 FPS.
 *   - Submit is guarded so it can't fire twice.
 *   - Signal-quality check runs on the client: if variance is near zero
 *     we fail fast with a clear message instead of posting a flat line.
 *
 * Expected backend (/api/heartrate/analyze-signal):
 *   POST JSON: { signal: number[], fps: number }
 *   RESPONSE:  { bpm, zone, hrv_sdnn, confidence }
 *
 * If your current backend only accepts frames, see `LEGACY_UPLOAD_FRAMES`
 * flag below — flip it on and it will POST JPEGs the old way while we
 * migrate the backend.
 */
import { BASE } from '../../lib/api'
import { useState, useRef, useEffect, useCallback } from 'react'

// ─── Config ─────────────────────────────────────────────────────────
const SCAN_DURATION_SECONDS = 20
const PREROLL_SECONDS = 2              // finger must be detected this long before recording
const CAPTURE_FPS = 30                 // 30 FPS gives a much cleaner PPG signal than 10 FPS
const TOTAL_SAMPLES = SCAN_DURATION_SECONDS * CAPTURE_FPS
const MIN_SIGNAL_VARIANCE = 0.5        // below this the scan is basically flat — fail fast
const LEGACY_UPLOAD_FRAMES = false     // set true if backend only accepts multipart frames

export default function HeartRateScan({ language = 'en', onComplete, onSkip }) {
  const [phase, setPhase] = useState('intro') // 'intro' | 'scanning' | 'analyzing' | 'results' | 'error'
  const [progress, setProgress] = useState(0)
  const [samplesCaptured, setSamplesCaptured] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fingerDetected, setFingerDetected] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(true)
  const [prerollMs, setPrerollMs] = useState(0) // 0..PREROLL_SECONDS*1000

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)
  const signalRef = useRef([])           // PPG waveform (mean red channel per frame)
  const framesRef = useRef([])           // only populated if LEGACY_UPLOAD_FRAMES
  const rafRef = useRef(null)
  const submittedRef = useRef(false)     // guard — submit exactly once

  const lang = language === 'vi' ? 'vi' : 'en'
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // Translations
  const t = {
    en: {
      title: 'Heart Rate Scan',
      intro: isMobile
        ? 'Place your fingertip firmly over the back camera lens. Keep it still for 20 seconds.'
        : 'Place your fingertip firmly over your webcam lens. Make sure the area is well-lit.',
      tip_mobile: '💡 Tip: The camera flash will turn on automatically to illuminate your finger.',
      tip_desktop: '💡 Tip: A well-lit finger works best. Try under a bright lamp.',
      torch_warn: '⚠️ Your browser did not grant torch control. Scan will work best with a bright lamp.',
      desktop_warn: '⚠️ Webcam PPG is unreliable. For best results use a phone with flash.',
      start: 'Start Heart Rate Scan',
      skip: 'Skip for now',
      scanning: 'Scanning...',
      keep_still: 'Keep your finger still on the camera',
      no_finger: 'Move your finger to cover the camera',
      hold: 'Hold still — starting in',
      analyzing: 'Analyzing your heart rate...',
      bpm: 'BPM',
      zone: 'Zone',
      hrv: 'HRV (SDNN)',
      confidence: 'Confidence',
      continue: 'Continue to Body Scan →',
      retry: 'Try again',
      camera_error: 'Could not access camera. Please check permissions.',
      weak_signal: 'Signal too weak — finger may not be covering the camera fully.',
      skip_btn: 'Skip heart rate',
    },
    vi: {
      title: 'Quét nhịp tim',
      intro: isMobile
        ? 'Đặt đầu ngón tay lên camera sau. Giữ yên trong 20 giây.'
        : 'Đặt đầu ngón tay lên webcam. Đảm bảo khu vực có đủ ánh sáng.',
      tip_mobile: '💡 Mẹo: Đèn flash sẽ tự động bật để chiếu sáng ngón tay.',
      tip_desktop: '💡 Mẹo: Ngón tay được chiếu sáng tốt sẽ cho kết quả chính xác hơn.',
      torch_warn: '⚠️ Trình duyệt không cho phép điều khiển đèn flash. Hãy dùng đèn sáng để có kết quả tốt.',
      desktop_warn: '⚠️ Webcam cho kết quả không chính xác. Dùng điện thoại có flash để chính xác hơn.',
      start: 'Bắt đầu quét nhịp tim',
      skip: 'Bỏ qua',
      scanning: 'Đang quét...',
      keep_still: 'Giữ ngón tay yên trên camera',
      no_finger: 'Di chuyển ngón tay để che camera',
      hold: 'Giữ yên — bắt đầu trong',
      analyzing: 'Đang phân tích nhịp tim...',
      bpm: 'BPM',
      zone: 'Vùng',
      hrv: 'HRV (SDNN)',
      confidence: 'Độ tin cậy',
      continue: 'Tiếp tục quét body →',
      retry: 'Thử lại',
      camera_error: 'Không thể truy cập camera. Vui lòng kiểm tra quyền.',
      weak_signal: 'Tín hiệu quá yếu — ngón tay chưa che kín camera.',
      skip_btn: 'Bỏ qua nhịp tim',
    },
  }[lang]

  // ─── Cleanup ───────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => tr.stop())
      streamRef.current = null
    }
    trackRef.current = null
  }, [])

  useEffect(() => {
    return () => stopEverything()
  }, [stopEverything])

  // ─── Start scan ────────────────────────────────────────────────────
  const startScan = async () => {
    setError(null)
    setPhase('scanning')
    signalRef.current = []
    framesRef.current = []
    submittedRef.current = false
    setSamplesCaptured(0)
    setProgress(0)
    setPrerollMs(0)
    setFingerDetected(false)
    setTorchOn(false)
    setTorchAvailable(true)

    try {
      const constraints = {
        video: {
          facingMode: isMobile ? { ideal: 'environment' } : 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      trackRef.current = track

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Try torch (mobile only). Surface capability to the UI.
      if (isMobile) {
        try {
          const capabilities = typeof track.getCapabilities === 'function'
            ? track.getCapabilities()
            : {}
          if (capabilities.torch) {
            await track.applyConstraints({ advanced: [{ torch: true }] })
            setTorchOn(true)
            setTorchAvailable(true)
          } else {
            setTorchAvailable(false)
            console.warn('Torch not in capabilities — PPG signal will be weaker.')
          }
        } catch (e) {
          setTorchAvailable(false)
          console.warn('Torch constraint failed:', e)
        }
      }

      // Let exposure/white-balance settle before sampling.
      await new Promise(r => setTimeout(r, 500))

      startCaptureLoop()
    } catch (err) {
      console.error('Camera error:', err)
      setError(t.camera_error)
      setPhase('error')
    }
  }

  // ─── Capture loop (rAF-driven, timestamp-gated) ────────────────────
  const startCaptureLoop = () => {
    const frameInterval = 1000 / CAPTURE_FPS
    let lastSampleTs = 0
    let prerollStart = null      // timestamp when finger was first stably detected
    let recordingStart = null    // timestamp when real recording began
    let localSamples = 0

    const loop = (now) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Sample no faster than CAPTURE_FPS
      if (now - lastSampleTs < frameInterval) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      lastSampleTs = now

      canvas.width = 160
      canvas.height = 120
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Measure the *center* region — that's where a finger lives.
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const half = 30
      const imageData = ctx.getImageData(cx - half, cy - half, half * 2, half * 2)
      const data = imageData.data

      let totalR = 0, totalG = 0, totalB = 0
      const pixelCount = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        totalR += data[i]
        totalG += data[i + 1]
        totalB += data[i + 2]
      }
      const avgR = totalR / pixelCount
      const avgG = totalG / pixelCount
      const avgB = totalB / pixelCount

      // Finger heuristic: red-dominant AND not saturated AND not dark.
      const isFinger =
        avgR > 90 &&
        avgR < 250 &&
        avgR > avgG * 1.35 &&
        avgR > avgB * 1.35
      setFingerDetected(isFinger)

      // State machine: pre-roll → recording → done
      if (recordingStart === null) {
        // Pre-roll: wait for stable finger coverage
        if (isFinger) {
          if (prerollStart === null) prerollStart = now
          const heldMs = now - prerollStart
          setPrerollMs(heldMs)
          if (heldMs >= PREROLL_SECONDS * 1000) {
            recordingStart = now
            setPrerollMs(PREROLL_SECONDS * 1000)
          }
        } else {
          prerollStart = null
          setPrerollMs(0)
        }
      } else {
        // Recording: push mean red channel into the PPG signal
        signalRef.current.push(avgR)
        localSamples++
        setSamplesCaptured(localSamples)

        const elapsed = (now - recordingStart) / 1000
        setProgress(Math.min(elapsed / SCAN_DURATION_SECONDS, 1))

        // Optional: also keep JPEG blobs for legacy backend
        if (LEGACY_UPLOAD_FRAMES) {
          canvas.toBlob((blob) => {
            if (blob) framesRef.current.push(blob)
          }, 'image/jpeg', 0.85)
        }

        if (localSamples >= TOTAL_SAMPLES) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
          submitSignal()
          return
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }

  // ─── Submit PPG signal to backend ──────────────────────────────────
  const submitSignal = async () => {
    if (submittedRef.current) return
    submittedRef.current = true

    setPhase('analyzing')

    // Turn torch off, stop stream
    if (trackRef.current && torchOn) {
      try {
        await trackRef.current.applyConstraints({ advanced: [{ torch: false }] })
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => tr.stop())
    }

    const signal = signalRef.current

    // Client-side sanity check — fail fast instead of posting garbage.
    const variance = computeVariance(signal)
    console.log('[HR] samples:', signal.length, 'variance:', variance.toFixed(3),
                'first 10:', signal.slice(0, 10).map(v => v.toFixed(1)))

    if (signal.length < TOTAL_SAMPLES * 0.8 || variance < MIN_SIGNAL_VARIANCE) {
      setError(t.weak_signal)
      setPhase('error')
      return
    }

    try {
      let resp
      if (LEGACY_UPLOAD_FRAMES) {
        const formData = new FormData()
        framesRef.current.forEach((blob, i) => {
          formData.append('frames', blob, `frame_${i}.jpg`)
        })
        formData.append('fps', String(CAPTURE_FPS))
        resp = await fetch(`${BASE}/heartrate/analyze-frames`, {
          method: 'POST',
          body: formData,
        })
      } else {
        resp = await fetch(`${BASE}/heartrate/analyze-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal, fps: CAPTURE_FPS }),
        })
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Heart rate analysis failed' }))
        throw new Error(err.detail || 'Analysis failed')
      }

      const data = await resp.json()

      // Guard: if backend still returns 0, treat as weak signal rather than a valid zero BPM.
      if (!data || !data.bpm || data.bpm <= 0) {
        setError(t.weak_signal)
        setPhase('error')
        return
      }

      setResult(data)
      setPhase('results')
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.message)
      setPhase('error')
    }
  }

  // ─── Retry / finish ────────────────────────────────────────────────
  const retry = () => {
    signalRef.current = []
    framesRef.current = []
    submittedRef.current = false
    setResult(null)
    setError(null)
    setProgress(0)
    setSamplesCaptured(0)
    setPrerollMs(0)
    setFingerDetected(false)
    setPhase('intro')
  }

  const finish = () => {
    onComplete(result)
  }

  // ─── RENDER ────────────────────────────────────────────────────────

  // Intro
  if (phase === 'intro') {
    return (
      <div style={styles.container}>
        <ECGWaveform color="#ef4444" duration="1.2s" />

        <h2 style={styles.title}>{t.title}</h2>
        <p style={styles.description}>{t.intro}</p>
        <div style={styles.tipBox}>
          {isMobile ? t.tip_mobile : t.tip_desktop}
        </div>
        {!isMobile && (
          <div style={{ ...styles.tipBox, background: 'rgba(234,179,8,0.08)', color: '#facc15', borderColor: 'rgba(234,179,8,0.2)' }}>
            {t.desktop_warn}
          </div>
        )}

        <div style={styles.instructionBox}>
          <div style={styles.stepRow}>
            <div style={styles.stepNum}>1</div>
            <div>{lang === 'vi' ? 'Đặt ngón tay lên camera' : 'Place finger on camera'}</div>
          </div>
          <div style={styles.stepRow}>
            <div style={styles.stepNum}>2</div>
            <div>{lang === 'vi' ? 'Giữ yên trong 20 giây' : 'Hold still for 20 seconds'}</div>
          </div>
          <div style={styles.stepRow}>
            <div style={styles.stepNum}>3</div>
            <div>{lang === 'vi' ? 'Xem kết quả nhịp tim' : 'See your heart rate'}</div>
          </div>
        </div>

        <button style={styles.primaryBtn} onClick={startScan}>
          {t.start}
        </button>
        <button style={styles.skipBtn} onClick={onSkip}>
          {t.skip}
        </button>
      </div>
    )
  }

  // Scanning
  if (phase === 'scanning') {
    const inPreroll = samplesCaptured === 0
    const remaining = Math.max(0, Math.ceil(SCAN_DURATION_SECONDS * (1 - progress)))
    const prerollLeft = Math.max(0, Math.ceil((PREROLL_SECONDS * 1000 - prerollMs) / 1000))

    return (
      <div style={styles.container}>
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <ECGWaveform
          color={fingerDetected ? '#22c55e' : '#ef4444'}
          duration={fingerDetected ? '0.9s' : '1.8s'}
        />

        <video
          ref={videoRef}
          playsInline
          muted
          style={styles.videoPreview}
        />

        {isMobile && !torchAvailable && (
          <div style={{ ...styles.tipBox, marginBottom: 12 }}>
            {t.torch_warn}
          </div>
        )}

        <div style={styles.status}>
          {!fingerDetected
            ? t.no_finger
            : inPreroll
              ? `${t.hold} ${prerollLeft}s`
              : t.keep_still}
        </div>

        <div style={styles.progressWrap}>
          <div style={{ ...styles.progressBar, width: `${progress * 100}%` }} />
        </div>

        <div style={styles.timer}>
          {inPreroll ? `${prerollLeft}s` : `${remaining}s`}
        </div>

        <div style={styles.frameCount}>
          {samplesCaptured} / {TOTAL_SAMPLES} samples
        </div>

        <button style={styles.cancelBtn} onClick={() => { stopEverything(); setPhase('intro') }}>
          {lang === 'vi' ? 'Hủy' : 'Cancel'}
        </button>
      </div>
    )
  }

  // Analyzing
  if (phase === 'analyzing') {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
        <h2 style={styles.title}>{t.analyzing}</h2>
      </div>
    )
  }

  // Error
  if (phase === 'error') {
    return (
      <div style={styles.container}>
        <ECGWaveform color="#ef4444" duration="2s" flatline />
        <h2 style={styles.title}>{lang === 'vi' ? 'Có lỗi' : 'Something went wrong'}</h2>
        <p style={styles.description}>{error}</p>
        <button style={styles.primaryBtn} onClick={retry}>
          {t.retry}
        </button>
        <button style={styles.skipBtn} onClick={onSkip}>
          {t.skip_btn}
        </button>
      </div>
    )
  }

  // Results
  if (phase === 'results' && result) {
    const bpm = result.bpm || 0
    const zone = result.zone || 'Unknown'
    const confidence = Math.round((result.confidence || 0) * 100)
    const hrv = result.hrv_sdnn || 0

    const zoneColor = {
      'Resting': '#3b82f6',
      'Light': '#22c55e',
      'Moderate': '#eab308',
      'Vigorous': '#f97316',
      'Maximum': '#ef4444',
    }[zone] || '#6366f1'

    const pulseDuration = bpm > 0 ? `${60 / bpm}s` : '1s'

    return (
      <div style={styles.container}>
        <ECGWaveform color={zoneColor} duration={pulseDuration} />

        <div style={styles.bpmNumber}>{bpm}</div>
        <div style={styles.bpmLabel}>{t.bpm}</div>

        <div style={{ ...styles.zoneBadge, background: zoneColor }}>
          {zone}
        </div>

        <div style={styles.resultGrid}>
          <div style={styles.resultCell}>
            <div style={styles.resultValue}>{hrv.toFixed(1)}</div>
            <div style={styles.resultLabel}>{t.hrv}</div>
          </div>
          <div style={styles.resultCell}>
            <div style={styles.resultValue}>{confidence}%</div>
            <div style={styles.resultLabel}>{t.confidence}</div>
          </div>
        </div>

        <button style={styles.primaryBtn} onClick={finish}>
          {t.continue}
        </button>
        <button style={styles.skipBtn} onClick={retry}>
          {lang === 'vi' ? '↻ Quét lại' : '↻ Scan again'}
        </button>
      </div>
    )
  }

  return null
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeVariance(arr) {
  if (!arr || arr.length === 0) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const sq = arr.reduce((a, b) => a + (b - mean) ** 2, 0)
  return sq / arr.length
}

// ─── ECG Waveform Component ─────────────────────────────────────────
function ECGWaveform({ color = '#ef4444', duration = '1.2s', flatline = false }) {
  const path = flatline
    ? 'M0,30 L600,30'
    : 'M0,30 L60,30 L80,30 L90,28 L100,32 L110,30 L120,30 L130,10 L135,45 L140,20 L150,30 L170,30 L180,28 L190,32 L200,30 L260,30 L280,30 L290,28 L300,32 L310,30 L320,30 L330,10 L335,45 L340,20 L350,30 L370,30 L380,28 L390,32 L400,30 L460,30 L480,30 L490,28 L500,32 L510,30 L520,30 L530,10 L535,45 L540,20 L550,30 L570,30 L580,28 L590,32 L600,30'

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 320,
      height: 80,
      marginBottom: 20,
      overflow: 'hidden',
      borderRadius: 12,
      background: 'rgba(0,0,0,0.03)',
      border: `1px solid ${color}20`,
    }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id={`grid-${color.replace('#', '')}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={color + '15'} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${color.replace('#', '')})`} />
      </svg>

      <svg
        viewBox="0 0 600 60"
        preserveAspectRatio="none"
        width="200%"
        height="100%"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          animation: `ecgScroll ${duration} linear infinite`,
        }}
      >
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
        <path
          d={path}
          transform="translate(600, 0)"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
      </svg>

      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        transform: 'translate(-50%, -50%)',
        boxShadow: `0 0 12px ${color}`,
        animation: `pulseDot ${duration} ease-in-out infinite`,
      }} />
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '40px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heartIcon: { display: 'none' },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: 'var(--text, #fff)',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    color: 'var(--text-soft, #999)',
    lineHeight: 1.6,
    marginBottom: 16,
    maxWidth: 400,
  },
  tipBox: {
    padding: '10px 16px',
    background: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    fontSize: 13,
    color: '#f87171',
    marginBottom: 12,
    border: '1px solid rgba(239,68,68,0.15)',
  },
  instructionBox: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
    marginBottom: 32,
    padding: 20,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    textAlign: 'left',
    color: 'var(--text-soft, #ccc)',
    fontSize: 14,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #ef4444, #f87171)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  scanningHeart: { display: 'none' },
  heartPulse: { display: 'none' },
  videoPreview: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid rgba(239,68,68,0.4)',
    marginBottom: 20,
  },
  status: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-soft, #ccc)',
    marginBottom: 20,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 320,
    height: 8,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 100,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #ef4444, #f87171)',
    transition: 'width 0.2s ease',
    borderRadius: 100,
  },
  timer: {
    fontSize: 36,
    fontWeight: 900,
    fontFamily: 'monospace',
    color: 'var(--text, #fff)',
    marginBottom: 8,
  },
  frameCount: {
    fontSize: 12,
    color: 'var(--text-soft, #777)',
    fontFamily: 'monospace',
    marginBottom: 24,
  },
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid rgba(239,68,68,0.2)',
    borderTopColor: '#ef4444',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: 20,
  },
  errorIcon: { display: 'none' },
  resultHeart: { display: 'none' },
  bpmNumber: {
    fontSize: 80,
    fontWeight: 900,
    fontFamily: 'monospace',
    color: '#ef4444',
    letterSpacing: -3,
    lineHeight: 1,
    marginBottom: 4,
  },
  bpmLabel: {
    fontSize: 14,
    color: 'var(--text-soft, #999)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 20,
  },
  zoneBadge: {
    padding: '8px 24px',
    borderRadius: 100,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 28,
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    width: '100%',
    maxWidth: 360,
    marginBottom: 28,
  },
  resultCell: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 18,
  },
  resultValue: {
    fontSize: 24,
    fontWeight: 800,
    fontFamily: 'monospace',
    color: 'var(--text, #fff)',
  },
  resultLabel: {
    fontSize: 11,
    color: 'var(--text-soft, #999)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: 600,
    marginTop: 4,
  },
  primaryBtn: {
    width: '100%',
    maxWidth: 360,
    padding: '16px 24px',
    borderRadius: 100,
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: 10,
    boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
    transition: 'transform 0.2s',
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-soft, #999)',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 8,
  },
  cancelBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: 'var(--text-soft, #999)',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '8px 20px',
    marginTop: 8,
  },
}

// Inject animation keyframes once
if (typeof document !== 'undefined' && !document.getElementById('heartrate-animations')) {
  const style = document.createElement('style')
  style.id = 'heartrate-animations'
  style.textContent = `
    @keyframes ecgScroll {
      from { transform: translateX(0); }
      to { transform: translateX(-50%); }
    }
    @keyframes pulseDot {
      0%, 70%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
      35% { transform: translate(-50%, -50%) scale(1.8); opacity: 1; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(style)
}