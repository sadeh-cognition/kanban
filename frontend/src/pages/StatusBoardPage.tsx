import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { BoardPayload, StatusTask, Tag } from '../api/types'
import { Layout } from '../components/Layout'
import { StatusColumnPicker } from '../components/StatusColumnPicker'
import { StatusGroupsCanvas } from '../components/StatusGroupsCanvas'
import { TaskModal } from '../components/TaskModal'

const HIDDEN_KEY = 'kanban.statusGroupHidden'

function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function writeHidden(hidden: string[]) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden))
}

function flattenBoards(payloads: BoardPayload[]): StatusTask[] {
  const tasks: StatusTask[] = []
  for (const payload of payloads) {
    const projectColumns = payload.board.columns.map((column) => ({
      id: column.id,
      name: column.name,
    }))
    for (const column of payload.board.columns) {
      for (const task of column.tasks) {
        tasks.push({
          ...task,
          project: payload.project,
          columnName: column.name,
          projectColumns,
        })
      }
    }
  }
  return tasks
}

function groupByStatus(tasks: StatusTask[]) {
  const map = new Map<string, StatusTask[]>()
  for (const task of tasks) {
    const list = map.get(task.columnName) ?? []
    list.push(task)
    map.set(task.columnName, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([name, groupTasks]) => ({
      name,
      tasks: [...groupTasks].sort((left, right) => {
        const byProject = left.project.name.localeCompare(right.project.name)
        if (byProject !== 0) return byProject
        return (
          (left.project_task_id ?? left.id) - (right.project_task_id ?? right.id)
        )
      }),
    }))
}

export function StatusBoardPage() {
  const [tasks, setTasks] = useState<StatusTask[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<StatusTask | null>(null)
  const [projectTags, setProjectTags] = useState<{
    projectId: number
    tags: Tag[]
  } | null>(null)
  const [hidden, setHidden] = useState<string[]>(readHidden)

  const load = useCallback(async () => {
    const projects = await api.listProjects()
    const payloads = await Promise.all(
      projects.map((project) => api.getBoard(project.id)),
    )
    setTasks(flattenBoards(payloads))
  }, [])

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

  useEffect(() => {
    setProjectTags(null)
    if (!selected) {
      return
    }
    let ignore = false
    void api.listTags(selected.project.id).then((tags) => {
      if (!ignore) {
        setProjectTags({ projectId: selected.project.id, tags })
      }
    })
    return () => {
      ignore = true
    }
  }, [selected])

  const groups = useMemo(() => groupByStatus(tasks), [tasks])
  const hiddenSet = useMemo(() => new Set(hidden), [hidden])
  const visibleGroups = useMemo(
    () => groups.filter((group) => !hiddenSet.has(group.name)),
    [groups, hiddenSet],
  )

  function onHiddenChange(
    next: string[] | ((prev: string[]) => string[]),
  ) {
    setHidden((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      writeHidden(value)
      return value
    })
  }

  async function onChangeStatus(task: StatusTask, columnId: number) {
    if (columnId === task.column_id) return
    const nextColumn = task.projectColumns.find((column) => column.id === columnId)
    if (!nextColumn) return

    const destCount = tasks.filter((item) => item.column_id === columnId).length
    setPendingTaskIds((prev) => new Set(prev).add(task.id))
    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? { ...item, column_id: columnId, columnName: nextColumn.name }
          : item,
      ),
    )
    try {
      await api.moveTask(task.id, columnId, destCount)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to change status')
      await load()
    } finally {
      setPendingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="loading-spinner">Loading tasks…</div>
      </Layout>
    )
  }

  return (
    <Layout
      actions={
        tasks.length > 0 ? (
          <StatusColumnPicker
            columns={groups.map((group) => ({
              name: group.name,
              count: group.tasks.length,
            }))}
            hidden={hidden}
            onChange={onHiddenChange}
          />
        ) : undefined
      }
    >
      <div className="board-header">
        <p className="breadcrumb">
          <Link to="/">Projects</Link> / By Status
        </p>
        <h2>By Status</h2>
      </div>

      {tasks.length === 0 ? (
        <div className="page-pad">
          <div className="empty-state">
            <h3>No tasks yet</h3>
            <p>Create a task on a project board to see it here.</p>
          </div>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="page-pad">
          <div className="empty-state">
            <h3>No statuses selected</h3>
            <p>Choose at least one column in the Columns menu.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onHiddenChange([])}
            >
              Show all
            </button>
          </div>
        </div>
      ) : (
        <StatusGroupsCanvas
          groups={visibleGroups}
          pendingTaskIds={pendingTaskIds}
          onChangeStatus={(task, columnId) => void onChangeStatus(task, columnId)}
          onOpenTask={setSelected}
        />
      )}

      {toast && <div className="toast toast-error">{toast}</div>}

      {selected !== null && (
        <TaskModal
          taskId={selected.id}
          projectTags={
            projectTags?.projectId === selected.project.id
              ? projectTags.tags
              : []
          }
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </Layout>
  )
}
