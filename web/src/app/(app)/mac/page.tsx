import { Suspense } from 'react'
import { NoLeague, PageSkeleton, PageTitle } from '@/components/PageStates'
import { getMyLeagues, getNextRound, getSelectedLeague, requireUser } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'

export default function MacPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Mac />
    </Suspense>
  )
}

async function Mac() {
  const user = await requireUser()
  const { leagues } = await getMyLeagues(user.id)
  const league = await getSelectedLeague(leagues)
  if (!league) return <NoLeague />
  const round = await getNextRound()

  if (league.mode === 'draft') {
    const supabase = await createClient()
    const { data: draft } = await supabase
      .from('drafts')
      .select('status, starts_at, current_pick')
      .eq('league_id', league.id)
      .maybeSingle()
    if (draft && draft.status !== 'done') {
      return (
        <>
          <PageTitle label={league.name} title="Draft gecesi" />
          <div className="card">
            <p className="label">{draft.status === 'live' ? 'Draft sürüyor' : 'Henüz başlamadı'}</p>
            <p className="note">
              {draft.status === 'live'
                ? `Seçim #${draft.current_pick}. Draft odası çok yakında burada açılacak.`
                : 'Lig sahibi draftı başlattığında herkes için draft odası tam ekran açılır.'}
            </p>
          </div>
        </>
      )
    }
  }

  return (
    <>
      <PageTitle label={league.name} title={round ? `Hafta ${round.number}` : 'Bu hafta'} />
      <div className="card">
        <p className="label">{league.format === 'h2h' ? 'Bu haftanın eşleşmesi' : 'Bu haftanın puanı'}</p>
        <p className="note">Maçlar başlayınca puanların burada canlı akar: her aksiyon, her puan, anında.</p>
      </div>
    </>
  )
}
