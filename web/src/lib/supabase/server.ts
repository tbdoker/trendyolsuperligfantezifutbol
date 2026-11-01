import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseKey, supabaseUrl } from './env'

// A Supabase client for Server Components, Server Actions and Route Handlers.
// Create a new one for every request: it carries that user's session cookies.
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components can't write cookies. The proxy refreshes the session instead.
        }
      },
    },
  })
}
