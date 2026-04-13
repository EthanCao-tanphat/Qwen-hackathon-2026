import { Outlet, NavLink, Link } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="app-layout">
      <nav className="app-nav">
        <Link to="/" className="app-nav-logo">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L2 8v12l12 6 12-6V8L14 2z" fill="url(#lg)" />
            <path d="M14 8v12M8 11v6M20 11v6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <defs>
              <linearGradient id="lg" x1="2" y1="2" x2="26" y2="26">
                <stop stopColor="#38B6FF" /><stop offset="1" stopColor="#00D4AA" />
              </linearGradient>
            </defs>
          </svg>
          Healix
        </Link>

        <div className="app-nav-links">
          <NavLink to="/labs" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
            Labs
          </NavLink>
          <NavLink to="/scribe" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
            Scribe
          </NavLink>
          <NavLink to="/bodyscan" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
            Body Scan
          </NavLink>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
