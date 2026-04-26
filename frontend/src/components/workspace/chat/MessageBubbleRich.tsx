import { Bot, User } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../../lib/cn'

interface MessageBubbleRichProps {
  role: 'assistant' | 'user'
  content: ReactNode
  timestamp?: string
  compact?: boolean
  tone?: 'normal' | 'muted'
  badge?: string | null
}

export function MessageBubbleRich({ role, content, timestamp, compact = false, tone = 'normal', badge = null }: MessageBubbleRichProps) {
  const isAssistant = role === 'assistant'
  const isMuted = tone === 'muted'

  return (
    <div className={cn('flex flex-col gap-2', isAssistant ? 'items-start' : 'items-end')}>
      <div className="flex items-center gap-2 px-1">
        {isAssistant && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot size={12} />
          </div>
        )}
        <span className="text-xs font-semibold text-text-sub">{isAssistant ? '对话预览' : '你'}</span>
        {timestamp && <span className="text-[10px] text-text-muted">{timestamp}</span>}
        {!isAssistant && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-soft text-text-main">
            <User size={12} />
          </div>
        )}
      </div>

      <div
        className={cn(
          'max-w-[90%] rounded-token-lg px-3 py-2 text-sm',
          compact && 'max-w-full text-xs',
          isMuted
            ? 'border border-border bg-bg-soft/70 text-text-muted'
            : isAssistant
              ? 'bg-surface text-text-main shadow-token-sm border border-border'
              : 'bg-bg-soft text-text-main border border-border/50',
        )}
      >
        {isAssistant && badge ? (
          <div className="mb-2 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
            {badge}
          </div>
        ) : null}
        <div className="leading-relaxed">{content}</div>
      </div>
    </div>
  )
}
