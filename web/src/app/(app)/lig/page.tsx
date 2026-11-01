import { Suspense } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { NoLeague, PageSkeleton, PageTitle } from '@/components/PageStates'
import { getMyLeagues, getSelectedLeague, requireUser } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'

export default function LigPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Lig />
    </Suspense>
  )
}

type MemberRow = {
  team_id: string
  teams: { name: string; profiles: { display_name: string; username: string } | null } | null
}

const MODE_LABEL = { classic: 'Klasik', draft: 'Draft' } as const
const FORMAT_LABEL = { total: 'toplam puan', h2h: 'birebir eşleşmeler' } as const

async function Lig() {
  const user = await requireUser()
  const { leagues } = await getMyLeagues(user.id)
  const league = await getSelectedLeague(leagues)
  if (!league) return <NoLeague />

  const supabase = await createClient()
  const { data } = await supabase
    .from('league_members')
    .select('team_id, teams (name, profiles (display_name, username))')
    .eq('league_id', league.id)
  const members = (data ?? []) as unknown as MemberRow[]

  return (
    <>
      <PageTitle label={`${MODE_LABEL[league.mode]} · ${FORMAT_LABEL[league.format]}`} title={league.name} />

      {!league.isPublic && (
        <section className="card">
          <p className="label">Davet kodu</p>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="big-number" style={{ fontSize: 34, letterSpacing: '0.06em' }}>
              {league.inviteCode}
            </span>
            <CopyButton text={league.inviteCode} />
          </div>
          <p className="note">Arkadaşların bu kodla “Davetle katıl” ekranından lige girer.</p>
        </section>
      )}

      <section className="card">
        <p className="label">Takımlar · {members.length}</p>
        {members.length ? (
          <ul className="list">
            {members.map((m) => (
              <li key={m.team_id}>
                <span className="avatar" aria-hidden="true">
                  {(m.teams?.profiles?.display_name ?? '?').charAt(0).toLocaleUpperCase('tr')}
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <strong>{m.teams?.name}</strong>
                  <span className="note" style={{ fontSize: 13 }}>
                    {m.teams?.profiles?.display_name}
                    {m.team_id === league.teamId ? ' · sen' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">Henüz takım yok. Klasik takımını kurduğunda bu lige otomatik eklenir.</p>
        )}
      </section>
    </>
  )
}
