import { CheckCircle2, ChevronRight, Cpu } from 'lucide-react'

interface SkillCallBoxProps {
  skillName: string
}

export function SkillCallBox({ skillName }: SkillCallBoxProps) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-token-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium text-text-sub">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-token-md bg-primary/10 text-primary">
            <Cpu size={12} />
          </div>
          <span>Tool Call: {skillName}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-green-600">
          <CheckCircle2 size={12} />
          <span>Success</span>
        </div>
      </div>
      <button className="flex items-center justify-between bg-bg-soft px-3 py-1.5 text-xs text-text-muted hover:text-text-main transition-colors">
        <span>View Details</span>
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
