import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/ui/Layout'
import Landing from './pages/Landing'
import Labs from './pages/Labs'
import Scribe from './pages/Scribe'
import BodyScan from './pages/BodyScan'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Layout />}>
          <Route path="/labs" element={<Labs />} />
          <Route path="/scribe" element={<Scribe />} />
          <Route path="/bodyscan" element={<BodyScan />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
