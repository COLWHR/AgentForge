import { Lock } from 'lucide-react'

import { Alert } from './Alert'

export function PermissionDenied() {
  return (
    <Alert variant="warning" title="Permission Required">
      <span className="inline-flex items-center gap-2">
        <Lock size={14} />
        You do not have sufficient permission for this scope.
      </span>
    </Alert>
  )
}
