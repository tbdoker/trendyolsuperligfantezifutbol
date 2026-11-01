// Both values are public: the browser sees them anyway. Row level security protects the data.
export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set (see web/.env.example)')
  return url
}

// The Supabase–Vercel integration may set the key under either name; both are the public key.
export function supabaseKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see web/.env.example)')
  return key
}
