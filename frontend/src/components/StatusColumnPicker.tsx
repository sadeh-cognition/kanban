import { useEffect, useRef, useState } from 'react'

export type StatusFilterItem = {
  id: string
  name: string
  count: number
}

type StatusFilterPickerProps = {
  label: string
  menuTitle: string
  items: StatusFilterItem[]
  hidden: string[]
  onChange: (hidden: string[] | ((prev: string[]) => string[])) => void
}

export function StatusFilterPicker({
  label,
  menuTitle,
  items,
  hidden,
  onChange,
}: StatusFilterPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const hiddenSet = new Set(hidden)
  const visibleCount = items.filter((item) => !hiddenSet.has(item.id)).length

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

  function toggle(id: string) {
    onChange((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
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
        {label} ({visibleCount}/{items.length})
        <span className="project-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="status-column-menu" role="listbox" aria-multiselectable="true">
          <p className="project-switcher-label">{menuTitle}</p>
          <ul className="status-column-list">
            {items.map((item) => {
              const checked = !hiddenSet.has(item.id)
              return (
                <li key={item.id}>
                  <label className="status-column-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="status-column-option-name">{item.name}</span>
                    <span className="muted-meta">{item.count}</span>
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
