import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { ReactNode } from 'react'

type LayoutProps = {
  children: ReactNode
  actions?: ReactNode
}

export function Layout({ children, actions }: LayoutProps) {
  const { user, logout } = useAuth()

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1>
              Kanban<span>Flow</span>
            </h1>
          </Link>
        </div>
        <div className="header-actions">
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
