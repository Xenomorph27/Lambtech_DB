import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell.jsx'
import Overview from './pages/Overview.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
