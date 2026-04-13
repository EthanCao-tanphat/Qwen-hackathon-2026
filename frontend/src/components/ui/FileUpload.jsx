import { useState, useRef, useCallback } from 'react'

/**
 * Reusable file upload with drag-and-drop
 * @param {string} accept - e.g. ".pdf" or "audio/*"
 * @param {string} icon - emoji or node
 * @param {string} title - e.g. "Drop your lab report PDF"
 * @param {string} subtitle - e.g. "Supports EN, FR, AR, VN"
 * @param {function} onFile - callback(file)
 * @param {File|null} file - controlled file state
 */
export default function FileUpload({ accept, icon, title, subtitle, onFile, file }) {
  const [dragover, setDragover] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragover(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  const handleChange = (e) => {
    const f = e.target.files[0]
    if (f) onFile(f)
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div
      className={`upload-zone ${dragover ? 'dragover' : ''} ${file ? 'has-file' : ''}`}
      onClick={() => !file && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} />

      {!file ? (
        <>
          <div className="upload-icon">{icon}</div>
          <div className="upload-title">{title}</div>
          <div className="upload-subtitle">{subtitle}</div>
        </>
      ) : (
        <>
          <div className="upload-icon" style={{ background: 'rgba(0,212,170,0.08)', color: '#00D4AA' }}>✓</div>
          <div className="upload-title">File ready</div>
          <div className="upload-file-info">
            <div>
              <div className="upload-file-name">{file.name}</div>
              <div className="upload-file-size">{formatSize(file.size)}</div>
            </div>
            <button className="upload-remove" onClick={(e) => { e.stopPropagation(); onFile(null) }}>✕</button>
          </div>
        </>
      )}
    </div>
  )
}
