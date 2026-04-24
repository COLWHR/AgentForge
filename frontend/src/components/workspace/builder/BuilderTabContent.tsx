import type { ComponentType } from 'react'

import { useBuilderTabsStore } from '../../../features/ui-shell/builderTabs.store'
import type { BuilderTabType } from '../../../features/ui-shell/builderTabs.types'
import { BuilderCapabilityPage } from './pages/BuilderCapabilityPage'
import { DeployTabPage } from './pages/DeployTabPage'
import { NewTabSelectorPage } from './pages/NewTabSelectorPage'
import { PreviewTabPage } from './pages/PreviewTabPage'
import { RunLogsTabPage } from './pages/RunLogsTabPage'

const TAB_RENDERER: Record<BuilderTabType, ComponentType> = {
  preview: PreviewTabPage,
  new_tab: NewTabSelectorPage,
  run_logs: RunLogsTabPage,
  deploy: DeployTabPage,
  agent_config: () => <BuilderCapabilityPage type="agent_config" />,
  skills: () => <BuilderCapabilityPage type="skills" />,
  knowledge: () => <BuilderCapabilityPage type="knowledge" />,
  connector: () => <BuilderCapabilityPage type="connector" />,
  env_vars: () => <BuilderCapabilityPage type="env_vars" />,
  database: () => <BuilderCapabilityPage type="database" />,
  object_storage: () => <BuilderCapabilityPage type="object_storage" />,
  versions: () => <BuilderCapabilityPage type="versions" />,
  analytics: () => <BuilderCapabilityPage type="analytics" />,
  workflow: () => <BuilderCapabilityPage type="workflow" />,
  cloud_terminal: () => <BuilderCapabilityPage type="cloud_terminal" />,
  cloud_editor: () => <BuilderCapabilityPage type="cloud_editor" />,
  version_control: () => <BuilderCapabilityPage type="version_control" />,
  debug_console: () => <BuilderCapabilityPage type="debug_console" />,
}

export function BuilderTabContent() {
  const tabs = useBuilderTabsStore((state) => state.tabs)
  const activeTabId = useBuilderTabsStore((state) => state.activeTabId)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const Renderer = TAB_RENDERER[activeTab.type]

  return <Renderer />
}
