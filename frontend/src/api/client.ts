import type {
  BoardPayload,
  Column,
  Project,
  Tag,
  Task,
  TaskDetail,
  User,
} from './types'

export class ApiClientError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function ensureCsrf(): Promise<void> {
  if (!getCookie('csrftoken')) {
    await fetch('/api/auth/csrf', { credentials: 'include' })
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    await ensureCsrf()
  }

  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const csrf = getCookie('csrftoken')
  if (csrf) {
    headers.set('X-CSRFToken', csrf)
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String(data.detail)
        : response.statusText
    throw new ApiClientError(response.status, detail)
  }

  return data as T
}

export const api = {
  getCsrf: () => request<{ detail: string }>('/api/auth/csrf'),
  login: (username: string, password: string) =>
    request<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ detail: string }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<User>('/api/auth/me'),
  listUsers: () => request<User[]>('/api/users'),
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, githubUrl = '') =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, github_url: githubUrl }),
    }),
  updateProject: (id: number, githubUrl: string) =>
    request<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ github_url: githubUrl }),
    }),
  deleteProject: (id: number) =>
    request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  getBoard: (projectId: number) =>
    request<BoardPayload>(`/api/projects/${projectId}/board`),
  listTags: (projectId: number) =>
    request<Tag[]>(`/api/projects/${projectId}/tags`),
  createTag: (projectId: number, name: string, color: string) =>
    request<Tag>(`/api/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  deleteTag: (tagId: number) =>
    request<void>(`/api/tags/${tagId}`, { method: 'DELETE' }),
  createColumn: (boardId: number, name: string) =>
    request<Column>(`/api/boards/${boardId}/columns`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateColumn: (columnId: number, name: string) =>
    request<Column>(`/api/columns/${columnId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteColumn: (columnId: number) =>
    request<void>(`/api/columns/${columnId}`, { method: 'DELETE' }),
  moveColumn: (columnId: number, newOrder: number) =>
    request<void>(`/api/columns/${columnId}/move`, {
      method: 'POST',
      body: JSON.stringify({ new_order: newOrder }),
    }),
  createTask: (
    columnId: number,
    data: { title: string; description?: string; tags?: number[] },
  ) =>
    request<Task>(`/api/columns/${columnId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTask: (taskId: number) => request<TaskDetail>(`/api/tasks/${taskId}`),
  updateTask: (taskId: number, title: string, description: string) =>
    request<Task>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, description }),
    }),
  deleteTask: (taskId: number) =>
    request<void>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  updateTaskTags: (taskId: number, tags: number[]) =>
    request<Task>(`/api/tasks/${taskId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    }),
  moveTask: (taskId: number, newColumnId: number, newOrder: number) =>
    request<void>(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      body: JSON.stringify({
        new_column_id: newColumnId,
        new_order: newOrder,
      }),
    }),
  assignTask: (taskId: number, userId: number | null) =>
    request<Task>(`/api/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
  addTaskUpdate: (taskId: number, body: string) =>
    request<TaskDetail>(`/api/tasks/${taskId}/updates`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  deleteHistory: (projectId: number) =>
    request<void>(`/api/projects/${projectId}/history`, { method: 'DELETE' }),
}
