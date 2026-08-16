import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { Modal } from './Modal'

type TaskUpdateModalProps = {
  taskId: number
  taskTitle?: string
  onClose: () => void
  onSaved: () => Promise<void>
}

export function TaskUpdateModal({
  taskId,
  taskTitle,
  onClose,
  onSaved,
}: TaskUpdateModalProps) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setError(null)
    setPending(true)
    try {
      await api.addTaskUpdate(taskId, text)
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save update')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal title={taskTitle ? `Update: ${taskTitle}` : 'Add update'} onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="form-group">
          <label className="form-label" htmlFor="overview-task-update">
            Update
          </label>
          <textarea
            id="overview-task-update"
            className="form-control"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened?"
            autoFocus
            required
          />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || !body.trim()}
          >
            Save Update
          </button>
        </div>
      </form>
    </Modal>
  )
}
