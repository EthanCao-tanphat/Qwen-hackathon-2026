/**
 * GuidedCapture.jsx — AI-powered body photo capture with real-time voice guidance.
 *
 * Two modes:
 *   1. Tripod mode — back camera + voice assistant guides user until perfect shot
 *   2. Upload mode — pick photos from gallery
 *
 * Flow (Tripod):
 *   Camera opens → voice guides distance, pose, angle, lighting, clothing
 *   → auto-captures when ready → switches to side photo → auto-captures → done
 */

import { useState, useRef, useEffect, useCallback } from 'react'

// ─── Voice Guidance Config ──────────────────────────────────────────────────
const VOICE_MESSAGES = {
  en: {
    starting: "Point your camera towards yourself. I'll guide you.",
    starting_desktop: "Stand in front of your webcam, about 2 meters back. I'll guide you.",
    full_body_visible: "I can't see your full body. Step back a little.",
    proper_distance: "Adjust your distance — about 2 to 3 meters works best.",
    lighting: "It's a bit dark. Turn on a light or move somewhere brighter.",
    pose_front: "Stand straight with arms slightly away from your body, feet shoulder-width apart.",
    pose_side: "Stand sideways with arms relaxed at your sides. Show your profile clearly.",
    camera_level: "The phone seems tilted. Try to keep it straight, at waist height.",
    clear_background: "There's some clutter behind you. A plain wall works best.",
    centered: "Move a little to the center of the frame.",
    clothing_fit: "Your clothes look quite loose. Tighter clothing gives more accurate measurements.",
    tilt_up: "Tilt the phone back slightly — it's pointing too low.",
    tilt_down: "Tilt the phone forward slightly — it's pointing too high.",
    almost: "Almost there. Just a small adjustment.",
    hold_still: "Perfect. Hold still.",
    captured_front: "Front photo captured! Now turn 90 degrees to your right for the side photo.",
    captured_side: "Side photo captured. Great job!",
    bail_out: "Having trouble? You can tap the capture button to take the photo manually, or switch to upload mode.",
    camera_error: "Could not access the camera. Please check permissions or use upload mode.",
  },
  vi: {
    starting: "Hướng camera về phía bạn. Tôi sẽ hướng dẫn bạn.",
    starting_desktop: "Đứng trước webcam, cách khoảng 2 mét. Tôi sẽ hướng dẫn bạn.",
    full_body_visible: "Tôi chưa thấy toàn thân bạn. Lùi lại một chút.",
    proper_distance: "Điều chỉnh khoảng cách — khoảng 2 đến 3 mét là tốt nhất.",
    lighting: "Hơi tối. Bật đèn hoặc di chuyển đến chỗ sáng hơn.",
    pose_front: "Đứng thẳng, hai tay hơi xa người, chân rộng bằng vai.",
    pose_side: "Đứng nghiêng, tay thả lỏng hai bên. Cho tôi thấy rõ mặt bên.",
    camera_level: "Điện thoại có vẻ bị nghiêng. Giữ thẳng ở ngang hông.",
    clear_background: "Phía sau hơi lộn xộn. Bức tường trống là tốt nhất.",
    centered: "Di chuyển vào giữa khung hình.",
    clothing_fit: "Quần áo hơi rộng. Mặc đồ ôm sát hơn để đo chính xác hơn.",
    tilt_up: "Nghiêng điện thoại ra sau — đang chỉ quá thấp.",
    tilt_down: "Nghiêng điện thoại về phía trước — đang chỉ quá cao.",
    almost: "Gần được rồi. Chỉnh thêm một chút nữa.",
    hold_still: "Tuyệt vời. Đứng yên nhé.",
    captured_front: "Đã chụp ảnh trước! Xoay 90 độ sang phải để chụp ảnh bên.",
    captured_side: "Đã chụp ảnh bên. Tuyệt vời!",
    bail_out: "Gặp khó khăn? Bạn có thể nhấn nút chụp để chụp thủ công, hoặc chuyển sang tải ảnh lên.",
    camera_error: "Không thể truy cập camera. Kiểm tra quyền truy cập hoặc tải ảnh lên.",
  },
}

// Priority order for fixing issues (most critical first)
const FIX_PRIORITY = [
  'full_body_visible',
  'proper_distance',
  'camera_level',
  'lighting',
  'pose',
  'centered',
  'clear_background',
  'clothing_fit',
]

// ─── Voice Engine ───────────────────────────────────────────────────────────
class VoiceGuide {
  constructor(lang = 'en') {
    this.lang = lang
    this.speaking = false
    this.lastMessage = ''
    this.enabled = true
  }

  setLang(lang) {
    this.lang = lang === 'vi' ? 'vi' : 'en'
  }

  speak(messageKey, force = false) {
    if (!this.enabled) return
    if (!window.speechSynthesis) return

    const messages = VOICE_MESSAGES[this.lang] || VOICE_MESSAGES.en
    const text = messages[messageKey]
    if (!text) return

    // Don't repeat the same message unless forced
    if (text === this.lastMessage && !force) return
    this.lastMessage = text

    // Cancel any current speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = this.lang === 'vi' ? 'vi-VN' : 'en-US'
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices()
    const langPrefix = this.lang === 'vi' ? 'vi' : 'en'
    const matchingVoice = voices.find(v => v.lang.startsWith(langPrefix))
    if (matchingVoice) utterance.voice = matchingVoice

    utterance.onstart = () => { this.speaking = true }
    utterance.onend = () => { this.speaking = false }
    utterance.onerror = () => { this.speaking = false }

    window.speechSynthesis.speak(utterance)
  }

  speakCustom(text) {
    if (!this.enabled || !window.speechSynthesis || !text) return
    if (text === this.lastMessage) return
    this.lastMessage = text

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = this.lang === 'vi' ? 'vi-VN' : 'en-US'
    utterance.rate = 0.95
    window.speechSynthesis.speak(utterance)
  }

  stop() {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    this.speaking = false
    this.lastMessage = ''
  }

  toggle() {
    this.enabled = !this.enabled
    if (!this.enabled) this.stop()
    return this.enabled
  }
}


// ─── Main Component ─────────────────────────────────────────────────────────
export default function GuidedCapture({ language = 'en', onCapture, onCancel }) {
  // onCapture(frontFile, sideFile) — called with captured photos
  // onCancel() — called when user cancels

  const [mode, setMode] = useState(null) // null = selector, 'tripod', 'upload'
  const [phase, setPhase] = useState('front') // 'front', 'side', 'done'
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [readyCount, setReadyCount] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [frontPhoto, setFrontPhoto] = useState(null)
  const [sidePhoto, setSidePhoto] = useState(null)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [borderColor, setBorderColor] = useState('transparent')
  const [tilt, setTilt] = useState({ beta: 90, gamma: 0, supported: false })
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const voiceRef = useRef(new VoiceGuide(language))
  const evalIntervalRef = useRef(null)
  const timerRef = useRef(null)
  const readyCountRef = useRef(0)
  const bestFrameRef = useRef(null)
  const bestScoreRef = useRef(0)

  const lang = language === 'vi' ? 'vi' : 'en'
  const msgs = VOICE_MESSAGES[lang]

  // ─── Cleanup ────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    if (evalIntervalRef.current) clearInterval(evalIntervalRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    voiceRef.current.stop()

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    voiceRef.current.setLang(lang)
  }, [lang])

  useEffect(() => {
    return () => stopEverything()
  }, [stopEverything])

  // ─── Device Orientation (Tilt Detection) ─────────────────────────
  useEffect(() => {
    if (mode !== 'tripod') return

    let handler = (e) => {
      if (e.beta !== null) {
        setTilt({ beta: e.beta, gamma: e.gamma || 0, supported: true })
      }
    }

    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(state => {
          if (state === 'granted') {
            window.addEventListener('deviceorientation', handler)
          }
        })
        .catch(() => {})
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', handler)
    }

    return () => window.removeEventListener('deviceorientation', handler)
  }, [mode])

  // ─── Elapsed Timer ──────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'tripod' && cameraReady) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [mode, cameraReady])

  // Bail-out after 90 seconds
  useEffect(() => {
    if (elapsedSeconds === 60) {
      voiceRef.current.speak('bail_out', true)
    }
  }, [elapsedSeconds])

  // ─── Detect device type ──────────────────────────────────────────
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // ─── Start Camera ───────────────────────────────────────────────
  const startCamera = async () => {
    try {
      // Mobile: use back camera (tripod mode)
      // Desktop: use webcam (front camera)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: isMobile ? { ideal: 'environment' } : 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraReady(true)
      setCameraError(null)

      // Start voice
      setTimeout(() => {
        if (isMobile) {
          voiceRef.current.speak('starting', true)
        } else {
          voiceRef.current.speak('starting_desktop', true)
        }
      }, 500)

      // Start evaluation loop
      startEvalLoop()

    } catch (err) {
      console.error('Camera error:', err)
      setCameraError(err.message)
      voiceRef.current.speak('camera_error', true)
    }
  }

  // ─── Grab Current Frame ──────────────────────────────────────────
  const grabFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    // Desktop webcam is mirrored in preview — flip back for analysis
    if (!isMobile) {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0) // reset

    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    })
  }

  // ─── Evaluation Loop ─────────────────────────────────────────────
  const startEvalLoop = () => {
    if (evalIntervalRef.current) clearInterval(evalIntervalRef.current)

    evalIntervalRef.current = setInterval(async () => {
      if (capturing) return

      const blob = await grabFrame()
      if (!blob) return

      try {
        const formData = new FormData()
        formData.append('image', blob, 'frame.jpg')
        formData.append('photo_type', phase)

        const resp = await fetch('/api/bodyscan/evaluate-photo', {
          method: 'POST',
          body: formData,
        })

        if (!resp.ok) throw new Error('Evaluation failed')

        const result = await resp.json()
        setEvaluation(result)

        // Track best frame
        const score = result.overall_score || 0
        if (score > bestScoreRef.current) {
          bestScoreRef.current = score
          bestFrameRef.current = blob
        }

        // More lenient threshold — ready if overall score >= 0.55
        // (instead of waiting for all 8 criteria to pass)
        const isReady = result.ready || score >= 0.55

        // Update border color
        if (isReady) {
          setBorderColor('#22c55e') // green
        } else if (score > 0.4) {
          setBorderColor('#eab308') // yellow
        } else {
          setBorderColor('#ef4444') // red
        }

        // Voice guidance — pick the worst criterion
        if (isReady) {
          readyCountRef.current += 1
          setReadyCount(readyCountRef.current)

          // Auto-capture after just 1 consecutive ready check (was 2)
          if (readyCountRef.current >= 1) {
            // AUTO CAPTURE
            await doCapture()
          } else {
            voiceRef.current.speak('hold_still', true)
            setStatusText(msgs.hold_still)
          }
        } else {
          readyCountRef.current = 0
          setReadyCount(0)

          // Find worst criterion and speak the fix
          const criteria = result.criteria || {}
          let worstKey = null
          let worstScore = 1

          for (const key of FIX_PRIORITY) {
            const crit = criteria[key]
            if (crit && typeof crit.score === 'number' && crit.score < worstScore) {
              worstScore = crit.score
              worstKey = key
            }
          }

          // More lenient — only speak fix if score < 0.5 (was 0.7)
          if (worstKey && worstScore < 0.5) {
            // Map criterion key to voice key
            let voiceKey = worstKey
            if (worstKey === 'pose') {
              voiceKey = phase === 'front' ? 'pose_front' : 'pose_side'
            }

            // Use the fix text from API if available, otherwise use our preset
            const fixText = criteria[worstKey]?.fix
            if (fixText && VOICE_MESSAGES[lang][voiceKey]) {
              voiceRef.current.speak(voiceKey)
              setStatusText(fixText)
            } else if (fixText) {
              voiceRef.current.speakCustom(fixText)
              setStatusText(fixText)
            } else if (VOICE_MESSAGES[lang][voiceKey]) {
              voiceRef.current.speak(voiceKey)
              setStatusText(VOICE_MESSAGES[lang][voiceKey])
            }
          } else if (result.overall_score > 0.4) {
            voiceRef.current.speak('almost')
            setStatusText(msgs.almost)
          }
        }

        // Tilt-based voice (supplement AI check)
        if (tilt.supported) {
          if (tilt.beta < 75) {
            voiceRef.current.speak('tilt_up')
          } else if (tilt.beta > 105) {
            voiceRef.current.speak('tilt_down')
          }
        }

      } catch (err) {
        console.error('Eval error:', err)
      }
    }, 2500) // Every 2.5 seconds
  }

  // ─── Auto Capture ─────────────────────────────────────────────────
  const doCapture = async () => {
    setCapturing(true)
    if (evalIntervalRef.current) clearInterval(evalIntervalRef.current)

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(200)

    const blob = await grabFrame()
    const file = new File([blob], `${phase}_photo.jpg`, { type: 'image/jpeg' })

    if (phase === 'front') {
      setFrontPhoto(file)
      voiceRef.current.speak('captured_front', true)
      setStatusText(msgs.captured_front)
      setBorderColor('#3b82f6') // blue transition

      // Wait for voice to finish, then start side photo
      setTimeout(() => {
        setPhase('side')
        setCapturing(false)
        setEvaluation(null)
        readyCountRef.current = 0
        bestScoreRef.current = 0
        bestFrameRef.current = null
        setReadyCount(0)
        setElapsedSeconds(0)
        setBorderColor('transparent')
        setStatusText('')
        startEvalLoop()
      }, 4000)

    } else {
      setSidePhoto(file)
      voiceRef.current.speak('captured_side', true)
      setStatusText(msgs.captured_side)
      setBorderColor('#22c55e')

      // Done — stop camera, send photos back
      setTimeout(() => {
        stopEverything()
        setPhase('done')
      }, 2500)
    }
  }

  // ─── Manual Capture (bail-out) ─────────────────────────────────────
  const manualCapture = async () => {
    readyCountRef.current = 2
    await doCapture()
  }

  // ─── Use Best Frame (after long wait) ──────────────────────────────
  const useBestFrame = () => {
    if (bestFrameRef.current) {
      const file = new File([bestFrameRef.current], `${phase}_photo.jpg`, { type: 'image/jpeg' })
      if (phase === 'front') {
        setFrontPhoto(file)
        setPhase('side')
        readyCountRef.current = 0
        bestScoreRef.current = 0
        bestFrameRef.current = null
        setElapsedSeconds(0)
        startEvalLoop()
      } else {
        setSidePhoto(file)
        stopEverything()
        setPhase('done')
      }
    }
  }

  // ─── Upload Mode Handlers ──────────────────────────────────────────
  const handleFileSelect = (e, type) => {
    const file = e.target.files[0]
    if (!file) return
    if (type === 'front') setFrontPhoto(file)
    if (type === 'side') setSidePhoto(file)
  }

  // ─── Submit Photos ─────────────────────────────────────────────────
  const handleSubmit = () => {
    if (frontPhoto) {
      onCapture(frontPhoto, sidePhoto)
    }
  }

  // ─── Toggle Voice ──────────────────────────────────────────────────
  const toggleVoice = () => {
    const enabled = voiceRef.current.toggle()
    setVoiceEnabled(enabled)
  }

  // ─── Tilt Indicator Calculation ────────────────────────────────────
  const getTiltStatus = () => {
    if (!tilt.supported) return null
    const deviation = Math.abs(tilt.beta - 90)
    if (deviation < 5) return { color: '#22c55e', label: '✓' }
    if (deviation < 15) return { color: '#eab308', label: '~' }
    return { color: '#ef4444', label: '✗' }
  }


  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // ─── Mode Selector ─────────────────────────────────────────────────
  if (!mode) {
    return (
      <div style={styles.selectorContainer}>
        <h2 style={styles.selectorTitle}>
          {lang === 'vi' ? 'Chọn cách chụp' : 'How would you like to capture?'}
        </h2>
        <p style={styles.selectorSubtitle}>
          {lang === 'vi'
            ? 'Chúng tôi cần ảnh trước và ảnh bên của bạn để đo'
            : 'We need your front and side photos for measurements'}
        </p>

        <div style={styles.modeCards}>
          <button
            style={styles.modeCard}
            onClick={() => { setMode('tripod'); setTimeout(startCamera, 300) }}
          >
            <div style={styles.modeIcon}>{isMobile ? '🎯' : '📷'}</div>
            <div style={styles.modeLabel}>
              {isMobile
                ? (lang === 'vi' ? 'Camera hướng dẫn' : 'Guided Camera')
                : (lang === 'vi' ? 'Webcam hướng dẫn' : 'Guided Webcam')
              }
            </div>
            <div style={styles.modeDesc}>
              {isMobile
                ? (lang === 'vi'
                    ? 'Dựng điện thoại, lùi lại. Trợ lý giọng nói sẽ hướng dẫn bạn chụp ảnh hoàn hảo.'
                    : 'Prop your phone, step back. Voice assistant guides you to the perfect shot.')
                : (lang === 'vi'
                    ? 'Dùng webcam. Trợ lý giọng nói sẽ hướng dẫn bạn đứng đúng vị trí và tự động chụp.'
                    : 'Use your webcam. Voice assistant guides your positioning and auto-captures when ready.')
              }
            </div>
            <div style={styles.modeBadge}>
              {lang === 'vi' ? '⭐ Chính xác nhất' : '⭐ Most accurate'}
            </div>
          </button>

          <button
            style={styles.modeCard}
            onClick={() => setMode('upload')}
          >
            <div style={styles.modeIcon}>📁</div>
            <div style={styles.modeLabel}>
              {lang === 'vi' ? 'Tải ảnh lên' : 'Upload Photos'}
            </div>
            <div style={styles.modeDesc}>
              {lang === 'vi'
                ? 'Chọn ảnh có sẵn từ thư viện.'
                : 'Pick existing photos from your gallery.'}
            </div>
          </button>
        </div>

        <button style={styles.cancelBtn} onClick={onCancel}>
          {lang === 'vi' ? '← Quay lại' : '← Go back'}
        </button>
      </div>
    )
  }


  // ─── Upload Mode ───────────────────────────────────────────────────
  if (mode === 'upload') {
    return (
      <div style={styles.uploadContainer}>
        <h2 style={styles.selectorTitle}>
          {lang === 'vi' ? 'Tải ảnh lên' : 'Upload Photos'}
        </h2>

        <div style={styles.uploadGrid}>
          <label style={{
            ...styles.uploadBox,
            borderColor: frontPhoto ? '#22c55e' : 'rgba(255,255,255,0.15)',
          }}>
            <input type="file" accept="image/*" hidden onChange={(e) => handleFileSelect(e, 'front')} />
            {frontPhoto ? (
              <div style={styles.uploadPreview}>
                <img src={URL.createObjectURL(frontPhoto)} alt="Front" style={styles.previewImg} />
                <div style={styles.uploadCheck}>✓</div>
              </div>
            ) : (
              <>
                <div style={styles.uploadIcon}>👤</div>
                <div style={styles.uploadLabel}>{lang === 'vi' ? 'Ảnh trước' : 'Front photo'}</div>
                <div style={styles.uploadHint}>{lang === 'vi' ? 'Bắt buộc' : 'Required'}</div>
              </>
            )}
          </label>

          <label style={{
            ...styles.uploadBox,
            borderColor: sidePhoto ? '#22c55e' : 'rgba(255,255,255,0.15)',
          }}>
            <input type="file" accept="image/*" hidden onChange={(e) => handleFileSelect(e, 'side')} />
            {sidePhoto ? (
              <div style={styles.uploadPreview}>
                <img src={URL.createObjectURL(sidePhoto)} alt="Side" style={styles.previewImg} />
                <div style={styles.uploadCheck}>✓</div>
              </div>
            ) : (
              <>
                <div style={styles.uploadIcon}>🧍</div>
                <div style={styles.uploadLabel}>{lang === 'vi' ? 'Ảnh bên' : 'Side photo'}</div>
                <div style={styles.uploadHint}>{lang === 'vi' ? 'Tùy chọn' : 'Optional'}</div>
              </>
            )}
          </label>
        </div>

        <div style={styles.uploadActions}>
          <button
            style={{
              ...styles.submitBtn,
              opacity: frontPhoto ? 1 : 0.4,
              pointerEvents: frontPhoto ? 'auto' : 'none',
            }}
            onClick={handleSubmit}
          >
            {lang === 'vi' ? 'Tiếp tục phân tích →' : 'Continue to analysis →'}
          </button>
          <button style={styles.cancelBtn} onClick={() => { setMode(null); setFrontPhoto(null); setSidePhoto(null) }}>
            {lang === 'vi' ? '← Chọn lại' : '← Change mode'}
          </button>
        </div>
      </div>
    )
  }


  // ─── Done — Both Photos Captured ───────────────────────────────────
  if (phase === 'done') {
    return (
      <div style={styles.doneContainer}>
        <div style={styles.doneIcon}>✅</div>
        <h2 style={styles.doneTitle}>
          {lang === 'vi' ? 'Đã chụp xong!' : 'Photos captured!'}
        </h2>

        <div style={styles.donePreview}>
          {frontPhoto && (
            <div style={styles.donePhotoWrap}>
              <img src={URL.createObjectURL(frontPhoto)} alt="Front" style={styles.donePhoto} />
              <div style={styles.donePhotoLabel}>{lang === 'vi' ? 'Trước' : 'Front'}</div>
            </div>
          )}
          {sidePhoto && (
            <div style={styles.donePhotoWrap}>
              <img src={URL.createObjectURL(sidePhoto)} alt="Side" style={styles.donePhoto} />
              <div style={styles.donePhotoLabel}>{lang === 'vi' ? 'Bên' : 'Side'}</div>
            </div>
          )}
        </div>

        <button style={styles.submitBtn} onClick={handleSubmit}>
          {lang === 'vi' ? 'Phân tích Body Scan →' : 'Analyze Body Scan →'}
        </button>

        <button style={styles.retakeBtn} onClick={() => {
          setFrontPhoto(null)
          setSidePhoto(null)
          setPhase('front')
          setMode(null)
          setElapsedSeconds(0)
          readyCountRef.current = 0
          bestScoreRef.current = 0
        }}>
          {lang === 'vi' ? '↻ Chụp lại' : '↻ Retake photos'}
        </button>
      </div>
    )
  }


  // ─── Tripod Mode — Live Camera ─────────────────────────────────────
  const tiltStatus = getTiltStatus()

  return (
    <div style={styles.cameraContainer}>
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Camera Error */}
      {cameraError && (
        <div style={styles.errorOverlay}>
          <div style={styles.errorIcon}>📷</div>
          <div style={styles.errorText}>{msgs.camera_error}</div>
          <button style={styles.submitBtn} onClick={() => setMode('upload')}>
            {lang === 'vi' ? 'Tải ảnh lên thay' : 'Switch to upload'}
          </button>
          <button style={styles.cancelBtn} onClick={onCancel}>
            {lang === 'vi' ? '← Quay lại' : '← Go back'}
          </button>
        </div>
      )}

      {/* Video Preview with Guide Border */}
      <div style={{ ...styles.videoWrapper, boxShadow: `inset 0 0 0 4px ${borderColor}` }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            ...styles.video,
            transform: !isMobile ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Body Outline Guide (subtle) */}
        <div style={styles.bodyOutline}>
          <svg viewBox="0 0 200 400" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" style={{ width: '100%', height: '100%' }}>
            {/* Head */}
            <ellipse cx="100" cy="45" rx="22" ry="28" />
            {/* Body */}
            <path d="M78 73 L65 170 L75 170 L70 320 L85 390 L90 390 L100 200 L110 390 L115 390 L130 320 L125 170 L135 170 L122 73 Z" />
          </svg>
        </div>

        {/* Phase Indicator */}
        <div style={styles.phaseTag}>
          {phase === 'front'
            ? (lang === 'vi' ? '📷 Ảnh trước' : '📷 Front photo')
            : (lang === 'vi' ? '📷 Ảnh bên' : '📷 Side photo')
          }
        </div>

        {/* Status Banner */}
        {statusText && (
          <div style={{
            ...styles.statusBanner,
            background: borderColor === '#22c55e'
              ? 'rgba(34,197,94,0.9)'
              : borderColor === '#eab308'
                ? 'rgba(234,179,8,0.85)'
                : 'rgba(239,68,68,0.85)',
          }}>
            {statusText}
          </div>
        )}

        {/* Tilt Indicator */}
        {tiltStatus && (
          <div style={{ ...styles.tiltBadge, background: tiltStatus.color }}>
            📐 {Math.round(tilt.beta)}°
          </div>
        )}

        {/* Score Display */}
        {evaluation && (
          <div style={styles.scoreDisplay}>
            <div style={styles.scoreNumber}>
              {Math.round((evaluation.overall_score || 0) * 100)}%
            </div>
            <div style={styles.scoreLabel}>
              {lang === 'vi' ? 'Chất lượng' : 'Quality'}
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div style={styles.controlsBar}>
        {/* Voice Toggle */}
        <button style={styles.controlBtn} onClick={toggleVoice}>
          {voiceEnabled ? '🔊' : '🔇'}
        </button>

        {/* Manual Capture (bail-out) */}
        <button
          style={{
            ...styles.captureBtn,
            opacity: elapsedSeconds > 8 ? 1 : 0.3,
            pointerEvents: elapsedSeconds > 8 ? 'auto' : 'none',
          }}
          onClick={manualCapture}
        >
          <div style={styles.captureBtnInner} />
        </button>

        {/* Switch to upload */}
        <button style={styles.controlBtn} onClick={() => {
          stopEverything()
          setMode('upload')
        }}>
          📁
        </button>
      </div>

      {/* Timer + hint */}
      <div style={styles.hintBar}>
        {elapsedSeconds > 8 && !evaluation?.ready && (
          <span style={styles.hintText}>
            {lang === 'vi'
              ? 'Nhấn nút tròn để chụp thủ công'
              : 'Tap the circle button to capture manually'}
          </span>
        )}
        {elapsedSeconds > 45 && bestScoreRef.current > 0.3 && (
          <button style={styles.useBestBtn} onClick={useBestFrame}>
            {lang === 'vi'
              ? `Dùng ảnh tốt nhất (${Math.round(bestScoreRef.current * 100)}%)`
              : `Use best frame (${Math.round(bestScoreRef.current * 100)}%)`}
          </button>
        )}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════
const styles = {
  // ─── Mode Selector ──────────────────────────────────
  selectorContainer: {
    padding: '24px 16px',
    maxWidth: 480,
    margin: '0 auto',
  },
  selectorTitle: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 6,
    color: 'var(--text, #fff)',
  },
  selectorSubtitle: {
    fontSize: 14,
    color: 'var(--text-soft, #999)',
    marginBottom: 24,
  },
  modeCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  modeCard: {
    background: 'var(--card-bg, rgba(255,255,255,0.06))',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: '20px 18px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: 'inherit',
    fontFamily: 'inherit',
  },
  modeIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
    color: 'var(--text, #fff)',
  },
  modeDesc: {
    fontSize: 13,
    color: 'var(--text-soft, #999)',
    lineHeight: 1.5,
  },
  modeBadge: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 600,
    color: '#22c55e',
  },

  // ─── Camera ────────────────────────────────────────
  cameraContainer: {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    maxHeight: 800,
    background: '#000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  videoWrapper: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
    borderRadius: '16px 16px 0 0',
    transition: 'box-shadow 0.3s',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  bodyOutline: {
    position: 'absolute',
    top: '5%',
    left: '25%',
    width: '50%',
    height: '85%',
    pointerEvents: 'none',
    opacity: 0.6,
  },
  phaseTag: {
    position: 'absolute',
    top: 12,
    left: 12,
    background: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    backdropFilter: 'blur(8px)',
  },
  statusBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    textAlign: 'center',
    backdropFilter: 'blur(8px)',
  },
  tiltBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 20,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 700,
    color: '#fff',
  },
  scoreDisplay: {
    position: 'absolute',
    top: 50,
    right: 12,
    textAlign: 'center',
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: 900,
    color: '#fff',
    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    fontFamily: 'monospace',
  },
  scoreLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ─── Controls ──────────────────────────────────────
  controlsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '16px 24px',
    background: 'rgba(0,0,0,0.9)',
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'transparent',
    border: '3px solid rgba(255,255,255,0.8)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.3s',
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: '50%',
    background: '#fff',
  },

  // ─── Hint Bar ──────────────────────────────────────
  hintBar: {
    padding: '8px 16px 16px',
    background: 'rgba(0,0,0,0.9)',
    textAlign: 'center',
    minHeight: 36,
  },
  hintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  useBestBtn: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#3b82f6',
    background: 'none',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 8,
    padding: '6px 16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ─── Upload Mode ───────────────────────────────────
  uploadContainer: {
    padding: '24px 16px',
    maxWidth: 480,
    margin: '0 auto',
  },
  uploadGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    marginTop: 20,
  },
  uploadBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 16,
    border: '2px dashed',
    background: 'var(--card-bg, rgba(255,255,255,0.04))',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: 160,
  },
  uploadIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text, #fff)',
  },
  uploadHint: {
    fontSize: 12,
    color: 'var(--text-soft, #999)',
    marginTop: 4,
  },
  uploadPreview: {
    position: 'relative',
    width: '100%',
    height: 140,
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 8,
  },
  uploadCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#22c55e',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadActions: {
    marginTop: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  // ─── Done Screen ───────────────────────────────────
  doneContainer: {
    padding: '32px 16px',
    maxWidth: 480,
    margin: '0 auto',
    textAlign: 'center',
  },
  doneIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text, #fff)',
    marginBottom: 20,
  },
  donePreview: {
    display: 'flex',
    gap: 14,
    justifyContent: 'center',
    marginBottom: 24,
  },
  donePhotoWrap: {
    width: 140,
    textAlign: 'center',
  },
  donePhoto: {
    width: 140,
    height: 200,
    objectFit: 'cover',
    borderRadius: 12,
    border: '2px solid rgba(255,255,255,0.1)',
  },
  donePhotoLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-soft, #999)',
    marginTop: 6,
  },

  // ─── Shared Buttons ────────────────────────────────
  submitBtn: {
    width: '100%',
    padding: '14px 24px',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    marginTop: 12,
    fontSize: 14,
    color: 'var(--text-soft, #999)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center',
    width: '100%',
    padding: 8,
  },
  retakeBtn: {
    marginTop: 10,
    fontSize: 14,
    color: 'var(--text-soft, #999)',
    background: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ─── Error ─────────────────────────────────────────
  errorOverlay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    textAlign: 'center',
    gap: 16,
    flex: 1,
  },
  errorIcon: {
    fontSize: 48,
  },
  errorText: {
    fontSize: 15,
    color: 'var(--text-soft, #999)',
    lineHeight: 1.5,
  },
}