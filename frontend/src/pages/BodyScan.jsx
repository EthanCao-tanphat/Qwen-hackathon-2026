import { useState } from 'react'
import FileUpload from '../components/ui/FileUpload'
import { analyzeBody } from '../lib/api'

export default function BodyScan() {
  const [frontImage, setFrontImage] = useState(null)
  const [sideImage, setSideImage] = useState(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [gender, setGender] = useState('male')
  const [age, setAge] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const canSubmit = frontImage && height && weight && !loading

  const handleAnalyze = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const data = await analyzeBody(
        frontImage, sideImage,
        parseFloat(height), parseFloat(weight),
        gender, parseInt(age) || 25
      )
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const MEASUREMENT_LABELS = {
    neck_cm: 'Neck',
    shoulder_cm: 'Shoulders',
    upper_chest_cm: 'Upper Chest',
    upper_arm_cm: 'Upper Arm',
    waist_cm: 'Waist',
    hip_cm: 'Hips',
    thigh_cm: 'Thigh',
    calf_cm: 'Calf',
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-badge purple">Computer Vision · Robotics</div>
        <h1>Body Scan</h1>
        <p>Upload front and side body photos. Healix estimates body measurements and body fat percentage using the U.S. Navy Method.</p>
      </div>

      {/* Dual image upload */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FileUpload
          accept="image/*"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="7" r="4" /><path d="M5.5 21a8.5 8.5 0 0113 0" />
            </svg>
          }
          title="Front photo"
          subtitle="Required"
          file={frontImage}
          onFile={setFrontImage}
        />
        <FileUpload
          accept="image/*"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="7" r="4" /><path d="M5.5 21a8.5 8.5 0 0113 0" />
            </svg>
          }
          title="Side photo"
          subtitle="Optional"
          file={sideImage}
          onFile={setSideImage}
        />
      </div>

      {/* Form fields */}
      <div className="form-row">
        <div className="form-field">
          <label className="form-label">Height (cm)</label>
          <input className="form-input" type="number" placeholder="170" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">Weight (kg)</label>
          <input className="form-input" type="number" placeholder="70" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label">Gender</label>
          <select className="form-input form-select" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="form-field">
          <label className="form-label">Age</label>
          <input className="form-input" type="number" placeholder="25" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
      </div>

      <button className="submit-btn purple" disabled={!canSubmit} onClick={handleAnalyze}>
        {loading ? (
          <><div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> Analyzing...</>
        ) : (
          'Analyze Body Scan'
        )}
      </button>

      {error && (
        <div style={{ marginTop: 20, padding: 16, background: '#fef2f2', borderRadius: 12, color: '#dc2626', fontSize: 14 }}>
          {error}
        </div>
      )}

      {results && !loading && (
        <div className="results-area">
          {/* Body Composition Summary */}
          {results.body_composition && (
            <div className="summary-card">
              <h3>🏋️ Body Composition</h3>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: -1 }}>
                    {results.body_composition.body_fat_pct}%
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>Body Fat</div>
                </div>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: -1 }}>
                    {results.body_composition.bmi}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>BMI</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--purple)' }}>
                    {results.body_composition.category}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 4 }}>Category</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 16, fontSize: 14, color: 'var(--text-soft)' }}>
                <span>Lean mass: <strong>{results.body_composition.lean_mass_kg} kg</strong></span>
                <span>Fat mass: <strong>{results.body_composition.fat_mass_kg} kg</strong></span>
              </div>
            </div>
          )}

          {/* Measurements */}
          {results.measurements && (
            <>
              <div className="results-header"><h2>Measurements</h2></div>
              <div className="measurements-grid">
                {Object.entries(results.measurements).map(([key, val]) => (
                  <div key={key} className="measurement-item">
                    <div className="measurement-value">
                      {val}<span className="measurement-unit"> cm</span>
                    </div>
                    <div className="measurement-label">{MEASUREMENT_LABELS[key] || key}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
