'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SELECTED_LEAGUE_COOKIE } from './data'
import { friendlyError } from './errors'
import { createClient } from './supabase/server'

export type FormState = { error?: string; message?: string }

const ONE_YEAR = 60 * 60 * 24 * 365

async function rememberLeague(id: string) {
  ;(await cookies()).set(SELECTED_LEAGUE_COOKIE, id, { maxAge: ONE_YEAR, sameSite: 'lax', httpOnly: true, path: '/' })
}

// Sign in by email: Supabase sends a link that comes back to /auth/callback.
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Geçerli bir e-posta adresi yaz.' }
  const h = await headers()
  const origin = h.get('origin') ?? `https://${h.get('host')}`
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })
  if (error) {
    console.error('signInWithOtp failed', { code: error.code, status: error.status, message: error.message })
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return { error: 'Kısa sürede çok fazla giriş bağlantısı istendi. Biraz bekleyip tekrar dene; gelen kutundaki son bağlantı hâlâ işe yarayabilir.' }
    }
    if (error.code === 'email_address_not_authorized') {
      return { error: 'Test aşamasında sadece ekipteki adreslere e-posta gönderebiliyoruz.' }
    }
    return { error: 'Bağlantı gönderilemedi. Birkaç dakika sonra tekrar dene.' }
  }
  return { message: `${email} adresine bir giriş bağlantısı gönderdik. E-postandaki bağlantıya dokun.` }
}

// Sign in with Google: Supabase sends the browser to Google, which comes back to /auth/callback.
export async function signInWithGoogle(): Promise<FormState> {
  const h = await headers()
  const origin = h.get('origin') ?? `https://${h.get('host')}`
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  })
  if (error || !data.url) {
    console.error('signInWithOAuth failed', { code: error?.code, status: error?.status, message: error?.message })
    return { error: 'Google ile giriş şu an açık değil. E-postayla giriş yapabilirsin.' }
  }
  redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/giris')
}

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get('username') ?? '').trim().toLowerCase()
  const displayName = String(formData.get('display_name') ?? '').trim()
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { error: 'Kullanıcı adı 3–20 karakter olsun: küçük harf, rakam ve alt çizgi.' }
  }
  if (displayName.length < 2) return { error: 'Adını yaz.' }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) redirect('/giris')

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, username, display_name: displayName }, { onConflict: 'id' })
  if (error) return { error: friendlyError(error) }
  redirect('/mac')
}

export async function createLeague(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim()
  const mode = formData.get('mode') === 'draft' ? 'draft' : 'classic'
  const format = mode === 'draft' || formData.get('format') === 'h2h' ? 'h2h' : 'total'
  const teamName = String(formData.get('team_name') ?? '').trim()
  if (name.length < 2) return { error: 'Lige bir isim ver.' }
  if (mode === 'draft' && teamName.length < 2) return { error: 'Draft ligi için takımına bir isim ver.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_league', {
    p_name: name,
    p_mode: mode,
    p_format: format,
    p_team_name: mode === 'draft' ? teamName : null,
  })
  if (error) return { error: friendlyError(error) }
  await rememberLeague(data as string)
  redirect('/lig')
}

export async function joinLeague(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get('code') ?? '').trim().toLowerCase()
  const teamName = String(formData.get('team_name') ?? '').trim()
  if (!code) return { error: 'Davet kodunu yaz.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('join_league', { p_invite_code: code, p_team_name: teamName || null })
  if (error) return { error: friendlyError(error) }
  const { data: league } = await supabase.from('leagues').select('id').eq('invite_code', code).maybeSingle()
  if (league) await rememberLeague((league as { id: string }).id)
  redirect('/lig')
}

export async function selectLeague(formData: FormData) {
  const id = String(formData.get('league_id') ?? '')
  if (id) await rememberLeague(id)
}
