import { Suspense } from 'react'
import { LeagueSwitcher, LeagueSwitcherSkeleton } from '@/components/LeagueSwitcher'
import { TabBar } from '@/components/TabBar'

// The frame of the four tabs. The header depends on who is signed in, so it streams in
// behind a Suspense boundary while the rest of the frame shows immediately.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Suspense fallback={<LeagueSwitcherSkeleton />}>
          <LeagueSwitcher />
        </Suspense>
      </header>
      <main className="content">{children}</main>
      <TabBar />
    </div>
  )
}
