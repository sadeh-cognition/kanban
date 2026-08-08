import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Project } from '../api/types'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'

export function ProjectListPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setProjects(await api.listProjects())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.createProject(name.trim())
      setName('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  async function onDelete(project: Project) {
    if (
      !window.confirm(
        'Are you sure you want to delete this project? This action cannot be undone.',
      )
    ) {
      return
    }
    await api.deleteProject(project.id)
    await load()
  }

  return (
    <Layout
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
        >
          + New Project
        </button>
      }
    >
      <div className="page-pad">
        <div className="board-header">
          <h2>Projects</h2>
        </div>
        {loading ? (
          <div className="loading-spinner">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>Get started by creating your first project.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              Create Project
            </button>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <div key={project.id} className="project-card">
                <Link
                  to={`/projects/${project.id}`}
                  className="project-card-link"
                />
                <div className="project-card-body">
                  <div>
                    <h3>{project.name}</h3>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm project-delete"
                    onClick={() => void onDelete(project)}
                    aria-label={`Delete ${project.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <Modal title="Create Project" onClose={() => setShowCreate(false)}>
          <form onSubmit={(e) => void onCreate(e)}>
            {error && <div className="form-error">{error}</div>}
            <div className="form-group">
              <label className="form-label" htmlFor="project-name">
                Name
              </label>
              <input
                id="project-name"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}
