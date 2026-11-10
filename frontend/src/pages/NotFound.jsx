import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { Button } from '../components/ui/Button.jsx'

export default function NotFound() {
  return (
    <Screen>
      <PageHeader title="Not here" />
      <Panel>
        <EmptyState
          icon={Compass}
          title="There is no such screen"
          body="The address may be mistyped, or the page has moved."
          action={
            <Link to="/">
              <Button variant="primary">Back to Overview</Button>
            </Link>
          }
        />
      </Panel>
    </Screen>
  )
}
