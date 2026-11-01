'use client'

import Link from 'next/link'
import { useRef } from 'react'
import type { League } from '@/lib/data'
import { selectLeague } from '@/lib/actions'

type Props = {
  leagues: League[]
  selectedId: string | null
  classicTeamName: string | null
}

const FORMAT_LABEL = { total: 'Toplam puan', h2h: 'Birebir' } as const

export function LeagueSheet({ leagues, selectedId, classicTeamName }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const selected = leagues.find((l) => l.id === selectedId) ?? null
  const classic = leagues.filter((l) => l.mode === 'classic')
  const draft = leagues.filter((l) => l.mode === 'draft')

  const open = () => dialog.current?.showModal()
  const close = () => dialog.current?.close()

  return (
    <>
      <button type="button" className="league-pill" onClick={open} aria-haspopup="dialog">
        {selected ? (
          <>
            <span className="dot" style={{ background: selected.color }} aria-hidden="true" />
            <span className="name">{selected.name}</span>
          </>
        ) : (
          <span className="name">Lig seç</span>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        className="sheet"
        aria-label="Liglerin"
        onClick={(e) => {
          if (e.target === e.currentTarget) close() // tap outside the sheet
        }}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="stack">
          <Section title={classicTeamName ? `Klasik takımım · ${classicTeamName}` : 'Klasik liglerim'}>
            {classic.length ? (
              classic.map((l) => <Row key={l.id} league={l} selected={l.id === selectedId} onPicked={close} />)
            ) : (
              <p className="note">Henüz klasik bir ligde değilsin.</p>
            )}
          </Section>
          <Section title="Draft liglerim">
            {draft.length ? (
              draft.map((l) => <Row key={l.id} league={l} selected={l.id === selectedId} onPicked={close} />)
            ) : (
              <p className="note">Henüz bir draft liginde değilsin.</p>
            )}
          </Section>
          <div className="choices" style={{ marginTop: 8 }}>
            <Link href="/lig/yeni" className="btn btn-ghost btn-small" onClick={close}>
              Lig kur
            </Link>
            <Link href="/lig/katil" className="btn btn-ghost btn-small" onClick={close}>
              Davetle katıl
            </Link>
          </div>
        </div>
      </dialog>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 6 }}>
      <h2 className="label">{title}</h2>
      {children}
    </section>
  )
}

function Row({ league, selected, onPicked }: { league: League; selected: boolean; onPicked: () => void }) {
  return (
    <form action={selectLeague} onSubmit={onPicked}>
      <input type="hidden" name="league_id" value={league.id} />
      <button type="submit" className="sheet-row" aria-current={selected ? 'true' : undefined}>
        <span className="dot" style={{ background: league.color }} aria-hidden="true" />
        <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 16 }}>{league.name}</strong>
          <span className="meta">
            {league.mode === 'draft' ? `Draft · ${league.teamName ?? ''}` : FORMAT_LABEL[league.format]}
            {league.isPublic ? ' · Herkese açık' : ''}
          </span>
        </span>
      </button>
    </form>
  )
}
