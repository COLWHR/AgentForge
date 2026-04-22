import { EmptyState } from '../components/feedback/EmptyState'
import { PageContainer } from '../components/layout/PageContainer'

export function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState title="Page Not Found" description="This route is outside the current shell map." />
    </PageContainer>
  )
}
