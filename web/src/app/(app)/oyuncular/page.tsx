import { Suspense } from 'react'
import { PageSkeleton, PageTitle } from '@/components/PageStates'
import { createClient } from '@/lib/supabase/server'

export default function OyuncularPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Oyuncular />
    </Suspense>
  )
}

type PlayerRow = {
  player_id: number
  position: 'KL' | 'DF' | 'OS' | 'FV'
  price: number | null
  players: { name: string } | null
  clubs: { short_code: string } | null
}

async function Oyuncular() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('player_seasons')
    .select('player_id, position, price, players (name), clubs (short_code)')
    .order('price', { ascending: false, nullsFirst: false })
    .limit(50)
  const players = (data ?? []) as unknown as PlayerRow[]

  return (
    <>
      <PageTitle label="Süper Lig" title="Oyuncular" />
      {players.length ? (
        <ul className="list card">
          {players.map((p) => (
            <li key={p.player_id}>
              <span style={{ flex: 1, fontWeight: 600 }}>{p.players?.name}</span>
              <span className="note">
                {p.clubs?.short_code} · {p.position}
              </span>
              <span className="big-number" style={{ fontSize: 20, minWidth: 44, textAlign: 'right' }}>
                {p.price?.toFixed(1).replace('.', ',') ?? '–'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p className="label">Oyuncu listesi yakında</p>
          <p className="note">Süper Lig kadroları veritabanına aktarıldığında oyuncular burada listelenecek.</p>
        </div>
      )}
    </>
  )
}
