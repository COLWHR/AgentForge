import { Terminal } from 'lucide-react'

import { Badge } from '../ui/Badge'

type LogLine = { level: 'info' | 'error' | 'success'; message: string }
type LogConsoleProps = { title?: string; lines?: LogLine[] }

const levelClass = {
  info: 'text-slate-200',
  success: 'text-emerald-300',
  error: 'bg-red-950/40 text-red-300',
}

export function LogConsole({ title = 'Execution Console', lines = [] }: LogConsoleProps) {
  return (
    <section className="overflow-hidden rounded-token-lg border border-border bg-surface shadow-token-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
          <Terminal size={16} />
          {title}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Scrollable</Badge>
          <Badge variant="neutral">Monospace</Badge>
        </div>
      </header>
      <div className="bg-slate-950 px-4 py-3">
        <div className="max-h-64 space-y-1 overflow-auto rounded-token-md bg-slate-900 p-3 font-mono text-xs leading-relaxed">
          {lines.length === 0 ? (
            <p className="text-slate-400">No logs yet. Runtime logs will stream here in next phases.</p>
          ) : (
            lines.map((line, index) => (
              <p key={index} className={['rounded px-2 py-1', levelClass[line.level]].join(' ')}>
                {line.message}
              </p>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
