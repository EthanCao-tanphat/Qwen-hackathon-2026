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
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const f = new File([blob], 'recording.webm', { type: 'audio/webm' })
        setFile(f)
      }
      recorder.start()
      setMediaRecorder(recorder)
      setRecording(true)
    } catch (err) {
      setError('Could not access microphone: ' + err.message)
    }
  }

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop()
      mediaRecorder.stream.getTracks().forEach((t) => t.stop())
    }
    setRecording(false)
  }

  const handleTranscribe = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const data = await transcribeAudio(file, language)
      if (data?.error) {
        setError(data.error)
      }
      setResults(data || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const exportPDF = () => {
    if (!results?.soap_note) return
    const report = results.clinical_report
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>SOAP Note - Healix</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
            .header { display: flex; justify-content: space-between; margin-bottom: 32px; border-bottom: 2px solid #111; padding-bottom: 16px; }
            .logo { font-size: 24px; font-weight: 700; }
            .date { font-size: 13px; color: #666; }
            .patient-info { margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; }
            .patient-info h3 { margin: 0 0 8px; font-size: 14px; color: #666; }
            .patient-row { display: flex; gap: 32px; font-size: 14px; margin-top: 4px; }
            .section { margin-bottom: 24px; }
            .section-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #ddd; }
            pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; margin: 0; }
            .summary { padding: 16px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; }
            .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #999; text-align: center; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">Healix</div>
            <div class="date">
              <div>Date: ${new Date().toLocaleDateString()}</div>
              <div>Time: ${new Date().toLocaleTimeString()}</div>
              <div>Language: ${(results.language_detected || 'EN').toUpperCase()}</div>
            </div>
          </div>

          ${
            results.summary
              ? `<div class="summary"><strong>Consultation Summary:</strong> ${results.summary}</div>`
              : ''
          }

          <div class="patient-info">
            <h3>PATIENT INFORMATION</h3>
            <div class="patient-row">
              <span><strong>Name:</strong> ${report?.patient_info?.name || 'Not reported'}</span>
              <span><strong>Gender:</strong> ${report?.patient_info?.gender || 'Not reported'}</span>
              <span><strong>Age:</strong> ${report?.patient_info?.age || 'Not reported'}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">SOAP NOTE</div>
            <pre>${results.soap_note}</pre>
          </div>

          <div class="footer">
            Generated by Healix AI · Powered by Qwen · ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    printWindow.document.write(printContent)
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 300)
  }

  // SAFE DERIVATIONS — every access guarded
  const report = results?.clinical_report || null
  const transcript = results?.transcript || ''
  const transcriptLines = transcript ? transcript.split('\n').filter((l) => l.trim()) : []
  const soapNote = results?.soap_note || ''
  const summary = results?.summary
  const patientSummary = results?.patient_summary
  const severity = results?.severity_level

  return (
    <div>
      <div className="page-header">
        <div className="page-badge green">Audio AI · Clinical NLP</div>
        <h1>Clinical Scribe</h1>
        <p>Upload a doctor-patient consultation recording. Healix transcribes, extracts clinical data, and generates a structured SOAP note.</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {!recording ? (
          <button className="submit-btn green" onClick={startRecording}>
            🎙️ Record Live
          </button>
        ) : (
          <button className="submit-btn" style={{ background: '#dc2626' }} onClick={stopRecording}>
            ⏹️ Stop Recording
          </button>
        )}
      </div>

      <FileUpload
        accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" />
            <path d="M19 10v1a7 7 0 01-14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <path d="M8 22h8" />
          </svg>
        }
        title="Drop your consultation audio here"
        subtitle="WAV, MP3, M4A, OGG, WebM — up to 25 MB"
        file={file}
        onFile={setFile}
      />

      <div className="lang-selector">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            className={`lang-btn ${language === l.code ? 'selected' : ''}`}
            onClick={() => setLanguage(l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <button className="submit-btn green" disabled={!file || loading} onClick={handleTranscribe}>
        {loading ? (
          <>
            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            Transcribing...
          </>
        ) : (
          'Transcribe & Analyze'
        )}
      </button>

      {error && (
        <div style={{ marginTop: 20, padding: 16, background: '#fef2f2', borderRadius: 12, color: '#dc2626', fontSize: 14, border: '1px solid #fca5a5' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {results && !loading && (
        <div className="results-area">
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
            {['report', 'transcript', 'soap', 'patient'].map((t) => (
              <button
                key={t}
                className={`lang-btn ${tab === t ? 'selected' : ''}`}
                onClick={() => setTab(t)}
                style={{ textTransform: 'capitalize' }}
              >
                {t === 'soap' ? 'SOAP Note' : t === 'patient' ? '👤 For Patient' : t}
              </button>
            ))}
          </div>

          {/* REPORT TAB */}
          {tab === 'report' && (
            <div>
              {summary && (
                <div style={{ marginBottom: 16, padding: '16px 18px', borderRadius: 12, background: 'rgba(14,165,233,0.06)', borderLeft: '4px solid #0ea5e9' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>📝 Consultation Summary</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{summary}</p>
                </div>
              )}

              {severity && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 16px',
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: severity === 'emergency' ? '#fef2f2' : severity === 'urgent' ? '#fffbeb' : '#f0fdf4',
                    border: `1px solid ${severity === 'emergency' ? '#fca5a5' : severity === 'urgent' ? '#fcd34d' : '#86efac'}`,
                  }}
                >
                  <span style={{ fontSize: 16 }}>
                    {severity === 'emergency' ? '🚨' : severity === 'urgent' ? '⚠️' : '✅'}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: severity === 'emergency' ? '#dc2626' : severity === 'urgent' ? '#d97706' : '#16a34a',
                      textTransform: 'uppercase',
                    }}
                  >
                    {severity}
                  </span>
                </div>
              )}

              {!report && !summary && (
                <div style={{ padding: 20, background: '#fef9c3', borderRadius: 12, color: '#854d0e', fontSize: 14 }}>
                  No clinical data extracted. Check the transcript tab to see what was heard.
                </div>
              )}

              {report?.patient_info && (report.patient_info.age || report.patient_info.gender) && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  {report.patient_info.age && (
                    <span style={{ padding: '4px 12px', borderRadius: 99, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13, color: '#8b5cf6' }}>
                      🎂 {report.patient_info.age}
                    </span>
                  )}
                  {report.patient_info.gender && (
                    <span style={{ padding: '4px 12px', borderRadius: 99, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 13, color: '#10b981' }}>
                      👤 {report.patient_info.gender}
                    </span>
                  )}
                </div>
              )}

              {report?.subjective?.chief_complaint && (
                <div className="summary-card">
                  <h3>🩺 Chief Complaint</h3>
                  <p>{report.subjective.chief_complaint}</p>
                </div>
              )}

              {report?.subjective?.history_of_present_illness && (
                <div className="summary-card" style={{ marginTop: 12 }}>
                  <h3>📋 History of Present Illness</h3>
                  <p>{report.subjective.history_of_present_illness}</p>
                </div>
              )}

              {report?.subjective?.past_medical_history && (
                <div className="summary-card" style={{ marginTop: 12 }}>
                  <h3>📁 Past Medical History</h3>
                  <p>{report.subjective.past_medical_history}</p>
                </div>
              )}

              {report?.objective?.vital_signs && Object.values(report.objective.vital_signs).some((v) => v) && (
                <div className="summary-card" style={{ marginTop: 12 }}>
                  <h3>💊 Vital Signs</h3>
                  {report.objective.vital_signs.temperature && <p>🌡️ Temperature: {report.objective.vital_signs.temperature}</p>}
                  {report.objective.vital_signs.blood_pressure && <p>🩺 Blood Pressure: {report.objective.vital_signs.blood_pressure}</p>}
                  {report.objective.vital_signs.heart_rate && <p>❤️ Heart Rate: {report.objective.vital_signs.heart_rate}</p>}
                  {report.objective.vital_signs.oxygen_saturation && <p>🫁 SpO2: {report.objective.vital_signs.oxygen_saturation}</p>}
                </div>
              )}

              {report?.assessment?.primary_diagnosis && (
                <div className="summary-card" style={{ marginTop: 20 }}>
                  <h3>🔬 Assessment</h3>
                  <p><strong>Primary:</strong> {report.assessment.primary_diagnosis}</p>
                  {report.assessment.justification && (
                    <p style={{ marginTop: 8 }}><strong>Justification:</strong> {report.assessment.justification}</p>
                  )}
                  {report.assessment.differential_diagnoses?.length > 0 && (
                    <p style={{ marginTop: 8 }}>
                      <strong>Differential:</strong> {report.assessment.differential_diagnoses.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {report?.plan?.medications?.length > 0 && (
                <>
                  <div className="results-header" style={{ marginTop: 20 }}>
                    <h2>Medications</h2>
                  </div>
                  {report.plan.medications.map((m, i) => (
                    <div key={i} className="result-card">
                      <div className="result-card-title">{m?.name || 'Medication'}</div>
                      <div className="result-card-body" style={{ marginTop: 6 }}>
                        {[m?.dosage, m?.frequency, m?.duration].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {report?.plan?.lifestyle_modifications && (
                <div style={{ marginTop: 12, padding: 16, background: 'rgba(16,185,129,0.04)', borderRadius: 12, fontSize: 14 }}>
                  <strong>Lifestyle:</strong> {report.plan.lifestyle_modifications}
                </div>
              )}

              {report?.plan?.follow_up && (
                <div style={{ marginTop: 12, padding: 16, background: 'rgba(56,182,255,0.04)', borderRadius: 12, fontSize: 14, color: '#0077CC' }}>
                  <strong>Follow-up:</strong> {report.plan.follow_up}
                </div>
              )}
            </div>
          )}

          {/* TRANSCRIPT TAB */}
          {tab === 'transcript' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {transcriptLines.length === 0 && (
                <div style={{ padding: 20, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                  No transcript available.
                </div>
              )}
              {transcriptLines.map((line, i) => {
                const isDoctor = /^(Doctor|Bác sĩ|Médecin|الطبيب):/i.test(line)
                const isPatient = /^(Patient|Bệnh nhân|المريض):/i.test(line)
                const speaker = isDoctor ? 'Doctor' : isPatient ? 'Patient' : null
                const text = speaker
                  ? line.replace(/^(Doctor|Bác sĩ|Médecin|الطبيب|Patient|Bệnh nhân|المريض):/i, '').trim()
                  : line

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isDoctor ? 'flex-start' : isPatient ? 'flex-end' : 'flex-start',
                      gap: 2,
                    }}
                  >
                    {speaker && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: isDoctor ? '#0ea5e9' : '#10b981' }}>
                        {speaker}
                      </span>
                    )}
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '10px 14px',
                        borderRadius: isDoctor ? '4px 12px 12px 12px' : isPatient ? '12px 4px 12px 12px' : '12px',
                        background: isDoctor ? 'rgba(14,165,233,0.08)' : isPatient ? 'rgba(16,185,129,0.08)' : 'rgba(0,0,0,0.04)',
                        border: `1px solid ${isDoctor ? 'rgba(14,165,233,0.2)' : isPatient ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.08)'}`,
                        fontSize: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      {text}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* SOAP TAB */}
          {tab === 'soap' && (
            <div>
              {!soapNote && (
                <div style={{ padding: 20, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                  No SOAP note generated.
                </div>
              )}
              {soapNote && (
                <>
                  <button
                    onClick={exportPDF}
                    style={{ marginBottom: 16, padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
                  >
                    📄 Export PDF
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {(() => {
                      const sections = { SUBJECTIVE: [], OBJECTIVE: [], ASSESSMENT: [], PLAN: [] }
                      const colors = {
                        SUBJECTIVE: { bg: '#eff6ff', border: '#3b82f6', badge: '#1d4ed8', label: 'S' },
                        OBJECTIVE:  { bg: '#f0fdf4', border: '#22c55e', badge: '#15803d', label: 'O' },
                        ASSESSMENT: { bg: '#fffbeb', border: '#f59e0b', badge: '#b45309', label: 'A' },
                        PLAN:       { bg: '#faf5ff', border: '#a855f7', badge: '#7e22ce', label: 'P' },
                      }
                      let current = null

                      ;(soapNote || '').split('\n').forEach(line => {
                        const trimmed = line.trim()
                        if (!trimmed) return
                        const matched = Object.keys(sections).find(k => trimmed.toUpperCase().startsWith(k))
                        if (matched) { current = matched; return }
                        if (current) sections[current].push(trimmed)
                      })

                      return Object.entries(sections).map(([section, lines]) => {
                        if (!lines.length) return null
                        const c = colors[section]
                        return (
                          <div key={section} style={{
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            borderRadius: 12,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 16px',
                              borderBottom: `1px solid ${c.border}`,
                              background: c.border + '22',
                            }}>
                              <span style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: c.badge,
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 14,
                                flexShrink: 0,
                              }}>{c.label}</span>
                              <span style={{ fontWeight: 600, fontSize: 14, color: c.badge }}>{section}</span>
                            </div>
                            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {lines.map((line, i) => {
                                const colonIdx = line.indexOf(':')
                                if (colonIdx > -1) {
                                  const label = line.substring(0, colonIdx + 1)
                                  const value = line.substring(colonIdx + 1).trim()
                                  if (value) return (
                                    <div key={i} style={{ fontSize: 13, lineHeight: 1.6 }}>
                                      <span style={{ fontWeight: 600, color: c.badge }}>{label}</span>
                                      <span style={{ color: '#374151' }}> {value}</span>
                                    </div>
                                  )
                                }
                                return <div key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{line}</div>
                              })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PATIENT TAB */}
          {tab === 'patient' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {severity && (
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: severity === 'emergency' ? '#fef2f2' : severity === 'urgent' ? '#fffbeb' : '#f0fdf4',
                    border: `2px solid ${severity === 'emergency' ? '#fca5a5' : severity === 'urgent' ? '#fcd34d' : '#86efac'}`,
                  }}
                >
                  <span style={{ fontSize: 32 }}>
                    {severity === 'emergency' ? '🚨' : severity === 'urgent' ? '⚠️' : '✅'}
                  </span>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      color: severity === 'emergency' ? '#dc2626' : severity === 'urgent' ? '#d97706' : '#16a34a',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {severity === 'emergency'
                      ? 'Emergency — Go to ER immediately'
                      : severity === 'urgent'
                      ? 'Urgent — See doctor soon'
                      : "Routine — Follow your doctor's instructions"}
                  </div>
                </div>
              )}

              {patientSummary && (
                <div style={{ padding: 20, borderRadius: 12, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>📋 What your doctor told you</h3>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8 }}>{patientSummary}</p>
                </div>
              )}

              {report?.plan?.medications?.length > 0 && (
                <div style={{ padding: 20, borderRadius: 12, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>💊 Your medications</h3>
                  {report.plan.medications.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'rgba(14,165,233,0.06)',
                        border: '1px solid rgba(14,165,233,0.2)',
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {m?.name || 'Medication'} {m?.dosage || ''}
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4, opacity: 0.7 }}>
                        {[m?.frequency, m?.duration].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {report?.plan?.follow_up && (
                <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(56,182,255,0.04)', border: '1px solid rgba(56,182,255,0.2)' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>📅 Follow-up</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{report.plan.follow_up}</p>
                </div>
              )}

              {!patientSummary && !severity && !report?.plan?.medications?.length && !report?.plan?.follow_up && (
                <div style={{ padding: 20, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                  No patient-facing information available.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}