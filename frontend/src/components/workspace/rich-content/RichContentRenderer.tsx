import type { ReactNode } from 'react'

import { useWorkspaceTabsStore } from '../../../features/ui-shell/workspaceTabs.store'
import { cn } from '../../../lib/cn'
import { CodeBlockCard } from '../chat/CodeBlockCard'

interface RichContentRendererProps {
  content: string
  compact?: boolean
}

type RichBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; language: string | null; code: string }

const COMMAND_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'terminal', 'console'])

function splitBlocks(content: string): RichBlock[] {
  const blocks: RichBlock[] = []
  const fencePattern = /```([^\n`]*)?\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    const language = match[1]?.trim() || null
    blocks.push({ type: 'code', language, code: match[2].replace(/\n$/, '') })
    lastIndex = fencePattern.lastIndex
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', text: content.slice(lastIndex) })
  }

  return blocks.filter((block) => (block.type === 'text' ? block.text.trim().length > 0 : block.code.length > 0))
}

function isCommandBlock(language: string | null, code: string): boolean {
  const normalized = language?.trim().toLowerCase() ?? ''
  if (COMMAND_LANGUAGES.has(normalized)) {
    return true
  }
  const firstLine = code.trimStart().split('\n')[0] ?? ''
  return firstLine.startsWith('$ ') || firstLine.startsWith('npm ') || firstLine.startsWith('pnpm ') || firstLine.startsWith('yarn ')
}

function normalizeUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, '')
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function InlineText({ text }: { text: string }) {
  const selectBrowserLink = useWorkspaceTabsStore((state) => state.selectBrowserLink)
  const nodes: ReactNode[] = []
  let index = 0

  const pushText = (value: string) => {
    if (value.length > 0) {
      nodes.push(value)
    }
  }

  while (index < text.length) {
    const rest = text.slice(index)
    const markdownLink = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/)
    if (markdownLink) {
      const label = markdownLink[1]
      const url = normalizeUrl(markdownLink[2])
      nodes.push(
        <button
          key={`link-${index}`}
          type="button"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => selectBrowserLink({ url, title: label, source: 'final_answer' })}
        >
          {label}
        </button>,
      )
      index += markdownLink[0].length
      continue
    }

    const urlMatch = rest.match(/^https?:\/\/[^\s)]+/)
    if (urlMatch) {
      const url = normalizeUrl(urlMatch[0])
      nodes.push(
        <button
          key={`url-${index}`}
          type="button"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => selectBrowserLink({ url, title: titleFromUrl(url), source: 'final_answer' })}
        >
          {url}
        </button>,
      )
      index += urlMatch[0].length
      continue
    }

    if (rest.startsWith('**')) {
      const close = rest.indexOf('**', 2)
      if (close > 2) {
        nodes.push(
          <strong key={`strong-${index}`} className="font-semibold text-text-main">
            {rest.slice(2, close)}
          </strong>,
        )
        index += close + 2
        continue
      }
    }

    if (rest.startsWith('`')) {
      const close = rest.indexOf('`', 1)
      if (close > 1) {
        nodes.push(
          <code key={`code-${index}`} className="rounded-token-sm bg-bg-soft px-1 py-0.5 font-mono text-[0.92em] text-text-main">
            {rest.slice(1, close)}
          </code>,
        )
        index += close + 1
        continue
      }
    }

    const nextSpecials = [rest.indexOf('['), rest.indexOf('http://'), rest.indexOf('https://'), rest.indexOf('**'), rest.indexOf('`')]
      .filter((position) => position > 0)
      .sort((a, b) => a - b)
    const nextIndex = nextSpecials[0] ?? 1
    pushText(rest.slice(0, nextIndex))
    index += nextIndex
  }

  return <>{nodes}</>
}

export function RichContentRenderer({ content, compact = false }: RichContentRendererProps) {
  const addTerminalCommand = useWorkspaceTabsStore((state) => state.addTerminalCommand)
  const blocks = splitBlocks(content)

  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-text-main', compact && 'space-y-2 text-xs')}>
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          const command = isCommandBlock(block.language, block.code)
          return (
            <CodeBlockCard
              key={`code-${index}`}
              code={block.code}
              language={block.language ?? undefined}
              kind={command ? 'command' : 'code'}
              title={command ? 'Command' : block.language ?? 'Code'}
              onAddCommand={command ? () => addTerminalCommand({ command: block.code, title: block.language ?? 'Command', source: 'final_answer' }) : undefined}
            />
          )
        }

        return block.text
          .trim()
          .split(/\n{2,}/)
          .filter((paragraph) => paragraph.trim().length > 0)
          .map((paragraph, paragraphIndex) => (
            <p key={`text-${index}-${paragraphIndex}`} className="whitespace-pre-wrap break-words">
              <InlineText text={paragraph.trim()} />
            </p>
          ))
      })}
    </div>
  )
}
