import { TerminalSquare } from 'lucide-react'

import { PanelSection } from '../shared/PanelSection'

interface AgentOutputPanelProps {
  final_answer: string | null
}

export function AgentOutputPanel({ final_answer }: AgentOutputPanelProps) {
  return (
    <PanelSection title="Agent Output" icon={<TerminalSquare size={16} />} className="flex-1">
      {final_answer === null || final_answer.trim().length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center p-6 text-center text-text-muted">
          <TerminalSquare size={40} className="mb-3 text-border" />
          <p className="text-sm font-medium text-text-main">Empty Output</p>
        </div>
      ) : (
        <div className="h-full p-4">
          <div className="h-full whitespace-pre-wrap rounded-token-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-main">
            {final_answer}
          </div>
        </div>
      )}
    </PanelSection>
  )
}
