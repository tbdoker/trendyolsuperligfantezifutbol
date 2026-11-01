import { Suspense } from 'react'
import { SignInForm } from './SignInForm'

export default function SignInPage() {
  return (
    <main className="page" style={{ justifyContent: 'center' }}>
      <div className="stack" style={{ gap: 6 }}>
        <p className="label">Süper Lig fantezi futbol</p>
        <h1 className="title" style={{ fontSize: 64 }}>
          Tribün
        </h1>
        <p className="note">Klasik ya da draft: kadronu kur, arkadaşlarınla eşleş, her aksiyonda puan topla.</p>
      </div>
      {/* The form reads ?hata=… from the address, which is only known at request time */}
      <Suspense fallback={<div className="skeleton" style={{ height: 240 }} />}>
        <SignInForm />
      </Suspense>
    </main>
  )
}
