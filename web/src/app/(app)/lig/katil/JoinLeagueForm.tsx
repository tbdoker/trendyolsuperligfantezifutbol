'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { joinLeague, type FormState } from '@/lib/actions'

export function JoinLeagueForm() {
  const [state, action] = useActionState<FormState, FormData>(joinLeague, {})
  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <div className="field">
        <label htmlFor="code">Davet kodu</label>
        <input
          id="code"
          name="code"
          className="input"
          placeholder="a1b2c3d4"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          style={{ letterSpacing: '0.08em' }}
        />
      </div>
      <div className="field">
        <label htmlFor="team_name">Takımının adı (draft ligleri için)</label>
        <input id="team_name" name="team_name" className="input" placeholder="Ofsayt Tuzağı" maxLength={30} />
      </div>
      <p className="note">Klasik bir lige katılırken mevcut klasik takımınla girersin.</p>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pendingText="Katılıyor…">Katıl</SubmitButton>
    </form>
  )
}
