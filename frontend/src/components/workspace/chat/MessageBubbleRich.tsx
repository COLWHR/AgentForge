import { Bot, User } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../../lib/cn'

interface MessageBubbleRichProps {
  role: 'assistant' | 'user'
  content: ReactNode
  timestamp?: string
  compact?: boolean
}

export function MessageBubbleRich({ role, content, timestamp, compact = false }: MessageBubbleRichProps) {
  const isAssistant = role === 'assistant'

  return (
    <div className={cn('flex flex-col gap-2', isAssistant ? 'items-start' : 'items-end')}>
      <div className="flex items-center gap-2 px-1">
        {isAssistant && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot size={12} />
          </div>
        )}
        <span className="text-xs font-semibold text-text-sub">{isAssistant ? 'AI Coder' : 'You'}</span>
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
          isAssistant ? 'bg-surface text-text-main shadow-token-sm border border-border' : 'bg-bg-soft text-text-main border border-border/50',
        )}
      >
        <div className="leading-relaxed">{content}</div>
      </div>
    </div>
  )
}
