import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Board, BoardPayload, Tag } from '../api/types'
import { BoardCanvas } from '../components/BoardCanvas'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { TagsModal } from '../components/TagsModal'
import { TaskModal } from '../components/TaskModal'

export function BoardPage() {
  const { projectId } = useParams()
  const id = Number(projectId)
  const [payload, setPayload] = useState<BoardPayload | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [showTags, setShowTags] = useState(false)
  const [showColumn, setShowColumn] = useState(false)
  const [columnName, setColumnName] = useState('')
  const [createTaskColumnId, setCreateTaskColumnId] = useState<number | null>(
    null,
  )
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskTagIds, setTaskTagIds] = useState<number[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const boardPayload = await api.getBoard(id)
    setPayload(boardPayload)
    setTags(await api.listTags(id))
  }, [id])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await load()
      } finally {
        setLoading(false)
      }
    })()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  function onBoardChange(board: Board) {
    setPayload((prev) => (prev ? { ...prev, board } : prev))
  }

  async function onError(message: string) {
    setToast(message)
    await load()
  }

  async function createColumn(e: FormEvent) {
    e.preventDefault()
    if (!payload) return
    await api.createColumn(payload.board.id, columnName.trim())
    setColumnName('')
    setShowColumn(false)
    await load()
  }

  async function createTask(e: FormEvent) {
    e.preventDefault()
    if (createTaskColumnId === null) return
    await api.createTask(createTaskColumnId, {
      title: taskTitle.trim(),
      description: taskDescription,
      tags: taskTagIds,
    })
    setTaskTitle('')
    setTaskDescription('')
    setTaskTagIds([])
    setCreateTaskColumnId(null)
    await load()
  }

  async function markHistoryReviewed() {
    if (
      !window.confirm('Mark this history as reviewed and delete it?')
    ) {
      return
    }
    await api.deleteHistory(id)
    await load()
  }

  if (loading || !payload) {
    return (
      <Layout>
        <div className="loading-spinner">Loading board…</div>
      </Layout>
    )
  }

  return (
    <Layout
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginRight: '0.5rem' }}
            onClick={() => setShowTags(true)}
          >
            Manage Tags
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowColumn(true)}
          >
            + New Column
          </button>
        </>
      }
    >
      <div className="board-header">
        <p className="breadcrumb">
          <Link to="/">Projects</Link> / {payload.project.name}
        </p>
        <h2>{payload.board.name}</h2>
      </div>

      {payload.history_content && (
        <div className="history-banner">
          <div className="section-row">
            <h3>Unreviewed Task History</h3>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void markHistoryReviewed()}
            >
              Mark as Reviewed (Delete)
            </button>
          </div>
          <pre>{payload.history_content}</pre>
        </div>
      )}

      <BoardCanvas
        board={payload.board}
        onBoardChange={onBoardChange}
        onOpenTask={setSelectedTaskId}
        onCreateTask={setCreateTaskColumnId}
        onError={(message) => void onError(message)}
      />

      {toast && <div className="toast toast-error">{toast}</div>}

      {showTags && (
        <TagsModal
          projectId={id}
          onClose={() => setShowTags(false)}
          onChanged={load}
        />
      )}

      {showColumn && (
        <Modal title="New Column" onClose={() => setShowColumn(false)}>
          <form onSubmit={(e) => void createColumn(e)}>
            <div className="form-group">
              <label className="form-label" htmlFor="column-name">
                Name
              </label>
              <input
                id="column-name"
                className="form-control"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowColumn(false)}
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

      {createTaskColumnId !== null && (
        <Modal
          title="New Task"
          onClose={() => setCreateTaskColumnId(null)}
        >
          <form onSubmit={(e) => void createTask(e)}>
            <div className="form-group">
              <label className="form-label" htmlFor="task-title">
                Title
              </label>
              <input
                id="task-title"
                className="form-control"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="task-desc">
                Description
              </label>
              <textarea
                id="task-desc"
                className="form-control"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
              />
            </div>
            {tags.length > 0 && (
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div className="tag-checklist">
                  {tags.map((tag) => {
                    const checked = taskTagIds.includes(tag.id)
                    return (
                      <label key={tag.id} className="tag-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setTaskTagIds((prev) =>
                              checked
                                ? prev.filter((x) => x !== tag.id)
                                : [...prev, tag.id],
                            )
                          }
                        />
                        <span
                          className="tag-pill"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreateTaskColumnId(null)}
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

      {selectedTaskId !== null && (
        <TaskModal
          taskId={selectedTaskId}
          projectTags={tags}
          onClose={() => setSelectedTaskId(null)}
          onChanged={load}
        />
      )}
    </Layout>
  )
}
