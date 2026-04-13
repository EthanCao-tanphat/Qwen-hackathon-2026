import { useState, useRef } from 'react'
import { analyzeLabs } from '../lib/api'

const MAX_FILES = 10

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'vn', label: 'Tiếng Việt' },
]

// ─── Multi-file upload zone ───
function MultiUpload({ files, onFilesChange }) {
  const inputRef = useRef(null)
  const [dragover, setDragover] = useState(false)

  const addFiles = (newFiles) => {
    const combined = [...files, ...Array.from(newFiles)].slice(0, MAX_FILES)
    onFilesChange(combined)
  }

  const removeFile = (index) => {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  const formatSize = (b) => b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / (1024 * 1024)).toFixed(1) + ' MB'

  return (
    <div>
      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => { e.preventDefault(); setDragover(false); addFiles(e.dataTransfer.files) }}
        style={{ cursor: files.length >= MAX_FILES ? 'not-allowed' : 'pointer' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
        <div className="upload-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="7" y="2" width="10" height="4" rx="1" />
            <rect x="3" y="8" width="18" height="14" rx="2" />
            <path d="M12 12v5M8 12v3M16 12v3" />
          </svg>
        </div>
        <div className="upload-title">
          {files.length === 0 ? 'Drop lab report files here' : `${files.length} / ${MAX_FILES} files added — drop more`}
        </div>
        <div className="upload-subtitle">PDF or images (JPG, PNG, HEIC) · up to {MAX_FILES} files</div>
      </div>

      {/* Thumbnails */}
      {files.length > 0 && (
        <div style={s.thumbGrid}>
          {files.map((file, i) => (
            <div key={i} style={s.thumbCard}>
              {file.type?.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt="" style={s.thumbImg} />
              ) : (
                <div style={s.thumbPdf}>PDF</div>
              )}
              <div style={s.thumbInfo}>
                <div style={s.thumbName}>{file.name.length > 18 ? file.name.slice(0, 15) + '...' : file.name}</div>
                <div style={s.thumbSize}>{formatSize(file.size)}</div>
              </div>
              <button style={s.thumbRemove} onClick={() => removeFile(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Camera with multi-capture ───
function MultiCamera({ captures, onCapturesChange }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [streaming, setStreaming] = useState(false)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      videoRef.current.play()
      setStreaming(true)
    } catch {
      alert('Camera access denied.')
    }
  }

  const capture = () => {
    if (captures.length >= MAX_FILES) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob((blob) => {
      const file = new File([blob], `lab-page-${captures.length + 1}.jpg`, { type: 'image/jpeg' })
      onCapturesChange([...captures, { file, preview: canvas.toDataURL('image/jpeg', 0.8) }])
      stopCamera()  // Close camera after snap
    }, 'image/jpeg', 0.92)
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setStreaming(false)
  }

  const removeCapture = (index) => {
    onCapturesChange(captures.filter((_, i) => i !== index))
  }

  return (
    <div>
      {!streaming && captures.length === 0 && (
        <button onClick={startCamera} style={s.openCamBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Take Photo of Lab Report
        </button>
      )}

      {streaming && (
        <div style={s.videoWrap}>
          <video ref={videoRef} style={s.video} playsInline />
          <div style={s.hint}>Position the lab report in the frame</div>
          <div style={s.controls}>
            <button onClick={stopCamera} style={s.cancelBtn}>Cancel</button>
            <button onClick={capture} style={s.snapBtn} disabled={captures.length >= MAX_FILES}>
              <div style={s.snapInner} />
            </button>
            <div style={{ width: 60 }} />
          </div>
        </div>
      )}

      {/* Captured thumbnails */}
      {captures.length > 0 && !streaming && (
        <>
          <div style={s.thumbGrid}>
            {captures.map((cap, i) => (
              <div key={i} style={s.thumbCard}>
                <img src={cap.preview} alt="" style={s.thumbImg} />
                <div style={s.thumbInfo}>
                  <div style={s.thumbName}>Page {i + 1}</div>
                  <div style={s.thumbSize}>Photo</div>
                </div>
                <button style={s.thumbRemove} onClick={() => removeCapture(i)}>✕</button>
              </div>
            ))}
          </div>
          {captures.length < MAX_FILES && (
            <button onClick={startCamera} style={{ ...s.openCamBtn, borderStyle: 'dashed', marginTop: 12, padding: 12, fontSize: 14 }}>
              + Add Another Page ({captures.length}/{MAX_FILES})
            </button>
          )}
        </>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}

// ─── Styles ───
const s = {
  thumbGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10, marginTop: 16,
  },
  thumbCard: {
    position: 'relative', borderRadius: 12, overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.08)', background: 'white',
  },
  thumbImg: { width: '100%', height: 90, objectFit: 'cover' },
  thumbPdf: {
    width: '100%', height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f0f4ff', color: '#0077CC', fontWeight: 800, fontSize: 18,
    fontFamily: "'JetBrains Mono', monospace",
  },
  thumbInfo: { padding: '8px 10px' },
  thumbName: { fontSize: 12, fontWeight: 600, color: '#0a0a1a' },
  thumbSize: { fontSize: 11, color: '#9a9aba', fontFamily: "'JetBrains Mono', monospace" },
  thumbRemove: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: 11,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  openCamBtn: {
    width: '100%', padding: 16, borderRadius: 16,
    border: '2px dashed rgba(56,182,255,0.3)', background: 'rgba(56,182,255,0.03)',
    cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#0077CC',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    fontFamily: "'Outfit', sans-serif", marginTop: 16,
  },
  countBadge: {
    padding: '2px 10px', borderRadius: 100, background: '#38B6FF', color: 'white',
    fontSize: 12, fontWeight: 700,
  },
  videoWrap: {
    position: 'relative', borderRadius: 20, overflow: 'hidden',
    background: '#000', aspectRatio: '4/3', marginTop: 16,
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  hint: {
    position: 'absolute', top: 14, left: 0, right: 0, textAlign: 'center',
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
  },
  controls: {
    position: 'absolute', bottom: 20, left: 0, right: 0,
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28,
  },
  cancelBtn: {
    padding: '8px 20px', borderRadius: 100, border: 'none',
    background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 14,
    fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)',
    fontFamily: "'Outfit', sans-serif",
  },
  snapBtn: {
    width: 68, height: 68, borderRadius: '50%', border: '4px solid white',
    background: 'rgba(255,255,255,0.15)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  snapInner: { width: 52, height: 52, borderRadius: '50%', background: 'white' },
  countLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, minWidth: 50 },
}

// ─── Main Labs Page ───
export default function Labs() {
  const [files, setFiles] = useState([])
  const [captures, setCaptures] = useState([])
  const [language, setLanguage] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('upload')

  const activeFiles = mode === 'camera'
    ? captures.map(c => c.file)
    : files

  const handleAnalyze = async () => {
    if (activeFiles.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const data = await analyzeLabs(activeFiles, language)
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-badge blue">Vision AI · NLP</div>
        <h1>Labs Analyzer</h1>
        <p>Upload lab report files or snap photos of each page. Healix extracts every test, classifies severity, and explains results.</p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(0,0,0,0.03)', borderRadius: 100, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'upload', label: '📄 Upload Files' },
          { key: 'camera', label: '📸 Take Photos' },
        ].map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              padding: '8px 20px', borderRadius: 100, border: 'none', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
              transition: 'all 0.3s',
              background: mode === m.key ? '#38B6FF' : 'transparent',
              color: mode === m.key ? 'white' : '#6a6a8a',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'upload' && <MultiUpload files={files} onFilesChange={setFiles} />}
      {mode === 'camera' && <MultiCamera captures={captures} onCapturesChange={setCaptures} />}

      {/* Language */}
      <div className="lang-selector">
        {LANGUAGES.map((l) => (
          <button key={l.code} className={`lang-btn ${language === l.code ? 'selected' : ''}`} onClick={() => setLanguage(l.code)}>
            {l.label}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button className="submit-btn blue" disabled={activeFiles.length === 0 || loading} onClick={handleAnalyze}>
        {loading ? (
          <><div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> Analyzing {activeFiles.length} page{activeFiles.length > 1 ? 's' : ''}...</>
        ) : (
          `Analyze ${activeFiles.length > 0 ? activeFiles.length + ' Page' + (activeFiles.length > 1 ? 's' : '') : 'Lab Report'}`
        )}
      </button>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 20, padding: 16, background: '#fef2f2', borderRadius: 12, color: '#dc2626', fontSize: 14 }}>{error}</div>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="results-area">
          {results.patient_info?.name && (
            <div style={{ marginBottom: 20, padding: 16, background: 'rgba(56,182,255,0.04)', borderRadius: 12, fontSize: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {results.patient_info.name && <span><strong>Patient:</strong> {results.patient_info.name}</span>}
              {results.patient_info.age && <span><strong>Age:</strong> {results.patient_info.age}</span>}
              {results.patient_info.gender && <span><strong>Gender:</strong> {results.patient_info.gender}</span>}
              {results.patient_info.collection_date && <span><strong>Date:</strong> {results.patient_info.collection_date}</span>}
            </div>
          )}

          {results.summary && (
            <div className="summary-card">
              <h3>📋 Summary</h3>
              <p>{results.summary}</p>
            </div>
          )}

          {results.clinical_correlations?.length > 0 && (
            <div style={{ marginBottom: 20, padding: 20, background: 'linear-gradient(135deg, rgba(139,92,246,0.04), rgba(56,182,255,0.04))', border: '1px solid rgba(139,92,246,0.12)', borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🔬 Clinical Patterns Detected</h3>
              {results.clinical_correlations.map((c, i) => (
                <div key={i} style={{ fontSize: 14, color: '#5a5a7a', marginBottom: 6, paddingLeft: 12, borderLeft: '3px solid rgba(139,92,246,0.3)' }}>{c}</div>
              ))}
            </div>
          )}

          {results.priority_actions?.length > 0 && (
            <div style={{ marginBottom: 20, padding: 20, background: 'rgba(0,212,170,0.04)', border: '1px solid rgba(0,212,170,0.12)', borderRadius: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>⚡ Priority Actions</h3>
              {results.priority_actions.map((a, i) => (
                <div key={i} style={{ fontSize: 14, color: '#0a0a1a', marginBottom: 8, display: 'flex', gap: 8 }}>
                  <span style={{ fontWeight: 700, color: '#00D4AA' }}>{i + 1}.</span> {a}
                </div>
              ))}
            </div>
          )}

          {results.urgent_flags?.length > 0 && (
            <div style={{ marginBottom: 20, padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12 }}>
              <strong style={{ color: '#dc2626' }}>🚨 Critical Values:</strong>{' '}
              <span style={{ color: '#991b1b' }}>{results.urgent_flags.join(', ')}</span>
            </div>
          )}

          <div className="results-header">
            <h2>Test Results</h2>
            <span className="results-count">{results.abnormal_count || 0} abnormal / {results.total_tests_found || 0} total</span>
          </div>

          {results.results?.map((r, i) => (
            <div key={i} className="result-card" style={{
              borderLeft: r.is_critical ? '4px solid #dc2626' :
                r.severity === 'severe' ? '4px solid #f97316' :
                r.severity === 'moderate' ? '4px solid #eab308' :
                r.severity === 'mild' ? '4px solid #38B6FF' : '4px solid transparent'
            }}>
              <div className="result-card-header">
                <div>
                  <span className="result-card-title">{r.test_name}</span>
                  {r.organ_system && <span style={{ fontSize: 11, color: '#9a9aba', marginLeft: 8, fontFamily: 'var(--mono)' }}>{r.organ_system}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="result-card-value">{r.value} {r.unit}</span>
                  <span className={`severity ${r.severity || 'normal'}`}>{r.status || r.severity || 'normal'}</span>
                </div>
              </div>
              {r.reference_range && (
                <div style={{ fontSize: 12, color: '#9a9aba', fontFamily: 'var(--mono)', marginBottom: 8 }}>
                  Ref: {r.reference_range}
                  {r.deviation_pct > 0 && <span style={{ marginLeft: 8, color: '#f97316' }}>({r.deviation_pct}% {r.status?.includes('high') ? 'above' : 'below'})</span>}
                </div>
              )}
              {r.explanation && <div className="result-card-body">{r.explanation}</div>}
              {r.next_steps?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 13, color: '#0077CC' }}>
                  {r.next_steps.map((step, j) => <div key={j}>→ {step}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}