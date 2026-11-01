import Link from 'next/link'

export function PageSkeleton() {
  return (
    <div className="stack" aria-hidden="true">
      <div className="skeleton" style={{ width: 120, height: 14 }} />
      <div className="skeleton" style={{ width: 220, height: 38 }} />
      <div className="skeleton" style={{ height: 160 }} />
    </div>
  )
}

export function NoLeague() {
  return (
    <div className="empty">
      <p className="label">Henüz bir ligde değilsin</p>
      <p className="note">Arkadaşlarınla bir lig kur ya da sana gönderilen davet koduyla katıl.</p>
      <div className="choices" style={{ width: '100%' }}>
        <Link href="/lig/yeni" className="btn">
          Lig kur
        </Link>
        <Link href="/lig/katil" className="btn btn-ghost">
          Davetle katıl
        </Link>
      </div>
    </div>
  )
}

export function PageTitle({ label, title }: { label: string; title: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <p className="label">{label}</p>
      <h1 className="title">{title}</h1>
    </div>
  )
}
