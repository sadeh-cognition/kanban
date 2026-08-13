import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { ReactNode } from 'react'
import { ProjectSwitcher } from './ProjectSwitcher'

type LayoutProps = {
  children: ReactNode
  actions?: ReactNode
}

export function Layout({ children, actions }: LayoutProps) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h1>
                Kanban<span>Flow</span>
              </h1>
            </Link>
          </div>
          {user && (
            <nav className="header-nav">
              <Link
                to="/"
                className={pathname === '/' ? 'is-active' : undefined}
              >
                Projects
              </Link>
              <Link
                to="/status"
                className={pathname === '/status' ? 'is-active' : undefined}
              >
                By Status
              </Link>
            </nav>
          )}
        </div>
        <div className="header-actions">
          {user && <ProjectSwitcher />}
          {user && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginRight: '0.5rem' }}
              onClick={() => void logout()}
            >
              Log Out ({user.username})
            </button>
          )}
          {actions}
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  )
}
