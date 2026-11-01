'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Kilim motifs on a pixel grid: the border band (24×18) and the faint göz field behind the tabs.
const BAND_WOOL = 'M0 0h24v2h-24zM0 6h2v2h-2zM22 6h2v2h-2zM0 8h4v2h-4zM20 8h4v2h-4zM0 10h2v2h-2zM22 10h2v2h-2zM0 16h24v2h-24z'
const BAND_MOTIF = 'M10 4h4v2h-4zM8 6h8v2h-8zM6 8h4v2h-4zM14 8h4v2h-4zM8 10h8v2h-8zM10 12h4v2h-4z'
const GOZ =
  'M5 0h2v1h-2zM4 1h4v1h-4zM3 2h2v1h-2zM7 2h2v1h-2zM2 3h2v1h-2zM8 3h2v1h-2zM1 4h2v1h-2zM9 4h2v1h-2zM0 5h2v1h-2zM10 5h2v1h-2zM0 6h2v1h-2zM10 6h2v1h-2zM1 7h2v1h-2zM9 7h2v1h-2zM2 8h2v1h-2zM8 8h2v1h-2zM3 9h2v1h-2zM7 9h2v1h-2zM4 10h4v1h-4zM5 11h2v1h-2z'

const TABS = [
  { href: '/mac', label: 'Maç', icon: <path d="M3 12h4l3-7 4 14 3-7h4" /> },
  {
    href: '/kadro',
    label: 'Kadro',
    icon: <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" />,
  },
  {
    href: '/oyuncular',
    label: 'Oyuncular',
    icon: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
        <path d="M16 3.5a4 4 0 0 1 0 7" />
        <path d="M22 21v-1a5 5 0 0 0-3.5-4.8" />
      </>
    ),
  },
  {
    href: '/lig',
    label: 'Lig',
    icon: (
      <>
        <path d="M8 21h8M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
        <path d="M17 6h3v1a3 3 0 0 1-3 3M7 6H4v1a3 3 0 0 0 3 3" />
      </>
    ),
  },
]

export function TabBar() {
  const pathname = usePathname()
  return (
    <nav className="tabbar" aria-label="Ana menü">
      <svg className="tabbar-pattern" aria-hidden="true" shapeRendering="crispEdges">
        <defs>
          <pattern id="kband" x="3" y="0" width="24" height="18" patternUnits="userSpaceOnUse">
            <path d={BAND_WOOL} fill="#e8e0cc" fillOpacity="0.4" />
            <path d={BAND_MOTIF} style={{ fill: 'var(--accent)' }} />
          </pattern>
          <pattern id="kfield" x="3" y="18" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d={GOZ} transform="scale(2)" fill="#e8e0cc" fillOpacity="0.06" />
          </pattern>
        </defs>
        <rect width="100%" height="18" fill="url(#kband)" />
        <rect y="18" width="100%" height="100%" fill="url(#kfield)" />
      </svg>
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link key={tab.href} href={tab.href} className="tab" aria-current={active ? 'page' : undefined}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {tab.icon}
            </svg>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
