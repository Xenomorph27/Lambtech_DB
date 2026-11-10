import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar.jsx'
import { screenTheme } from '../../lib/screens.js'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()
  const theme = screenTheme(pathname)

  return (
    // --screen is declared once here and inherited by everything below it, so
    // the whole interface re-tints on navigation without a single prop being
    // threaded down. The transition keeps that change from being a hard cut.
    <div
      className="flex h-screen overflow-hidden bg-ground transition-colors duration-200"
      style={{ '--screen': theme.accent }}
      data-screen={theme.key}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
