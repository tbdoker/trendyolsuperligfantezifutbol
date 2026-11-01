'use client'

import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/SubmitButton'
import { createLeague, type FormState } from '@/lib/actions'

export function NewLeagueForm() {
  const [state, action] = useActionState<FormState, FormData>(createLeague, {})
  const [mode, setMode] = useState<'classic' | 'draft'>('classic')

  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <div className="field">
        <label htmlFor="name">Lig adı</label>
        <input id="name" name="name" className="input" placeholder="Kampüs Ligi" required maxLength={40} />
      </div>

      <fieldset className="field">
        <legend>Oyun</legend>
        <div className="choices">
          <label className="choice">
            <input type="radio" name="mode" value="classic" checked={mode === 'classic'} onChange={() => setMode('classic')} />
            <strong>Klasik</strong>
            <span>Herkes 100 krediyle kendi kadrosunu kurar. Aynı oyuncu birden çok takımda olabilir.</span>
          </label>
          <label className="choice">
            <input type="radio" name="mode" value="draft" checked={mode === 'draft'} onChange={() => setMode('draft')} />
            <strong>Draft</strong>
            <span>Draft gecesinde sırayla oyuncu seçilir. Her oyuncu sadece bir takımda olur.</span>
          </label>
        </div>
      </fieldset>

      {mode === 'classic' ? (
        <fieldset className="field">
          <legend>Sıralama</legend>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="format" value="total" defaultChecked />
              <strong>Toplam puan</strong>
              <span>Sezon boyunca en çok puanı toplayan kazanır.</span>
            </label>
            <label className="choice">
              <input type="radio" name="format" value="h2h" />
              <strong>Birebir</strong>
              <span>Her hafta bir rakiple eşleşirsin; galibiyet 3 puan.</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <div className="field">
          <label htmlFor="team_name">Takımının adı</label>
          <input id="team_name" name="team_name" className="input" placeholder="Ofsayt Tuzağı" required maxLength={30} />
        </div>
      )}

      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pendingText="Kuruluyor…">Ligi kur</SubmitButton>
    </form>
  )
}
