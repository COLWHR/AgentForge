import { Plus, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useBuilderTabsStore } from '../../../features/ui-shell/builderTabs.store'
import type { BuilderTabStatus } from '../../../features/ui-shell/builderTabs.types'
import { cn } from '../../../lib/cn'
import { getBuilderIcon } from './builderTabIcons'

const STATUS_STYLE: Record<BuilderTabStatus, string> = {
  idle: 'bg-slate-300',
  loading: 'bg-sky-500 animate-pulse',
  ready: 'bg-emerald-500',
  dirty: 'bg-amber-500',
  error: 'bg-rose-500',
}

const STATUS_LABEL: Record<BuilderTabStatus, string> = {
  idle: 'Idle',
  loading: 'Loading',
  ready: 'Ready',
  dirty: 'Dirty',
  error: 'Error',
}

export function BuilderTabBar() {
  const tabs = useBuilderTabsStore((state) => state.tabs)
  const activeTabId = useBuilderTabsStore((state) => state.activeTabId)
  const setActiveTab = useBuilderTabsStore((state) => state.setActiveTab)
  const closeTab = useBuilderTabsStore((state) => state.closeTab)
  const renameTab = useBuilderTabsStore((state) => state.renameTab)
  const openOrFocusNewTab = useBuilderTabsStore((state) => state.openOrFocusNewTab)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    if (!activeTabId) {
      return
    }
    const container = scrollContainerRef.current
    const activeTab = tabRefs.current[activeTabId]
    if (!container || !activeTab) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      activeTab.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeTabId, tabs.length])

  return (
    <div className="shrink-0 border-b border-border bg-surface px-3">
      <div className="flex h-11 items-center gap-2 overflow-hidden">
        <div ref={scrollContainerRef} className="min-w-0 flex-1 overflow-x-auto scroll-smooth">
          <div className="flex h-11 min-w-max items-center gap-1 pr-1">
            {tabs.map((tab) => {
              const Icon = getBuilderIcon(tab.icon)
              const isActive = tab.id === activeTabId
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabRefs.current[tab.id] = node
                  }}
                  type="button"
                  className={cn(
                    'group inline-flex h-8 min-w-[120px] max-w-[220px] shrink-0 items-center gap-1.5 rounded-token-md border px-2.5 text-xs transition-colors',
                    isActive
                      ? 'border-primary/30 bg-primary/10 text-text-main'
                      : 'border-transparent text-text-sub hover:border-border hover:bg-bg-soft hover:text-text-main',
                  )}
                  onClick={() => setActiveTab(tab.id)}
                  onDoubleClick={() => {
                    const title = window.prompt('重命名标签页', tab.title)
                    if (title !== null) {
                      renameTab(tab.id, title)
                    }
                  }}
                >
                  <Icon size={13} className="shrink-0" />
                  <span className="truncate" title={tab.title}>
                    {tab.title}
                  </span>
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_STYLE[tab.state.status])} title={STATUS_LABEL[tab.state.status]} />
                  {tab.state.status !== 'ready' && tab.state.status !== 'idle' ? (
                    <span className="hidden rounded bg-bg-soft px-1 py-0.5 text-[10px] md:inline">{STATUS_LABEL[tab.state.status]}</span>
                  ) : null}
                  {tab.closable ? (
                    <span
                      className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-black/5"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (tab.state.status === 'dirty' && !window.confirm(`标签页「${tab.title}」有未保存内容，确认关闭吗？`)) {
                          return
                        }
                        closeTab(tab.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') {
                          return
                        }
                        event.preventDefault()
                        if (tab.state.status === 'dirty' && !window.confirm(`标签页「${tab.title}」有未保存内容，确认关闭吗？`)) {
                          return
                        }
                        closeTab(tab.id)
                      }}
                    >
                      <X size={12} />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-token-md border border-border text-text-sub transition-colors hover:bg-bg-soft hover:text-text-main"
          aria-label="open new tab"
          title="+ 新标签页"
          onClick={openOrFocusNewTab}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
