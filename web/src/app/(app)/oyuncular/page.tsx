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
  clubs: { short_code: string; color_primary: string | null; color_secondary: string | null } | null
}

const price = (x: number | null) => (x == null ? '–' : x.toFixed(1).replace('.', ','))

async function Oyuncular() {
  const supabase = await createClient()
  const { data: season } = await supabase.rpc('current_season')
  const { data, count } = await supabase
    .from('player_seasons')
    .select('player_id, position, price, players (name), clubs (short_code, color_primary, color_secondary)', {
      count: 'exact',
    })
    .eq('season_id', season as number)
    .order('price', { ascending: false, nullsFirst: false })
    .order('player_id')
    .limit(60)
  const players = (data ?? []) as unknown as PlayerRow[]

  return (
    <>
      <PageTitle label={count ? `Süper Lig · ${count} oyuncu` : 'Süper Lig'} title="Oyuncular" />
      {players.length ? (
        <>
          <p className="note">En pahalı 60 oyuncu. Fiyatlar geçici: fiyatlandırma kuralı netleşince güncellenecek.</p>
          <ul className="list card">
            {players.map((p) => (
              <li key={p.player_id}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    width: 10,
                    height: 14,
                    borderRadius: 2,
                    overflow: 'hidden',
                    boxShadow: '0 0 0 1px rgba(241,238,228,0.25)',
                  }}
                >
                  <span style={{ flex: 1, background: p.clubs?.color_primary ?? 'var(--line-strong)' }} />
                  <span style={{ flex: 1, background: p.clubs?.color_secondary ?? 'var(--line-strong)' }} />
                </span>
                <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {p.players?.name}
                  </span>
                  <span className="note" style={{ fontSize: 13 }}>
                    {p.clubs?.short_code} · {p.position}
                  </span>
                </span>
                <span className="big-number" style={{ fontSize: 22, minWidth: 44, textAlign: 'right' }}>
                  {price(p.price)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">
          <p className="label">Oyuncu listesi yakında</p>
          <p className="note">Süper Lig kadroları veritabanına aktarıldığında oyuncular burada listelenecek.</p>
        </div>
      )}
    </>
  )
}
