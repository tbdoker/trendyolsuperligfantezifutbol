import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getMyLeagues, getProfile, getSelectedLeague, requireUser } from '@/lib/data'
import { LeagueSheet } from './LeagueSheet'

// The header of every tab: the selected league as a pill, and your initial.
export async function LeagueSwitcher() {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  if (!profile) redirect('/profil')

  const { classicTeam, leagues } = await getMyLeagues(user.id)
  const selected = await getSelectedLeague(leagues)

  return (
    <>
      <LeagueSheet
        leagues={leagues}
        selectedId={selected?.id ?? null}
        classicTeamName={classicTeam?.name ?? null}
      />
      <Link href="/profil" className="avatar" aria-label={`Profil: ${profile.display_name}`}>
        {profile.display_name.charAt(0).toLocaleUpperCase('tr')}
      </Link>
    </>
  )
}

export function LeagueSwitcherSkeleton() {
  return (
    <>
      <div className="skeleton" style={{ width: 170, height: 44, borderRadius: 22 }} />
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 20 }} />
    </>
  )
}
