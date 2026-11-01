'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { saveProfile, type FormState } from '@/lib/actions'

type Props = { username: string; displayName: string; isNew: boolean }

export function ProfileForm({ username, displayName, isNew }: Props) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile, {})
  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <div className="field">
        <label htmlFor="display_name">Adın</label>
        <input id="display_name" name="display_name" className="input" defaultValue={displayName} placeholder="Tuna" required maxLength={30} autoComplete="given-name" />
      </div>
      <div className="field">
        <label htmlFor="username">Kullanıcı adı</label>
        <input
          id="username"
          name="username"
          className="input"
          defaultValue={username}
          placeholder="ofsayt_tuna"
          required
          pattern="[a-z0-9_]{3,20}"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="note" style={{ fontSize: 13 }}>3–20 karakter: küçük harf, rakam ve alt çizgi.</p>
      </div>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pendingText="Kaydediliyor…">{isNew ? 'Başla' : 'Kaydet'}</SubmitButton>
      {!isNew && (
        <Link href="/mac" className="btn btn-ghost btn-block">
          Geri dön
        </Link>
      )}
    </form>
  )
}
