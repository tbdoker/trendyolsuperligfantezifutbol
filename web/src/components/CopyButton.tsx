'use client'

import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-ghost btn-small"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ text: `Tribün ligime katıl! Davet kodu: ${text}` })
          else await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          // the user closed the share sheet
        }
      }}
    >
      {copied ? 'Tamam' : 'Paylaş'}
    </button>
  )
}
