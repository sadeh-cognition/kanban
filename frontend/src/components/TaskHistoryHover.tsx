import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import type { HistoryEntry } from '../api/types'
import { HistoryTimeline } from './HistoryTimeline'

const SHOW_DELAY_MS = 220
const HIDE_DELAY_MS = 120
const POPOVER_WIDTH = 300
const POPOVER_MAX_HEIGHT = 360
const VIEW_MARGIN = 8
const GAP = 10

const historyCache = new Map<number, HistoryEntry[]>()

type Position = {
  top: number
  left: number
  maxHeight: number
}

function positionFor(anchor: DOMRect): Position {
  const spaceRight = window.innerWidth - anchor.right - GAP - VIEW_MARGIN
  const spaceLeft = anchor.left - GAP - VIEW_MARGIN
  let left =
    spaceRight >= POPOVER_WIDTH || spaceRight >= spaceLeft
      ? anchor.right + GAP
      : anchor.left - GAP - POPOVER_WIDTH
  left = Math.min(
    Math.max(VIEW_MARGIN, left),
    window.innerWidth - VIEW_MARGIN - POPOVER_WIDTH,
  )

  const maxHeight = Math.min(
    POPOVER_MAX_HEIGHT,
    window.innerHeight - VIEW_MARGIN * 2,
  )
  let top = anchor.top
  if (top + maxHeight > window.innerHeight - VIEW_MARGIN) {
    top = window.innerHeight - VIEW_MARGIN - maxHeight
  }
  top = Math.max(VIEW_MARGIN, top)
  return { top, left, maxHeight }
}

export function TaskHistoryHover({
  taskId,
  disabled,
  children,
}: {
  taskId: number
  disabled?: boolean
  children: ReactNode
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const showTimer = useRef(0)
  const hideTimer = useRef(0)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const [history, setHistory] = useState<HistoryEntry[] | null>(
    () => historyCache.get(taskId) ?? null,
  )
  const [error, setError] = useState<string | null>(null)

  function clearTimers() {
    window.clearTimeout(showTimer.current)
    window.clearTimeout(hideTimer.current)
  }

  function place() {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition(positionFor(rect))
  }

  function show() {
    if (disabled) return
    place()
    setOpen(true)
  }

  function hide() {
    setOpen(false)
  }

  function onEnter() {
    if (disabled) return
    window.clearTimeout(hideTimer.current)
    showTimer.current = window.setTimeout(show, SHOW_DELAY_MS)
  }

  function onLeave() {
    window.clearTimeout(showTimer.current)
    hideTimer.current = window.setTimeout(hide, HIDE_DELAY_MS)
  }

  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (disabled) {
      clearTimers()
      setOpen(false)
    }
  }, [disabled])

  useEffect(() => {
    if (!open) return

    function onViewportChange(event: Event) {
      if (
        event.type === 'scroll' &&
        popoverRef.current &&
        event.target instanceof Node &&
        popoverRef.current.contains(event.target)
      ) {
        return
      }
      hide()
    }

    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const cached = historyCache.get(taskId)
    if (cached) setHistory(cached)

    let cancelled = false
    void (async () => {
      try {
        const detail = await api.getTask(taskId)
        if (cancelled) return
        historyCache.set(taskId, detail.history)
        setHistory(detail.history)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (!historyCache.has(taskId)) {
          setError(err instanceof Error ? err.message : 'Failed to load history')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, taskId])

  return (
    <div
      ref={anchorRef}
      className="task-history-anchor"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className="task-history-popover"
            role="tooltip"
            style={{
              top: position.top,
              left: position.left,
              maxHeight: position.maxHeight,
            }}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            <h3 className="section-title">Change History</h3>
            {error ? (
              <p className="form-error">{error}</p>
            ) : history ? (
              <HistoryTimeline history={history} />
            ) : (
              <p className="muted-meta">Loading…</p>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
