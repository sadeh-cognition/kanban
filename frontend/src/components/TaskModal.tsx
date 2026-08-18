import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { ColumnName, Tag, TaskDetail, User } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { HistoryTimeline } from './HistoryTimeline'
import { Modal } from './Modal'

type TaskModalProps = {
  taskId: number
  projectTags: Tag[]
  columns: ColumnName[]
  onClose: () => void
  onChanged: () => Promise<void>
}

export function TaskModal({
  taskId,
  projectTags,
  columns,
  onClose,
  onChanged,
}: TaskModalProps) {
  const { user } = useAuth()
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | ''>('')
  const [selectedTags, setSelectedTags] = useState<number[]>([])
  const [detailsDirty, setDetailsDirty] = useState(false)
  const [assignDirty, setAssignDirty] = useState(false)
  const [tagsDirty, setTagsDirty] = useState(false)
  const [statusPending, setStatusPending] = useState(false)
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  const [updateBody, setUpdateBody] = useState('')
  const [updatePending, setUpdatePending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [detail, userList] = await Promise.all([
        api.getTask(taskId),
        api.listUsers(),
      ])
      setTask(detail)
      setUsers(userList)
      setTitle(detail.title)
      setDescription(detail.description)
      setAssigneeId(detail.assigned_to?.id ?? '')
      setSelectedTags(detail.tags.map((t) => t.id))
    })()
  }, [taskId])

  async function saveDetails(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.updateTask(taskId, title, description)
      setDetailsDirty(false)
      await onChanged()
      setTask(await api.getTask(taskId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save details')
    }
  }

  async function saveAssignment(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.assignTask(taskId, assigneeId === '' ? null : Number(assigneeId))
      setAssignDirty(false)
      await onChanged()
      setTask(await api.getTask(taskId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assignment')
    }
  }

  async function assignToMe() {
    if (!user) return
    setAssigneeId(user.id)
    setAssignDirty(true)
    await api.assignTask(taskId, user.id)
    setAssignDirty(false)
    await onChanged()
    setTask(await api.getTask(taskId))
  }

  async function saveTags(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.updateTaskTags(taskId, selectedTags)
      setTagsDirty(false)
      await onChanged()
      setTask(await api.getTask(taskId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tags')
    }
  }

  async function changeStatus(columnId: number) {
    if (!task || columnId === task.column_id) return
    setError(null)
    setStatusPending(true)
    try {
      await api.moveTask(taskId, columnId, 10_000)
      await onChanged()
      setTask(await api.getTask(taskId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change status')
    } finally {
      setStatusPending(false)
    }
  }

  async function saveUpdate(e: FormEvent) {
    e.preventDefault()
    const body = updateBody.trim()
    if (!body) return
    setError(null)
    setUpdatePending(true)
    try {
      const updated = await api.addTaskUpdate(taskId, body)
      setUpdateBody('')
      setShowUpdateForm(false)
      setTask(updated)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save update')
    } finally {
      setUpdatePending(false)
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this task?')) return
    await api.deleteTask(taskId)
    await onChanged()
    onClose()
  }

  if (!task) {
    return (
      <Modal title="Task" onClose={onClose} wide>
        <div className="loading-spinner">Loading…</div>
      </Modal>
    )
  }

  return (
    <Modal title="Task details" onClose={onClose} wide>
      {error && <div className="form-error">{error}</div>}

      <form onSubmit={(e) => void saveDetails(e)}>
        <div className="form-group">
          <input
            className="form-control task-title-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setDetailsDirty(true)
            }}
            required
          />
          <p className="muted-meta">
            #{task.project_task_id ?? task.id}
          </p>
        </div>
        <div className="form-group">
          <div className="section-row">
            <label className="form-label">Description</label>
            {detailsDirty && (
              <button type="submit" className="btn btn-sm btn-primary">
                Save Details
              </button>
            )}
          </div>
          <textarea
            className="form-control"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setDetailsDirty(true)
            }}
            placeholder="Add a more detailed description…"
          />
        </div>
      </form>

      <div className="task-side-grid">
        <div>
          <h3 className="section-title">Status</h3>
          <select
            className="form-control"
            value={task.column_id}
            disabled={!task.assigned_to || statusPending}
            title={
              task.assigned_to
                ? undefined
                : 'Assign the task before changing status'
            }
            onChange={(e) => void changeStatus(Number(e.target.value))}
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
          {!task.assigned_to && (
            <p className="muted-meta">Assign the task before changing status</p>
          )}
        </div>

        <form onSubmit={(e) => void saveAssignment(e)}>
          <div className="section-row">
            <h3 className="section-title">Assignee</h3>
            {user && assigneeId !== user.id && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => void assignToMe()}
              >
                Assign to me
              </button>
            )}
          </div>
          <select
            className="form-control"
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value === '' ? '' : Number(e.target.value))
              setAssignDirty(true)
            }}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
          {assignDirty && (
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Save Assignment
            </button>
          )}
        </form>

        <form onSubmit={(e) => void saveTags(e)}>
          <h3 className="section-title">Tags</h3>
          {projectTags.length === 0 ? (
            <p className="muted-meta">No tags available.</p>
          ) : (
            <div className="tag-checklist">
              {projectTags.map((tag) => {
                const checked = selectedTags.includes(tag.id)
                return (
                  <label key={tag.id} className="tag-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedTags((prev) =>
                          checked
                            ? prev.filter((id) => id !== tag.id)
                            : [...prev, tag.id],
                        )
                        setTagsDirty(true)
                      }}
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
          )}
          {tagsDirty && (
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Save Tags
            </button>
          )}
        </form>
      </div>

      <div className="history-block">
        <div className="section-row">
          <h3 className="section-title">Change History</h3>
          {!showUpdateForm && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setShowUpdateForm(true)}
            >
              Update
            </button>
          )}
        </div>
        {showUpdateForm && (
          <form onSubmit={(e) => void saveUpdate(e)} className="update-form">
            <div className="form-group">
              <label className="form-label" htmlFor="task-update-body">
                Update
              </label>
              <textarea
                id="task-update-body"
                className="form-control"
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                placeholder="What happened?"
                autoFocus
                required
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowUpdateForm(false)
                  setUpdateBody('')
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={updatePending || !updateBody.trim()}
              >
                Save Update
              </button>
            </div>
          </form>
        )}
        <HistoryTimeline history={task.history} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-danger" onClick={() => void onDelete()}>
          Delete Task
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
