import { useState } from 'react'
import GuidedCapture from '../components/ui/GuidedCapture'
import HeartRateScan from '../components/ui/HeartRateScan'
import { analyzeBody } from '../lib/api'

export default function BodyScan() {
  const [step, setStep] = useState('info') // 'info' → 'heartrate' → 'capture' → 'results'
  const [frontImage, setFrontImage] = useState(null)
  const [sideImage, setSideImage] = useState(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [gender, setGender] = useState('male')
  const [age, setAge] = useState('')
  const [language, setLanguage] = useState('en')
  const [heartRateData, setHeartRateData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const canProceed = height && weight

  const handleHeartRateComplete = (data) => {
    setHeartRateData(data)
    setStep('capture')
  }

  const handleHeartRateSkip = () => {
    setHeartRateData(null)
    setStep('capture')
  }

  const handleCapture = async (frontFile, sideFile) => {
    setFrontImage(frontFile)
    setSideImage(sideFile)
    setStep('results')
    setLoading(true)
    setError(null)

    try {
      const data = await analyzeBody(
        frontFile, sideFile,
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
    neck_cm: 'Neck', shoulder_cm: 'Shoulders', chest_cm: 'Chest',
    upper_chest_cm: 'Upper Chest', bust_cm: 'Bust',
    upper_arm_left_cm: 'Upper Arm (L)', upper_arm_right_cm: 'Upper Arm (R)',
    upper_arm_cm: 'Upper Arm', forearm_cm: 'Forearm', wrist_cm: 'Wrist',
    waist_cm: 'Waist', abdomen_cm: 'Abdomen', hip_cm: 'Hips',
    thigh_left_cm: 'Thigh (L)', thigh_right_cm: 'Thigh (R)',
    thigh_cm: 'Thigh', knee_cm: 'Knee',
    calf_left_cm: 'Calf (L)', calf_right_cm: 'Calf (R)',
    calf_cm: 'Calf', ankle_cm: 'Ankle',
    shoulder_width_cm: 'Shoulder Width', arm_length_cm: 'Arm Length',
    inseam_cm: 'Inseam', torso_length_cm: 'Torso Length', total_leg_length_cm: 'Leg Length',
  }

  // ─── Step 1: Basic Info ──────────────────────────────────────
  if (step === 'info') {
    return (
      <div>
        <div className="page-header">
          <div className="page-badge purple">Computer Vision · AI</div>
          <h1>Body Scan</h1>
          <p>
            {language === 'vi'
              ? 'Quét nhịp tim, sau đó chụp ảnh trước và bên. Healix phân tích sức khỏe toàn diện.'
              : 'Scan your heart rate, then capture front and side body photos for comprehensive health analysis.'}
          </p>
        </div>

        {/* Flow indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, margin: '20px 0 30px', flexWrap: 'wrap' }}>
          <FlowStep num="1" label={language === 'vi' ? 'Thông tin' : 'Info'} active />
          <FlowStep num="2" label={language === 'vi' ? 'Nhịp tim' : 'Heart Rate'} />
          <FlowStep num="3" label={language === 'vi' ? 'Chụp ảnh' : 'Photos'} />
          <FlowStep num="4" label={language === 'vi' ? 'Kết quả' : 'Results'} />
        </div>

        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="form-field">
            <label className="form-label">Language</label>
            <select className="form-input form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="form-label">{language === 'vi' ? 'Chiều cao (cm)' : 'Height (cm)'}</label>
            <input className="form-input" type="number" placeholder="170" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">{language === 'vi' ? 'Cân nặng (kg)' : 'Weight (kg)'}</label>
            <input className="form-input" type="number" placeholder="70" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">{language === 'vi' ? 'Giới tính' : 'Gender'}</label>
            <select className="form-input form-select" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="male">{language === 'vi' ? 'Nam' : 'Male'}</option>
              <option value="female">{language === 'vi' ? 'Nữ' : 'Female'}</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">{language === 'vi' ? 'Tuổi' : 'Age'}</label>
            <input className="form-input" type="number" placeholder="25" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
        </div>

        <button
          className="submit-btn purple"
          disabled={!canProceed}
          onClick={() => setStep('heartrate')}
          style={{ marginTop: 20 }}
        >
          {language === 'vi' ? 'Tiếp tục quét nhịp tim →' : 'Continue to heart rate →'}
        </button>
      </div>
    )
  }

  // ─── Step 2: Heart Rate ──────────────────────────────────────
  if (step === 'heartrate') {
    return (
      <HeartRateScan
        language={language}
        onComplete={handleHeartRateComplete}
        onSkip={handleHeartRateSkip}
      />
    )
  }

  // ─── Step 3: Capture ─────────────────────────────────────────
  if (step === 'capture') {
    return (
      <GuidedCapture
        language={language}
        onCapture={handleCapture}
        onCancel={() => setStep('info')}
      />
    )
  }

  // ─── Step 4: Results ─────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div className="page-badge purple">Results</div>
        <h1>Body Scan</h1>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>
            {language === 'vi' ? 'Đang phân tích ảnh...' : 'Analyzing your photos...'}
          </p>
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: 20, background: '#fef2f2', borderRadius: 12, color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
          {error}
          <button
            style={{ display: 'block', marginTop: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
            onClick={() => { setStep('capture'); setError(null); setResults(null) }}
          >
            {language === 'vi' ? '↻ Thử lại' : '↻ Try again'}
          </button>
        </div>
      )}

      {results && !loading && (
        <div className="results-area">
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {frontImage && (
              <img src={URL.createObjectURL(frontImage)} alt="Front" style={{ width: 80, height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
            )}
            {sideImage && (
              <img src={URL.createObjectURL(sideImage)} alt="Side" style={{ width: 80, height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
            )}
          </div>

          {/* Heart Rate Card */}
          {heartRateData && (
            <div className="summary-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                Heart Rate
              </h3>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 42, fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: -1, color: '#ef4444' }}>
                    {heartRateData.bpm || 0}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>BPM</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{heartRateData.zone || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>Zone</div>
                </div>
                {heartRateData.hrv_sdnn && (
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{heartRateData.hrv_sdnn.toFixed(1)}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>HRV</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{Math.round((heartRateData.confidence || 0) * 100)}%</div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>Confidence</div>
                </div>
              </div>
            </div>
          )}

          {results.body_composition && (
            <div className="summary-card">
              <h3>Body Composition</h3>
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
              <div style={{ display: 'flex', gap: 24, marginTop: 16, fontSize: 14, color: 'var(--text-soft)', flexWrap: 'wrap' }}>
                <span>Lean mass: <strong>{results.body_composition.lean_mass_kg} kg</strong></span>
                <span>Fat mass: <strong>{results.body_composition.fat_mass_kg} kg</strong></span>
                <span>BMR: <strong>{results.body_composition.bmr_kcal} kcal</strong></span>
                <span>WHR: <strong>{results.body_composition.waist_hip_ratio}</strong>
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: results.body_composition.whr_risk === 'low' ? '#dcfce7' : results.body_composition.whr_risk === 'moderate' ? '#fef9c3' : '#fee2e2',
                    color: results.body_composition.whr_risk === 'low' ? '#166534' : results.body_composition.whr_risk === 'moderate' ? '#854d0e' : '#991b1b',
                  }}>{results.body_composition.whr_risk} risk</span>
                </span>
              </div>
            </div>
          )}

          {results.measurements && (
            <>
              <div className="results-header"><h2>Measurements</h2></div>
              <div className="measurements-grid">
                {Object.entries(results.measurements).map(([key, val]) => {
                  const confidence = results.measurement_confidence?.[key] || 0.5
                  return (
                    <div key={key} className="measurement-item" style={{ opacity: confidence < 0.3 ? 0.5 : 1 }}>
                      <div className="measurement-value">
                        {typeof val === 'number' ? val.toFixed(1) : val}
                        <span className="measurement-unit"> cm</span>
                      </div>
                      <div className="measurement-label">
                        {MEASUREMENT_LABELS[key] || key.replace(/_cm$/, '').replace(/_/g, ' ')}
                      </div>
                      {confidence < 0.5 && (
                        <div style={{ fontSize: 10, color: '#eab308', marginTop: 2 }}>⚠ Low confidence</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {results.posture && results.posture.overall_score && (
            <>
              <div className="results-header"><h2>Posture Analysis</h2></div>
              <div className="summary-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--mono)' }}>
                    {results.posture.overall_score}/10
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-soft)' }}>Posture Score</div>
                </div>
                {results.posture.summary && (
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-soft)' }}>{results.posture.summary}</p>
                )}
              </div>
            </>
          )}

          {results.health_insights && (
            <>
              <div className="results-header"><h2>Health Insights</h2></div>
              <div className="summary-card">
                {results.health_insights.body_shape && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>Body Shape: </span>
                    <strong>{results.health_insights.body_shape}</strong>
                  </div>
                )}
                {results.health_insights.summary && (
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-soft)' }}>{results.health_insights.summary}</p>
                )}
                {results.health_insights.health_suggestions && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Suggestions:</div>
                    {results.health_insights.health_suggestions.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, color: 'var(--text-soft)', padding: '4px 0', lineHeight: 1.5 }}>
                        {i + 1}. {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <button
            className="submit-btn purple"
            style={{ marginTop: 20 }}
            onClick={() => {
              setStep('info'); setResults(null); setError(null);
              setFrontImage(null); setSideImage(null); setHeartRateData(null)
            }}
          >
            {language === 'vi' ? '↻ Quét lại' : '↻ Scan again'}
          </button>
        </div>
      )}
    </div>
  )
}

function FlowStep({ num, label, active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: active ? 1 : 0.4 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: active ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'rgba(255,255,255,0.08)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13,
      }}>{num}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
    </div>
  )
}