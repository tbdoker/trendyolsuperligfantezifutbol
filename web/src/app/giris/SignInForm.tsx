'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { signIn, type FormState } from '@/lib/actions'

export function SignInForm() {
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
      <SubmitButton pendingText="Gönderiliyor…">Giriş bağlantısı gönder</SubmitButton>
      <p className="note" style={{ fontSize: 13 }}>
        Şifre yok: e-postana gelen bağlantıya dokunman yeterli. İlk girişte hesabın açılır.
      </p>
    </form>
  )
}
