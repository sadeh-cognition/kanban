import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import type { StatusTask } from '../api/types'

type Group = {
  name: string
  tasks: StatusTask[]
}

type Position = { x: number; y: number }

type StatusGroupsCanvasProps = {
  groups: Group[]
  pendingTaskIds: Set<number>
  onChangeStatus: (task: StatusTask, columnId: number) => void
  onOpenTask: (task: StatusTask) => void
}

const STORAGE_KEY = 'kanban.statusGroupPositions.v2'
const LEGACY_STORAGE_KEY = 'kanban.statusGroupPositions'
const GROUP_WIDTH = 320
const GROUP_MAX_HEIGHT = 640
const GROUP_GAP = 24
const GRID_COLS = 3
const ROW_STRIDE = GROUP_MAX_HEIGHT + GROUP_GAP
const LEGACY_ROW_STRIDE = 440

type DragState = {
  name: string
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
}

function parsePositions(raw: string | null): Record<string, Position> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const next: Record<string, Position> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === 'object' &&
        'x' in value &&
        'y' in value &&
        typeof value.x === 'number' &&
        typeof value.y === 'number'
      ) {
        next[key] = { x: value.x, y: value.y }
      }
    }
    return next
  } catch {
    return {}
  }
}

function migrateLegacyPosition(position: Position): Position {
  const row = (position.y - GROUP_GAP) / LEGACY_ROW_STRIDE
  if (row >= 0 && Number.isInteger(row)) {
    return { x: position.x, y: GROUP_GAP + row * ROW_STRIDE }
  }
  return position
}

function readPositions(): Record<string, Position> {
  const current = parsePositions(localStorage.getItem(STORAGE_KEY))
  if (Object.keys(current).length > 0) return current

  const legacy = parsePositions(localStorage.getItem(LEGACY_STORAGE_KEY))
  const migrated: Record<string, Position> = {}
  for (const [name, position] of Object.entries(legacy)) {
    migrated[name] = migrateLegacyPosition(position)
  }
  if (Object.keys(migrated).length > 0) {
    writePositions(migrated)
  }
  return migrated
}

function writePositions(positions: Record<string, Position>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
}

function defaultPosition(index: number): Position {
  return {
    x: GROUP_GAP + (index % GRID_COLS) * (GROUP_WIDTH + GROUP_GAP),
    y: GROUP_GAP + Math.floor(index / GRID_COLS) * ROW_STRIDE,
  }
}

export function StatusGroupsCanvas({
  groups,
  pendingTaskIds,
  onChangeStatus,
  onOpenTask,
}: StatusGroupsCanvasProps) {
  const [positions, setPositions] = useState<Record<string, Position>>(readPositions)
  const [zOrder, setZOrder] = useState<Record<string, number>>({})
  const topZRef = useRef(1)
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  useEffect(() => {
    setPositions((prev) => {
      let changed = false
      const next = { ...prev }
      const occupied = Object.values(next)
      let nextIndex = 0
      groups.forEach((group) => {
        if (next[group.name] === undefined) {
          let position = defaultPosition(nextIndex)
          while (
            occupied.some(
              (existing) =>
                position.x < existing.x + GROUP_WIDTH &&
                position.x + GROUP_WIDTH > existing.x &&
                position.y < existing.y + GROUP_MAX_HEIGHT &&
                position.y + GROUP_MAX_HEIGHT > existing.y,
            )
          ) {
            nextIndex += 1
            position = defaultPosition(nextIndex)
          }
          next[group.name] = position
          occupied.push(position)
          nextIndex += 1
          changed = true
        }
      })
      if (changed) writePositions(next)
      return changed ? next : prev
    })
  }, [groups])

  const surface = useMemo(() => {
    let width = 960
    let height = 640
    for (const group of groups) {
      const pos = positions[group.name]
      if (!pos) continue
      width = Math.max(width, pos.x + GROUP_WIDTH + GROUP_GAP * 2)
      height = Math.max(height, pos.y + GROUP_MAX_HEIGHT + GROUP_GAP * 2)
    }
    return { width, height }
  }, [groups, positions])

  function bringToFront(name: string) {
    topZRef.current += 1
    const next = topZRef.current
    setZOrder((order) => ({ ...order, [name]: next }))
  }

  function onHeaderPointerDown(
    event: PointerEvent<HTMLDivElement>,
    name: string,
  ) {
    if (event.button !== 0) return
    event.preventDefault()
    const pos = positions[name] ?? defaultPosition(0)
    const drag: DragState = {
      name,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: pos.x,
      originY: pos.y,
    }
    dragRef.current = drag
    setDragging(name)
    bringToFront(name)

    function onMove(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId !== drag.pointerId) return
      const x = Math.max(
        0,
        drag.originX + (moveEvent.clientX - drag.startClientX),
      )
      const y = Math.max(
        0,
        drag.originY + (moveEvent.clientY - drag.startClientY),
      )
      setPositions((prev) => ({ ...prev, [drag.name]: { x, y } }))
    }

    function onUp(upEvent: globalThis.PointerEvent) {
      if (upEvent.pointerId !== drag.pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragRef.current = null
      setDragging(null)
      setPositions((prev) => {
        writePositions(prev)
        return prev
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div className="status-canvas">
      <div
        className="status-canvas-surface"
        style={{ width: surface.width, height: surface.height }}
      >
        {groups.map((group, index) => {
          const pos = positions[group.name] ?? defaultPosition(index)
          return (
            <section
              key={group.name}
              className={`column status-group${dragging === group.name ? ' is-dragging' : ''}`}
              style={{
                left: pos.x,
                top: pos.y,
                zIndex: zOrder[group.name] ?? 1,
              }}
            >
              <div
                className="column-header status-group-handle"
                onPointerDown={(event) => onHeaderPointerDown(event, group.name)}
              >
                <h3>{group.name}</h3>
                <span className="muted-meta">{group.tasks.length}</span>
              </div>
              <div className="column-body">
                {group.tasks.map((task) => (
                  <StatusTaskCard
                    key={task.id}
                    task={task}
                    pending={pendingTaskIds.has(task.id)}
                    onChangeStatus={onChangeStatus}
                    onOpen={() => onOpenTask(task)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function StatusTaskCard({
  task,
  pending,
  onChangeStatus,
  onOpen,
}: {
  task: StatusTask
  pending: boolean
  onChangeStatus: (task: StatusTask, columnId: number) => void
  onOpen: () => void
}) {
  const assigned = task.assigned_to != null

  return (
    <div
      className="task-card status-task-card"
      onClick={onOpen}
      role="button"
    >
      <div className="task-title">
        {task.project_task_id != null && (
          <span className="task-id">#{task.project_task_id} </span>
        )}
        {task.title}
      </div>
      <Link
        to={`/projects/${task.project.id}`}
        className="status-task-project"
        onClick={(event) => event.stopPropagation()}
      >
        {task.project.name}
      </Link>
      {task.description && <div className="task-desc">{task.description}</div>}
      <div className="task-meta">
        {task.tags.map((tag) => (
          <span
            key={tag.id}
            className="tag-pill"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
          </span>
        ))}
        {task.assigned_to && (
          <span className="assignee-chip">{task.assigned_to.username}</span>
        )}
      </div>
      <label
        className="status-task-status"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="form-label">Status</span>
        <select
          className="form-control"
          value={task.column_id}
          disabled={!assigned || pending}
          title={
            assigned
              ? undefined
              : 'Assign the task before changing status'
          }
          onChange={(event) =>
            onChangeStatus(task, Number(event.target.value))
          }
        >
          {task.projectColumns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
