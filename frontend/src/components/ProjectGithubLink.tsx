import { useState, type FormEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import type { Project } from '../api/types'
import { Modal } from './Modal'

function displayGithubUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function openInNewTab(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  event.stopPropagation()
  const tab = window.open(event.currentTarget.href, '_blank')
  if (tab) {
    tab.opener = null
    tab.focus()
  }
}

export function ProjectGithubLink({
  project,
  onUpdated,
}: {
  project: Project
  onUpdated: (project: Project) => void
}) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(project.github_url)
  const [error, setError] = useState<string | null>(null)

  function openEditor() {
    setUrl(project.github_url)
    setError(null)
    setEditing(true)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const updated = await api.updateProject(project.id, url.trim())
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save GitHub link')
    }
  }

  return (
    <>
      {project.github_url ? (
        <div className="project-github">
          <a
            href={project.github_url}
            className="project-github-link"
            onClick={openInNewTab}
          >
            {displayGithubUrl(project.github_url)}
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-sm project-github-action"
            onClick={openEditor}
            aria-label={`Edit GitHub link for ${project.name}`}
          >
            Edit
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm project-github-action"
          onClick={openEditor}
        >
          Add GitHub link
        </button>
      )}

      {editing &&
        createPortal(
          <Modal title="GitHub link" onClose={() => setEditing(false)}>
            <form onSubmit={(e) => void onSave(e)}>
              {error && <div className="form-error">{error}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="project-github-url">
                  GitHub URL
                </label>
                <input
                  id="project-github-url"
                  className="form-control"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  autoFocus
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </Modal>,
          document.body,
        )}
    </>
  )
}
