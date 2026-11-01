import { Suspense } from 'react'
import { NoLeague, PageSkeleton, PageTitle } from '@/components/PageStates'
import { getMyLeagues, getNextRound, getSelectedLeague, requireUser } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'

export default function KadroPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Kadro />
    </Suspense>
  )
}

type SquadRow = { player_id: number; players: { name: string; short_name: string | null } | null }

async function Kadro() {
  const user = await requireUser()
  const { leagues, classicTeam } = await getMyLeagues(user.id)
  const league = await getSelectedLeague(leagues)
  if (!league) return <NoLeague />

  const teamId = league.mode === 'classic' ? classicTeam?.id : league.teamId
  const teamName = league.mode === 'classic' ? classicTeam?.name : league.teamName
  if (!teamId) {
    return (
      <>
        <PageTitle label="Klasik" title="Kadro" />
        <div className="empty">
          <p className="label">Henüz klasik takımın yok</p>
          <p className="note">100 kredilik bütçeyle 15 kişilik kadronu kuracaksın. Kadro kurma ekranı oyuncu verisi yüklenince açılıyor.</p>
        </div>
      </>
    )
  }

  const round = await getNextRound()
  const supabase = await createClient()
  const { data } = await supabase
    .from('team_players')
    .select('player_id, players (name, short_name)')
    .eq('team_id', teamId)
    .is('left_at', null)
  const squad = (data ?? []) as unknown as SquadRow[]

  return (
    <>
      <PageTitle label={round ? `${league.name} · Hafta ${round.number}` : league.name} title={teamName ?? 'Kadro'} />
      {squad.length ? (
        <ul className="list card">
          {squad.map((p) => (
            <li key={p.player_id}>{p.players?.name ?? `Oyuncu ${p.player_id}`}</li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="label">Kadro boş</p>
          <p className="note">
            {league.mode === 'draft' ? 'Kadron draft gecesinde dolacak.' : 'Kadronda henüz oyuncu yok.'}
          </p>
        </div>
      )}
    </>
  )
}
