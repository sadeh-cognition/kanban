import { useEffect, useRef, useState } from 'react'

type StatusColumnPickerProps = {
  columns: { name: string; count: number }[]
  hidden: string[]
  onChange: (hidden: string[] | ((prev: string[]) => string[])) => void
}

export function StatusColumnPicker({
  columns,
  hidden,
  onChange,
}: StatusColumnPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const hiddenSet = new Set(hidden)
  const visibleCount = columns.filter((column) => !hiddenSet.has(column.name)).length

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

  function toggle(name: string) {
    onChange((prev) =>
      prev.includes(name)
        ? prev.filter((item) => item !== name)
        : [...prev, name],
    )
  }

  return (
    <div className="status-column-picker" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Columns ({visibleCount}/{columns.length})
        <span className="project-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="status-column-menu" role="listbox" aria-multiselectable="true">
          <p className="project-switcher-label">Statuses</p>
          <ul className="status-column-list">
            {columns.map((column) => {
              const checked = !hiddenSet.has(column.name)
              return (
                <li key={column.name}>
                  <label className="status-column-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(column.name)}
                    />
                    <span className="status-column-option-name">{column.name}</span>
                    <span className="muted-meta">{column.count}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          {hidden.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm status-column-show-all"
              onClick={() => onChange([])}
            >
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
