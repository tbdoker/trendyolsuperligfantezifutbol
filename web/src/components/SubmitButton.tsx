'use client'

import { useFormStatus } from 'react-dom'

type Props = {
  children: React.ReactNode
  pendingText: string
  variant?: 'accent' | 'ghost'
}

export function SubmitButton({ children, pendingText, variant = 'accent' }: Props) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`btn btn-block${variant === 'ghost' ? ' btn-ghost' : ''}`} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  )
}
