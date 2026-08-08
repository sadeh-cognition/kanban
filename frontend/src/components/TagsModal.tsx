import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Tag } from '../api/types'
import { Modal } from './Modal'

type TagsModalProps = {
  projectId: number
  onClose: () => void
  onChanged: () => Promise<void>
}

export function TagsModal({ projectId, onClose, onChanged }: TagsModalProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setTags(await api.listTags(projectId))
  }

  useEffect(() => {
    void load()
  }, [projectId])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.createTag(projectId, name.trim(), color)
      setName('')
      await load()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag')
    }
  }

  async function onDelete(tag: Tag) {
    if (!window.confirm(`Delete tag "${tag.name}"?`)) return
    await api.deleteTag(tag.id)
    await load()
    await onChanged()
  }

  return (
    <Modal title="Manage Tags" onClose={onClose}>
      <ul className="tag-list">
        {tags.map((tag) => (
          <li key={tag.id} className="tag-list-item">
            <span className="tag-pill" style={{ backgroundColor: tag.color }}>
              {tag.name}
            </span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void onDelete(tag)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => void onCreate(e)}>
        {error && <div className="form-error">{error}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="tag-name">
            Name
          </label>
          <input
            id="tag-name"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="tag-color">
            Color
          </label>
          <input
            id="tag-color"
            type="color"
            className="form-control"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="btn btn-primary">
            Add Tag
          </button>
        </div>
      </form>
    </Modal>
  )
}
