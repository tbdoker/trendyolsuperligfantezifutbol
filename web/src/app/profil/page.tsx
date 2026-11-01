import { Suspense } from 'react'
import { PageSkeleton } from '@/components/PageStates'
import { signOut } from '@/lib/actions'
import { getProfile, requireUser } from '@/lib/data'
import { ProfileForm } from './ProfileForm'

export default function ProfilePage() {
  return (
    <main className="page">
      <Suspense fallback={<PageSkeleton />}>
        <Profile />
      </Suspense>
    </main>
  )
}

async function Profile() {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <p className="label">{profile ? 'Profil' : 'Hoş geldin'}</p>
        <h1 className="title">{profile ? profile.display_name : 'Seni tanıyalım'}</h1>
        {user.email && <p className="note">{user.email}</p>}
      </div>
      <ProfileForm username={profile?.username ?? ''} displayName={profile?.display_name ?? ''} isNew={!profile} />
      {profile && (
        <form action={signOut}>
          <button type="submit" className="btn btn-ghost btn-block">
            Çıkış yap
          </button>
        </form>
      )}
    </>
  )
}
