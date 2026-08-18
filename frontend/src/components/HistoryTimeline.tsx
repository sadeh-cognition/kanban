import type { HistoryEntry } from '../api/types'

function eventSummary(event: HistoryEntry): string {
  if (event.type === 'status') {
    return event.old_column
      ? `Moved from ${event.old_column.name} to ${event.new_column?.name ?? ''}`
      : `Created in ${event.new_column?.name ?? ''}`
  }
  if (event.type === 'assignment') {
    return `Assigned from ${event.old_assignee?.username ?? 'Unassigned'} to ${event.new_assignee?.username ?? 'Unassigned'}`
  }
  return `Update from ${event.author?.username ?? 'Unknown'}`
}

export function HistoryTimeline({ history }: { history: HistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="muted-meta">No history yet.</p>
  }

  return (
    <div className="history-timeline">
      {history.map((event, idx) => (
        <div
          key={`${event.type}-${event.changed_at}-${idx}`}
          className="history-item"
        >
          <div className={`history-dot ${event.type}`} />
          <p className="muted-meta">
            {new Date(event.changed_at).toLocaleString()}
          </p>
          <p>{eventSummary(event)}</p>
          {event.type === 'update' && event.body && (
            <p className="history-update-body">{event.body}</p>
          )}
        </div>
      ))}
    </div>
  )
}
