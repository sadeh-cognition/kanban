import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project } from '../api/types'

const STORAGE_KEY = 'kanban.projectSwitchList'

function readIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (id): id is number => typeof id === 'number' && Number.isInteger(id),
    )
  } catch {
    return []
  }
}

function writeIds(ids: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export function resolveSwitchList(
  ids: number[],
  projects: Project[],
): Project[] {
  const byId = new Map(projects.map((project) => [project.id, project]))
  return ids
    .map((id) => byId.get(id))
    .filter((project): project is Project => project !== undefined)
}

export function useProjectSwitchList(
  projects: Project[],
  projectsLoaded: boolean,
) {
  const [ids, setIds] = useState<number[]>(() => readIds())

  const switchList = useMemo(
    () => resolveSwitchList(ids, projects),
    [ids, projects],
  )

  useEffect(() => {
    if (!projectsLoaded) return
    const nextIds = switchList.map((project) => project.id)
    if (
      nextIds.length !== ids.length ||
      nextIds.some((id, index) => id !== ids[index])
    ) {
      setIds(nextIds)
      writeIds(nextIds)
    }
  }, [ids, projectsLoaded, switchList])

  const add = useCallback((id: number) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      writeIds(next)
      return next
    })
  }, [])

  const remove = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.filter((item) => item !== id)
      writeIds(next)
      return next
    })
  }, [])

  return { ids, switchList, add, remove }
}
