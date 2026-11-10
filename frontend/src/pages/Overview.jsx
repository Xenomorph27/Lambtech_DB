import { PageHeader, Panel, Screen } from '../components/layout/PageHeader.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { GaugeCircle } from 'lucide-react'

/** Placeholder until the Overview screen lands in a later task. */
export default function Overview() {
  return (
    <Screen>
      <PageHeader title="Overview" description="Pipeline and work at a glance" />
      <Panel>
        <EmptyState icon={GaugeCircle} title="Overview is on its way" body="Counts and sums will appear here." />
      </Panel>
    </Screen>
  )
}
