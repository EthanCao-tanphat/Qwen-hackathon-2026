import { useState } from 'react'
import FileUpload from '../components/ui/FileUpload'
import { transcribeAudio } from '../lib/api'

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'vn', label: 'Tiếng Việt' },
]

export default function Scribe() {
  const [file, setFile] = useState(null)
  const [language, setLanguage] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('report')

  const handleTranscribe = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const data = await transcribeAudio(file, language)
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const report = results?.clinical_report

  return (
    <div>
      <div className="page-header">
        <div className="page-badge green">Audio AI · Clinical NLP</div>
        <h1>Clinical Scribe</h1>
        <p>Upload a doctor-patient consultation recording. Healix transcribes, extracts clinical data, and generates a structured SOAP note.</p>
      </div>

      <FileUpload
        accept="audio/*,.wav,.mp3,.m4a,.ogg"
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
            <path d="M19 10v1a7 7 0 01-14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <path d="M8 22h8" />
          </svg>
        }
        title="Drop your consultation audio here"
        subtitle="WAV, MP3, M4A, OGG — up to 25 MB"
        file={file}
        onFile={setFile}
      />

      <div className="lang-selector">
        {LANGUAGES.map((l) => (
          <button key={l.code} className={`lang-btn ${language === l.code ? 'selected' : ''}`} onClick={() => setLanguage(l.code)}>
            {l.label}
          </button>
        ))}
      </div>

      <button className="submit-btn green" disabled={!file || loading} onClick={handleTranscribe}>
        {loading ? (
          <><div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> Transcribing...</>
        ) : (
          'Transcribe & Analyze'
        )}
      </button>

      {error && (
        <div style={{ marginTop: 20, padding: 16, background: '#fef2f2', borderRadius: 12, color: '#dc2626', fontSize: 14 }}>
          {error}
        </div>
      )}

      {results && !loading && (
        <div className="results-area">
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
            {['report', 'transcript', 'soap'].map((t) => (
              <button
                key={t}
                className={`lang-btn ${tab === t ? 'selected' : ''}`}
                onClick={() => setTab(t)}
                style={{ textTransform: 'capitalize' }}
              >
                {t === 'soap' ? 'SOAP Note' : t}
              </button>
            ))}
          </div>

          {/* Report tab */}
          {tab === 'report' && report && (
            <div>
              {report.chief_complaint && (
                <div className="summary-card">
                  <h3>🩺 Chief Complaint</h3>
                  <p>{report.chief_complaint}</p>
                </div>
              )}

              {report.symptoms?.length > 0 && (
                <>
                  <div className="results-header"><h2>Symptoms</h2></div>
                  {report.symptoms.map((s, i) => (
                    <div key={i} className="result-card">
                      <div className="result-card-header">
                        <span className="result-card-title">{s.name}</span>
                        <span className={`severity ${s.severity || 'mild'}`}>{s.severity || 'noted'}</span>
                      </div>
                      {s.duration && <div className="result-card-body">Duration: {s.duration}</div>}
                    </div>
                  ))}
                </>
              )}

              {report.diagnosis && (
                <div className="summary-card" style={{ marginTop: 20 }}>
                  <h3>🔬 Diagnosis</h3>
                  <p><strong>Primary:</strong> {report.diagnosis.primary}</p>
                  {report.diagnosis.differential?.length > 0 && (
                    <p style={{ marginTop: 8 }}>
                      <strong>Differential:</strong> {report.diagnosis.differential.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {report.medications?.length > 0 && (
                <>
                  <div className="results-header" style={{ marginTop: 20 }}><h2>Medications</h2></div>
                  {report.medications.map((m, i) => (
                    <div key={i} className="result-card">
                      <div className="result-card-title">{m.name}</div>
                      <div className="result-card-body" style={{ marginTop: 6 }}>
                        {m.dosage} · {m.frequency} · {m.duration}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {report.follow_up && (
                <div style={{ marginTop: 20, padding: 16, background: 'rgba(56,182,255,0.04)', borderRadius: 12, fontSize: 14, color: '#0077CC' }}>
                  <strong>Follow-up:</strong> {report.follow_up}
                </div>
              )}
            </div>
          )}

          {/* Transcript tab */}
          {tab === 'transcript' && (
            <div className="transcript-box">{results.transcript}</div>
          )}

          {/* SOAP tab */}
          {tab === 'soap' && results.soap_note && (
            <div className="soap-note">{results.soap_note}</div>
          )}
        </div>
      )}
    </div>
  )
}
