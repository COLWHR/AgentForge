import { lazy } from 'react'

export const AppShell = lazy(() => import('../../layouts/AppShell').then((module) => ({ default: module.AppShell })))
export const AgentsPage = lazy(() => import('../../pages/AgentsPage').then((module) => ({ default: module.AgentsPage })))
export const RunsPage = lazy(() => import('../../pages/RunsPage').then((module) => ({ default: module.RunsPage })))
export const MarketplacePage = lazy(() => import('../../pages/MarketplacePage').then((module) => ({ default: module.MarketplacePage })))
export const LogsPage = lazy(() => import('../../pages/LogsPage').then((module) => ({ default: module.LogsPage })))
export const NotFoundPage = lazy(() => import('../../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
