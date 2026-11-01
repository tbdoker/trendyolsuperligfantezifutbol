'use client'

import { useSearchParams } from 'next/navigation'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { SubmitButton } from '@/components/SubmitButton'
import { signIn, signInWithGoogle, type FormState } from '@/lib/actions'

const RETURN_ERRORS: Record<string, string> = {
  baglanti: 'Giriş bağlantısı geçersiz ya da süresi dolmuş. Yeni bir bağlantı iste.',
  google: 'Google ile giriş tamamlanamadı. Tekrar dene.',
}

export function SignInForm() {
  const returned = RETURN_ERRORS[useSearchParams().get('hata') ?? '']
  const [googleState, googleAction] = useActionState<FormState, FormData>(() => signInWithGoogle(), {})
  const [state, action] = useActionState<FormState, FormData>(signIn, {})

  if (state.message) {
    return (
      <div className="card" role="status">
        <p className="label">E-postanı kontrol et</p>
        <p className="success">{state.message}</p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      {returned && (
        <p className="error" role="alert">
          {returned}
        </p>
      )}

      <form action={googleAction} className="stack" style={{ gap: 10 }}>
        <GoogleButton />
        {googleState.error && (
          <p className="error" role="alert">
            {googleState.error}
          </p>
        )}
      </form>

      <div className="row" aria-hidden="true" style={{ gap: 12 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span className="label">ya da e-postayla</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>

      <form action={action} className="stack" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="email">E-posta</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" placeholder="sen@ornek.com" required />
        </div>
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton pendingText="Gönderiliyor…" variant="ghost">
          Giriş bağlantısı gönder
        </SubmitButton>
        <p className="note" style={{ fontSize: 13 }}>
          Şifre yok: e-postana gelen bağlantıya dokunman yeterli. İlk girişte hesabın açılır.
        </p>
      </form>
    </div>
  )
}

function GoogleButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-block btn-light" disabled={pending}>
      {pending ? 'Google’a yönlendiriliyor…' : 'Google ile devam et'}
    </button>
  )
}
