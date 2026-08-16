import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { BoardPayload, StatusTask, Tag } from '../api/types'
import { Layout } from '../components/Layout'
import { StatusFilterPicker } from '../components/StatusColumnPicker'
import { StatusGroupsCanvas } from '../components/StatusGroupsCanvas'
import { TaskModal } from '../components/TaskModal'
import { TaskUpdateModal } from '../components/TaskUpdateModal'

const HIDDEN_COLUMNS_KEY = 'kanban.statusGroupHidden'
const HIDDEN_PROJECTS_KEY = 'kanban.statusProjectHidden'

function readStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function writeStringList(key: string, values: string[]) {
  localStorage.setItem(key, JSON.stringify(values))
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
  const [updateTask, setUpdateTask] = useState<StatusTask | null>(null)
  const [projectTags, setProjectTags] = useState<{
    projectId: number
    tags: Tag[]
  } | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() =>
    readStringList(HIDDEN_COLUMNS_KEY),
  )
  const [hiddenProjects, setHiddenProjects] = useState<string[]>(() =>
    readStringList(HIDDEN_PROJECTS_KEY),
  )

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

  const projectItems = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>()
    for (const task of tasks) {
      const id = String(task.project.id)
      const existing = counts.get(id)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(id, { name: task.project.name, count: 1 })
      }
    }
    return [...counts.entries()]
      .map(([id, item]) => ({ id, name: item.name, count: item.count }))
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
      )
  }, [tasks])

  const visibleTasks = useMemo(() => {
    if (hiddenProjects.length === 0) return tasks
    const hiddenSet = new Set(hiddenProjects)
    return tasks.filter((task) => !hiddenSet.has(String(task.project.id)))
  }, [tasks, hiddenProjects])

  const groups = useMemo(() => groupByStatus(visibleTasks), [visibleTasks])
  const hiddenColumnSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns])
  const visibleGroups = useMemo(
    () => groups.filter((group) => !hiddenColumnSet.has(group.name)),
    [groups, hiddenColumnSet],
  )

  function persistHidden(
    key: string,
    setter: (value: string[] | ((prev: string[]) => string[])) => void,
  ) {
    return (next: string[] | ((prev: string[]) => string[])) => {
      setter((prev) => {
        const value = typeof next === 'function' ? next(prev) : next
        writeStringList(key, value)
        return value
      })
    }
  }

  const onHiddenColumnsChange = persistHidden(
    HIDDEN_COLUMNS_KEY,
    setHiddenColumns,
  )
  const onHiddenProjectsChange = persistHidden(
    HIDDEN_PROJECTS_KEY,
    setHiddenProjects,
  )

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
          <>
            <StatusFilterPicker
              label="Projects"
              menuTitle="Projects"
              items={projectItems}
              hidden={hiddenProjects}
              onChange={onHiddenProjectsChange}
            />
            <StatusFilterPicker
              label="Columns"
              menuTitle="Statuses"
              items={groups.map((group) => ({
                id: group.name,
                name: group.name,
                count: group.tasks.length,
              }))}
              hidden={hiddenColumns}
              onChange={onHiddenColumnsChange}
            />
          </>
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
      ) : visibleTasks.length === 0 ? (
        <div className="page-pad">
          <div className="empty-state">
            <h3>No projects selected</h3>
            <p>Choose at least one project in the Projects menu.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onHiddenProjectsChange([])}
            >
              Show all
            </button>
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
              onClick={() => onHiddenColumnsChange([])}
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
          onAddUpdate={setUpdateTask}
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
          columns={selected.projectColumns}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}

      {updateTask !== null && (
        <TaskUpdateModal
          taskId={updateTask.id}
          taskTitle={updateTask.title}
          onClose={() => setUpdateTask(null)}
          onSaved={load}
        />
      )}
    </Layout>
  )
}
