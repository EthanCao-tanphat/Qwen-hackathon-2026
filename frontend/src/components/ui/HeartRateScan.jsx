/**
 * HeartRateScan.jsx — Finger-over-camera PPG heart rate scan.
 *
 * Flow:
 *   1. Instructions screen
 *   2. Camera opens, enables torch if mobile
 *   3. User places finger over camera
 *   4. ~20 seconds of frame capture (10fps = 200 frames)
 *   5. Frames sent to /api/heartrate/analyze-frames
 *   6. Results shown (BPM, HRV, zone)
 */

import { useState, useRef, useEffect, useCallback } from 'react'

const SCAN_DURATION_SECONDS = 20
const CAPTURE_FPS = 10
const TOTAL_FRAMES = SCAN_DURATION_SECONDS * CAPTURE_FPS

export default function HeartRateScan({ language = 'en', onComplete, onSkip }) {
  const [phase, setPhase] = useState('intro') // 'intro' | 'scanning' | 'analyzing' | 'results' | 'error'
  const [progress, setProgress] = useState(0)
  const [framesCaptured, setFramesCaptured] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fingerDetected, setFingerDetected] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)
  const framesRef = useRef([])
  const intervalRef = useRef(null)
  const progressRef = useRef(null)

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
      start: 'Start Heart Rate Scan',
      skip: 'Skip for now',
      scanning: 'Scanning...',
      keep_still: 'Keep your finger still on the camera',
      no_finger: 'Move your finger to cover the camera',
      analyzing: 'Analyzing your heart rate...',
      bpm: 'BPM',
      zone: 'Zone',
      hrv: 'HRV (SDNN)',
      confidence: 'Confidence',
      continue: 'Continue to Body Scan →',
      retry: 'Try again',
      camera_error: 'Could not access camera. Please check permissions.',
      skip_btn: 'Skip heart rate',
    },
    vi: {
      title: 'Quét nhịp tim',
      intro: isMobile
        ? 'Đặt đầu ngón tay lên camera sau. Giữ yên trong 20 giây.'
        : 'Đặt đầu ngón tay lên webcam. Đảm bảo khu vực có đủ ánh sáng.',
      tip_mobile: '💡 Mẹo: Đèn flash sẽ tự động bật để chiếu sáng ngón tay.',
      tip_desktop: '💡 Mẹo: Ngón tay được chiếu sáng tốt sẽ cho kết quả chính xác hơn.',
      start: 'Bắt đầu quét nhịp tim',
      skip: 'Bỏ qua',
      scanning: 'Đang quét...',
      keep_still: 'Giữ ngón tay yên trên camera',
      no_finger: 'Di chuyển ngón tay để che camera',
      analyzing: 'Đang phân tích nhịp tim...',
      bpm: 'BPM',
      zone: 'Vùng',
      hrv: 'HRV (SDNN)',
      confidence: 'Độ tin cậy',
      continue: 'Tiếp tục quét body →',
      retry: 'Thử lại',
      camera_error: 'Không thể truy cập camera. Vui lòng kiểm tra quyền.',
      skip_btn: 'Bỏ qua nhịp tim',
    },
  }[lang]

  // Cleanup
  const stopEverything = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (progressRef.current) clearInterval(progressRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    trackRef.current = null
  }, [])

  useEffect(() => {
    return () => stopEverything()
  }, [stopEverything])

  // Start scan
  const startScan = async () => {
    setError(null)
    setPhase('scanning')
    framesRef.current = []
    setFramesCaptured(0)
    setProgress(0)

    try {
      // Request camera with torch capability
      const constraints = {
        video: {
          facingMode: isMobile ? { ideal: 'environment' } : 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
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

      // Try to turn on torch (mobile only)
      if (isMobile) {
        try {
          const capabilities = track.getCapabilities()
          if (capabilities.torch) {
            await track.applyConstraints({ advanced: [{ torch: true }] })
            setTorchOn(true)
          }
        } catch (e) {
          console.log('Torch not supported:', e)
        }
      }

      // Wait a moment for camera to stabilize
      await new Promise(r => setTimeout(r, 500))

      // Start capturing frames
      startFrameCapture()

    } catch (err) {
      console.error('Camera error:', err)
      setError(t.camera_error)
      setPhase('error')
    }
  }

  // Capture frames at 10 FPS
  const startFrameCapture = () => {
    const captureInterval = 1000 / CAPTURE_FPS // 100ms
    let frameCount = 0
    const startTime = Date.now()

    // Progress update (every 100ms)
    progressRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000
      setProgress(Math.min(elapsed / SCAN_DURATION_SECONDS, 1))
    }, 100)

    // Frame capture
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

      canvas.width = 320  // small size - we just need red channel
      canvas.height = 240
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Quick finger detection - check if red channel is dominant
      const imageData = ctx.getImageData(canvas.width/2 - 20, canvas.height/2 - 20, 40, 40)
      let totalR = 0, totalG = 0, totalB = 0
      for (let i = 0; i < imageData.data.length; i += 4) {
        totalR += imageData.data[i]
        totalG += imageData.data[i + 1]
        totalB += imageData.data[i + 2]
      }
      const avgR = totalR / (imageData.data.length / 4)
      const avgG = totalG / (imageData.data.length / 4)
      const avgB = totalB / (imageData.data.length / 4)
      const isFinger = avgR > 80 && avgR > avgG * 1.5 && avgR > avgB * 1.5
      setFingerDetected(isFinger)

      // Grab frame as blob
      canvas.toBlob((blob) => {
        if (blob) {
          framesRef.current.push(blob)
          frameCount++
          setFramesCaptured(frameCount)

          // Done?
          if (frameCount >= TOTAL_FRAMES) {
            clearInterval(intervalRef.current)
            clearInterval(progressRef.current)
            submitFrames()
          }
        }
      }, 'image/jpeg', 0.7)

    }, captureInterval)
  }

  // Submit frames to backend
  const submitFrames = async () => {
    setPhase('analyzing')

    // Turn off torch & stop camera
    if (trackRef.current && torchOn) {
      try {
        await trackRef.current.applyConstraints({ advanced: [{ torch: false }] })
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }

    try {
      const formData = new FormData()
      framesRef.current.forEach((blob, i) => {
        formData.append('frames', blob, `frame_${i}.jpg`)
      })
      formData.append('fps', String(CAPTURE_FPS))

      const resp = await fetch('/api/heartrate/analyze-frames', {
        method: 'POST',
        body: formData,
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Heart rate analysis failed' }))
        throw new Error(err.detail || 'Analysis failed')
      }

      const data = await resp.json()
      setResult(data)
      setPhase('results')

    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.message)
      setPhase('error')
    }
  }

  // Retry
  const retry = () => {
    framesRef.current = []
    setResult(null)
    setError(null)
    setProgress(0)
    setFramesCaptured(0)
    setPhase('intro')
  }

  // Finish
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
    const remaining = Math.max(0, Math.ceil(SCAN_DURATION_SECONDS * (1 - progress)))
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

        <div style={styles.status}>
          {fingerDetected ? t.keep_still : t.no_finger}
        </div>

        <div style={styles.progressWrap}>
          <div style={{ ...styles.progressBar, width: `${progress * 100}%` }} />
        </div>

        <div style={styles.timer}>
          {remaining}s
        </div>

        <div style={styles.frameCount}>
          {framesCaptured} / {TOTAL_FRAMES} frames
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

    // Pulse duration based on BPM (60000ms / bpm)
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

// ─── ECG Waveform Component ─────────────────────────────────────────
// Animated ECG/EKG waveform SVG - scrolls left to right with realistic PQRST complex
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
      {/* Grid background */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id={`grid-${color.replace('#', '')}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={color + '15'} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${color.replace('#', '')})`} />
      </svg>

      {/* ECG line - two copies scroll together for seamless loop */}
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

      {/* Center indicator dot */}
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

  // Intro
  heartIcon: {
    display: 'none', // deprecated — replaced by ECGWaveform component
  },
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
    marginBottom: 24,
    border: '1px solid rgba(239,68,68,0.15)',
  },
  instructionBox: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
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

  // Scanning
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

  // Analyzing
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid rgba(239,68,68,0.2)',
    borderTopColor: '#ef4444',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: 20,
  },

  // Error
  errorIcon: { display: 'none' },

  // Results
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

  // Buttons
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