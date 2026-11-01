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

// "Tuna Döker" or "tuna.doker@…" → "tuna_doker", only letters a–z, digits and _
function suggestUsername(name: string | null, email: string | null) {
  const base = (name ?? email?.split('@')[0] ?? '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  return base.length >= 3 ? base : ''
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
      <ProfileForm
        username={profile?.username ?? suggestUsername(user.name, user.email)}
        displayName={profile?.display_name ?? user.name?.split(' ')[0] ?? ''}
        isNew={!profile}
      />
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
