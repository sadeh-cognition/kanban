export type User = {
  id: number
  username: string
}

export type Project = {
  id: number
  name: string
  github_url: string
}

export type Tag = {
  id: number
  name: string
  color: string
}

export type Task = {
  id: number
  project_task_id: number | null
  title: string
  description: string
  order: number
  column_id: number
  tags: Tag[]
  assigned_to: User | null
}

export type ColumnName = {
  id: number
  name: string
}

export type HistoryEntry = {
  type: 'status' | 'assignment' | 'update' | string
  changed_at: string
  old_column?: ColumnName | null
  new_column?: ColumnName | null
  old_assignee?: User | null
  new_assignee?: User | null
  body?: string | null
  author?: User | null
}

export type TaskDetail = Task & {
  history: HistoryEntry[]
}

export type Column = {
  id: number
  name: string
  order: number
  tasks: Task[]
}

export type Board = {
  id: number
  name: string
  columns: Column[]
}

export type BoardPayload = {
  project: Project
  board: Board
  history_content: string | null
}

export type StatusTask = Task & {
  project: Project
  columnName: string
  projectColumns: ColumnName[]
}

export type ApiError = {
  detail: string
}
