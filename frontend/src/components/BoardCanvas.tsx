import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'
import { ApiClientError, api } from '../api/client'
import type { Board, Column, Task } from '../api/types'
import { useAuth } from '../auth/AuthContext'

type BoardCanvasProps = {
  board: Board
  onBoardChange: (board: Board) => void
  onOpenTask: (taskId: number) => void
  onCreateTask: (columnId: number) => void
  onError: (message: string) => void
}

function columnId(id: number) {
  return `column-${id}`
}

function taskId(id: number) {
  return `task-${id}`
}

function parseColumnId(id: UniqueIdentifier): number | null {
  const value = String(id)
  if (!value.startsWith('column-')) return null
  return Number(value.replace('column-', ''))
}

function parseTaskId(id: UniqueIdentifier): number | null {
  const value = String(id)
  if (!value.startsWith('task-')) return null
  return Number(value.replace('task-', ''))
}

function findColumnForTask(columns: Column[], id: UniqueIdentifier): Column | null {
  const tid = parseTaskId(id)
  if (tid !== null) {
    return columns.find((c) => c.tasks.some((t) => t.id === tid)) ?? null
  }
  const cid = parseColumnId(id)
  if (cid !== null) {
    return columns.find((c) => c.id === cid) ?? null
  }
  return null
}

function TaskCardView({
  task,
  onOpen,
  dragging,
  onAssignToMe,
}: {
  task: Task
  onOpen?: () => void
  dragging?: boolean
  onAssignToMe?: () => void
}) {
  return (
    <div
      className={`task-card ${dragging ? 'sortable-drag' : ''}`}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
    >
      <div className="task-title">
        {task.project_task_id != null && (
          <span className="task-id">#{task.project_task_id} </span>
        )}
        {task.title}
      </div>
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
      {onAssignToMe && (
        <div className="task-actions">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onAssignToMe()
            }}
          >
            Assign to me
          </button>
        </div>
      )}
    </div>
  )
}

function SortableTask({
  task,
  onOpen,
  onAssignToMe,
}: {
  task: Task
  onOpen: () => void
  onAssignToMe?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: taskId(task.id), data: { type: 'task', task } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCardView task={task} onOpen={onOpen} onAssignToMe={onAssignToMe} />
    </div>
  )
}

function SortableColumn({
  column,
  onOpenTask,
  onCreateTask,
  onDeleteColumn,
  onAssignToMe,
  currentUserId,
}: {
  column: Column
  onOpenTask: (taskId: number) => void
  onCreateTask: (columnId: number) => void
  onDeleteColumn: (columnId: number) => void
  onAssignToMe: (task: Task) => void
  currentUserId: number | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnId(column.id), data: { type: 'column', column } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const taskIds = useMemo(
    () => column.tasks.map((t) => taskId(t.id)),
    [column.tasks],
  )

  return (
    <div ref={setNodeRef} style={style} className="column">
      <div className="column-header" {...attributes} {...listeners}>
        <h3>{column.name}</h3>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteColumn(column.id)
          }}
        >
          Delete
        </button>
      </div>
      <div className="column-body">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              onOpen={() => onOpenTask(task.id)}
              onAssignToMe={
                currentUserId != null && task.assigned_to?.id !== currentUserId
                  ? () => onAssignToMe(task)
                  : undefined
              }
            />
          ))}
        </SortableContext>
      </div>
      <div className="column-footer">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%' }}
          onClick={() => onCreateTask(column.id)}
        >
          + Add Task
        </button>
      </div>
    </div>
  )
}

export function BoardCanvas({
  board,
  onBoardChange,
  onOpenTask,
  onCreateTask,
  onError,
}: BoardCanvasProps) {
  const { user } = useAuth()
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [dragOrigin, setDragOrigin] = useState<{
    columnId: number
    index: number
  } | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const columnIds = useMemo(
    () => board.columns.map((c) => columnId(c.id)),
    [board.columns],
  )

  function setColumns(columns: Column[]) {
    onBoardChange({ ...board, columns })
  }

  async function assignToMe(task: Task) {
    if (!user) return
    try {
      const updated = await api.assignTask(task.id, user.id)
      setColumns(
        board.columns.map((column) => ({
          ...column,
          tasks: column.tasks.map((t) => (t.id === updated.id ? updated : t)),
        })),
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to assign task')
    }
  }

  function onDragStart(event: DragStartEvent) {
    const tid = parseTaskId(event.active.id)
    if (tid !== null) {
      const sourceColumn = findColumnForTask(board.columns, event.active.id)
      const task = board.columns
        .flatMap((c) => c.tasks)
        .find((t) => t.id === tid)
      setActiveTask(task ?? null)
      if (sourceColumn) {
        setDragOrigin({
          columnId: sourceColumn.id,
          index: sourceColumn.tasks.findIndex((t) => t.id === tid),
        })
      }
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeTaskId = parseTaskId(active.id)
    if (activeTaskId === null) return

    const activeColumn = findColumnForTask(board.columns, active.id)
    const overColumn = findColumnForTask(board.columns, over.id)
    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) {
      return
    }

    const activeIndex = activeColumn.tasks.findIndex((t) => t.id === activeTaskId)
    const overTaskId = parseTaskId(over.id)
    const overIndex =
      overTaskId === null
        ? overColumn.tasks.length
        : overColumn.tasks.findIndex((t) => t.id === overTaskId)

    const moving = activeColumn.tasks[activeIndex]
    if (!moving) return

    const next = board.columns.map((column) => {
      if (column.id === activeColumn.id) {
        return {
          ...column,
          tasks: column.tasks.filter((t) => t.id !== activeTaskId),
        }
      }
      if (column.id === overColumn.id) {
        const tasks = [...column.tasks]
        tasks.splice(overIndex >= 0 ? overIndex : tasks.length, 0, {
          ...moving,
          column_id: column.id,
        })
        return { ...column, tasks }
      }
      return column
    })
    setColumns(next)
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const origin = dragOrigin
    setActiveTask(null)
    setDragOrigin(null)
    if (!over) return

    const activeColumnId = parseColumnId(active.id)
    if (activeColumnId !== null) {
      const oldIndex = board.columns.findIndex((c) => c.id === activeColumnId)
      const overColumnId = parseColumnId(over.id)
      if (overColumnId === null || oldIndex < 0) return
      const newIndex = board.columns.findIndex((c) => c.id === overColumnId)
      if (oldIndex === newIndex) return
      const next = arrayMove(board.columns, oldIndex, newIndex).map(
        (column, order) => ({ ...column, order }),
      )
      setColumns(next)
      try {
        await api.moveColumn(activeColumnId, newIndex)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to move column')
      }
      return
    }

    const activeTaskId = parseTaskId(active.id)
    if (activeTaskId === null) return

    const column = findColumnForTask(board.columns, active.id)
    if (!column) return

    const oldIndex = column.tasks.findIndex((t) => t.id === activeTaskId)
    const overTaskId = parseTaskId(over.id)
    const overColumn = findColumnForTask(board.columns, over.id) ?? column
    let newIndex =
      overTaskId === null
        ? overColumn.tasks.length - 1
        : overColumn.tasks.findIndex((t) => t.id === overTaskId)

    if (column.id === overColumn.id) {
      // onDragOver may already have moved the task into this column, so the
      // indexes can match even when the server still has the old column.
      let finalIndex = oldIndex
      if (oldIndex !== newIndex && newIndex >= 0) {
        const nextTasks = arrayMove(column.tasks, oldIndex, newIndex)
        setColumns(
          board.columns.map((c) =>
            c.id === column.id ? { ...c, tasks: nextTasks } : c,
          ),
        )
        finalIndex = newIndex
      }

      if (
        origin &&
        origin.columnId === column.id &&
        origin.index === finalIndex
      ) {
        return
      }

      try {
        await api.moveTask(activeTaskId, column.id, finalIndex)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to move task')
      }
      return
    }

    if (newIndex < 0) newIndex = overColumn.tasks.length
    try {
      await api.moveTask(activeTaskId, overColumn.id, newIndex)
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to move task'
      onError(message)
      // Reload is caller's responsibility via toast + refresh; flip back by
      // notifying parent through a no-op board change reload pattern.
      throw err
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    try {
      await onDragEnd(event)
    } catch {
      // Parent refreshes on error toast path.
    }
  }

  async function onDeleteColumn(id: number) {
    if (!window.confirm('Delete this column and its tasks?')) return
    await api.deleteColumn(id)
    setColumns(board.columns.filter((c) => c.id !== id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={(e) => void handleDragEnd(e)}
    >
      <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
        <div className="board-canvas">
          {board.columns.map((column) => (
            <SortableColumn
              key={column.id}
              column={column}
              onOpenTask={onOpenTask}
              onCreateTask={onCreateTask}
              onDeleteColumn={(id) => void onDeleteColumn(id)}
              onAssignToMe={(task) => void assignToMe(task)}
              currentUserId={user?.id ?? null}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeTask ? <TaskCardView task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
