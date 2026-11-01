import { PageTitle } from '@/components/PageStates'
import { NewLeagueForm } from './NewLeagueForm'

export default function NewLeaguePage() {
  return (
    <>
      <PageTitle label="Yeni lig" title="Lig kur" />
      <NewLeagueForm />
    </>
  )
}
