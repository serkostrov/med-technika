import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  ClipboardList,
  Download,
  Library,
  LogOut,
  Settings,
  Upload,
  type LucideProps,
} from 'lucide-react'
import { useAuth } from '@/client/auth-context'
import type { ReactNode } from 'react'

const navIconProps: LucideProps = {
  size: 16,
  strokeWidth: 1.75,
  'aria-hidden': true,
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <span className="sidebar__icon" aria-hidden="true">
      {children}
    </span>
  )
}

const ICONS = {
  registry: (
    <NavIcon>
      <ClipboardList {...navIconProps} />
    </NavIcon>
  ),
  upload: (
    <NavIcon>
      <Upload {...navIconProps} />
    </NavIcon>
  ),
  export: (
    <NavIcon>
      <Download {...navIconProps} />
    </NavIcon>
  ),
  journal: (
    <NavIcon>
      <BookOpen {...navIconProps} />
    </NavIcon>
  ),
  dictionaries: (
    <NavIcon>
      <Library {...navIconProps} />
    </NavIcon>
  ),
  settings: (
    <NavIcon>
      <Settings {...navIconProps} />
    </NavIcon>
  ),
}

export function Sidebar() {
  const { session, capabilities, logout } = useAuth()

  const nav: {
    to: string
    label: string
    icon: ReactNode
    end?: boolean
    visible?: boolean
  }[] = [
    { to: '/', label: 'Реестр', icon: ICONS.registry, end: true, visible: true },
    { to: '/upload', label: 'Загрузка', icon: ICONS.upload, visible: true },
    {
      to: '/export',
      label: 'Выгрузка',
      icon: ICONS.export,
      visible: Boolean(capabilities?.canBuildXml),
    },
    { to: '/journal', label: 'Журнал', icon: ICONS.journal, visible: true },
    {
      to: '/dictionaries',
      label: 'Справочники',
      icon: ICONS.dictionaries,
      visible: true,
    },
    {
      to: '/settings',
      label: 'Настройки',
      icon: ICONS.settings,
      visible: Boolean(capabilities?.canManageUsers),
    },
  ]

  const initials =
    session?.email?.slice(0, 2).toUpperCase() ??
    (session?.role === 'head' ? 'НИ' : 'ИН')

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__mark" aria-hidden="true">
          МТ
        </div>
        <div className="sidebar__brand-text">
          <p className="sidebar__org">Медтехника</p>
          <p className="sidebar__meta">Испытательная лаборатория</p>
        </div>
      </div>

      <p className="sidebar__nav-label">Разделы</p>
      <nav className="sidebar__nav" aria-label="Основное меню">
        {nav
          .filter((item) => item.visible !== false)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? 'sidebar__link sidebar__link--active'
                  : 'sidebar__link'
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="sidebar__user">
        <div className="sidebar__avatar" aria-hidden="true">
          {initials}
        </div>
        <p className="sidebar__user-info">
          <span className="sidebar__user-role">
            {session?.role === 'head' ? 'Начальник ИЛ' : 'Инженер'}
          </span>
          <span className="sidebar__user-email">{session?.email}</span>
        </p>
        <button
          type="button"
          className="sidebar__logout"
          onClick={logout}
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
