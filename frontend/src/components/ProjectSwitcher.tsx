import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Project } from '../api/types'
import { useProjectSwitchList } from '../hooks/useProjectSwitchList'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function ProjectSwitcher() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const currentId = projectId ? Number(projectId) : null
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const { ids, switchList, add, remove } = useProjectSwitchList(
    projects,
    projectsLoaded,
  )
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        setProjects(await api.listProjects())
        setProjectsLoaded(true)
      } catch {
        setProjects([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    void (async () => {
      try {
        setProjects(await api.listProjects())
      } catch {
        /* keep previous list */
      }
    })()
  }, [open])

  const switchIdSet = new Set(switchList.map((project) => project.id))
  const availableToAdd = projects.filter((project) => !switchIdSet.has(project.id))
  const currentProject =
    currentId !== null
      ? projects.find((project) => project.id === currentId)
      : null

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (isEditableTarget(event.target)) return
      if (switchList.length === 0) return

      event.preventDefault()

      let nextIndex: number
      if (
        currentId === null ||
        !switchList.some((project) => project.id === currentId)
      ) {
        nextIndex = event.key === 'ArrowRight' ? 0 : switchList.length - 1
      } else {
        const index = switchList.findIndex((project) => project.id === currentId)
        if (event.key === 'ArrowRight') {
          nextIndex = (index + 1) % switchList.length
        } else {
          nextIndex = (index - 1 + switchList.length) % switchList.length
        }
      }

      const next = switchList[nextIndex]
      if (next && next.id !== currentId) {
        navigate(`/projects/${next.id}`)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentId, navigate, switchList])

  function goToProject(id: number) {
    setOpen(false)
    if (id !== currentId) {
      navigate(`/projects/${id}`)
    }
  }

  return (
    <div className="project-switcher" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost project-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {currentProject?.name ?? 'Projects'}
        <span className="project-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="project-switcher-menu" role="listbox">
          <div className="project-switcher-section">
            <p className="project-switcher-label">Switch list</p>
            {switchList.length === 0 ? (
              <p className="project-switcher-empty">
                No projects in the list. Add some below.
              </p>
            ) : (
              <ul className="project-switcher-list">
                {switchList.map((project) => (
                  <li key={project.id} className="project-switcher-item">
                    <button
                      type="button"
                      className={
                        project.id === currentId
                          ? 'project-switcher-link is-active'
                          : 'project-switcher-link'
                      }
                      role="option"
                      aria-selected={project.id === currentId}
                      onClick={() => goToProject(project.id)}
                    >
                      {project.name}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm project-switcher-remove"
                      aria-label={`Remove ${project.name} from switch list`}
                      onClick={() => remove(project.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {ids.length > 0 && (
              <p className="project-switcher-hint">Ctrl + ← / → to cycle</p>
            )}
          </div>

          <div className="project-switcher-section">
            <p className="project-switcher-label">Add to list</p>
            {availableToAdd.length === 0 ? (
              <p className="project-switcher-empty">
                {projects.length === 0
                  ? 'No projects available.'
                  : 'All projects are already in the list.'}
              </p>
            ) : (
              <ul className="project-switcher-list">
                {availableToAdd.map((project) => (
                  <li key={project.id} className="project-switcher-item">
                    <button
                      type="button"
                      className="project-switcher-link"
                      onClick={() => add(project.id)}
                    >
                      + {project.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
