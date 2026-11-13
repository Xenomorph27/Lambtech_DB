import { NavLink } from 'react-router-dom'
import { accentFor } from '../../lib/screens.js'
import { useAuth } from '../auth/AuthGate.jsx'
import {
  Briefcase,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  GaugeCircle,
  Inbox,
  LogOut,
  MailX,
  MessageSquareReply,
  Send,
  UserRound,
  Users,
} from 'lucide-react'

/**
 * Navigation in the order the pipeline runs: emails go out, replies come in,
 * the positive ones become leads, leads become paid work. Records and the
 * safety list sit apart from that flow. The grouping is the information.
 */
const GROUPS = [
  {
    heading: null,
    items: [{ to: '/', label: 'Overview', icon: GaugeCircle, end: true }],
  },
  {
    heading: 'Pipeline',
    items: [
      { to: '/enquiries', label: 'Enquiries', icon: Inbox },
      { to: '/emails', label: 'Emails sent', icon: Send },
      { to: '/responses', label: 'Responses', icon: MessageSquareReply },
      { to: '/leads', label: 'Leads', icon: UserRound },
      { to: '/transactions', label: 'Transactions', icon: Briefcase },
    ],
  },
  {
    heading: 'Records',
    items: [
      { to: '/contacts', label: 'Contacts', icon: Users },
      { to: '/companies', label: 'Companies', icon: Building2 },
    ],
  },
  {
    heading: 'Safety',
    items: [{ to: '/suppressions', label: 'Do-not-email', icon: MailX }],
  },
]

export function Sidebar({ collapsed, onToggle }) {
  const { email, signOut } = useAuth()
  return (
    <nav
      aria-label="Main"
      className={
        'flex shrink-0 flex-col border-r border-rule bg-chrome transition-[width] duration-150 ' +
        (collapsed ? 'w-[52px]' : 'w-[196px]')
      }
    >
      <div className="flex h-11 items-center gap-2 border-b border-rule px-3">
        {/* The mark carries the current screen's hue, so the brand doubles as
            a constant read-out of where you are. */}
        <span
          aria-hidden="true"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] text-[11px] font-semibold text-[#04121f] transition-colors duration-200"
          style={{ backgroundColor: 'var(--screen)' }}
        >
          L
        </span>
        {!collapsed && (
          <span className="truncate text-sm font-medium tracking-tight text-ink">
            LambTech Desk
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {GROUPS.map((group, index) => (
          <div key={group.heading ?? index} className={group.heading ? 'mt-3' : ''}>
            {group.heading && !collapsed && (
              <div className="px-3 pb-1 text-2xs text-ink-3">{group.heading}</div>
            )}
            {group.heading && collapsed && <div className="mx-3 mb-1.5 border-t border-rule" />}
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      'group mx-1.5 flex h-7 items-center gap-2 rounded-control px-1.5 ' +
                      'transition-colors ' +
                      (isActive
                        ? 'text-ink'
                        : 'text-ink-2 hover:bg-raised hover:text-ink')
                    }
                    style={({ isActive }) =>
                      isActive
                        ? {
                            // The destination's own hue, at a strength that
                            // marks the row without shouting over the label,
                            // plus a solid bar on the leading edge.
                            backgroundColor:
                              'color-mix(in oklab, ' + accentFor(item.to) + ' 20%, transparent)',
                            boxShadow: 'inset 2px 0 0 0 ' + accentFor(item.to),
                          }
                        : undefined
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          size={15}
                          className="shrink-0 transition-colors"
                          // Each destination previews its own colour on hover,
                          // so the palette teaches itself as you move around.
                          style={isActive ? { color: accentFor(item.to) } : undefined}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-rule p-1.5">
        {signOut && (
          <button
            type="button"
            onClick={signOut}
            title={collapsed ? 'Sign out ' + email : undefined}
            className="mb-0.5 flex h-7 w-full items-center gap-2 rounded-control px-1.5 text-ink-3 hover:bg-raised hover:text-ink"
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && (
              <span className="min-w-0 text-left text-xs">
                <span className="block">Sign out</span>
              </span>
            )}
          </button>
        )}
        {signOut && !collapsed && (
          <div className="truncate px-1.5 pb-1 text-2xs text-ink-3" title={email}>
            {email}
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="flex h-7 w-full items-center gap-2 rounded-control px-1.5 text-ink-3 hover:bg-raised hover:text-ink"
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </nav>
  )
}
