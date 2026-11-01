import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export type LeagueMode = 'classic' | 'draft'
export type LeagueFormat = 'total' | 'h2h'

export type League = {
  id: string
  name: string
  mode: LeagueMode
  format: LeagueFormat
  color: string
  inviteCode: string
  isPublic: boolean
  isOwner: boolean
  teamId: string | null
  teamName: string | null
}

export type MyLeagues = {
  classicTeam: { id: string; name: string } | null
  leagues: League[]
}

export const SELECTED_LEAGUE_COOKIE = 'tribun_lig'

// Each league gets a stable color for the switcher and header, unless it has its own.
const LEAGUE_COLORS = ['#FF5B23', '#D9A62E', '#8CC3FF', '#7BD389', '#E86A92', '#B8A1FF']
function leagueColor(id: string, own: string | null) {
  if (own) return own
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return LEAGUE_COLORS[hash % LEAGUE_COLORS.length]
}

export async function getUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) return null
  return { id: claims.sub as string, email: (claims.email as string | undefined) ?? null }
}

export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/giris')
  return user
}

export type Profile = { id: string; username: string; display_name: string; favorite_club_id: number | null }

export async function getProfile(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, username, display_name, favorite_club_id').eq('id', userId).maybeSingle()
  return (data as Profile | null) ?? null
}

type LeagueRow = {
  id: string
  name: string
  mode: LeagueMode
  format: LeagueFormat
  color: string | null
  invite_code: string
  is_public: boolean
  owner_id: string | null
}

const LEAGUE_FIELDS = 'id, name, mode, format, color, invite_code, is_public, owner_id'

export async function getMyLeagues(userId: string): Promise<MyLeagues> {
  const supabase = await createClient()
  const { data: teamRows } = await supabase.from('teams').select('id, name, mode, league_id').eq('owner_id', userId)
  const teams = (teamRows ?? []) as { id: string; name: string; mode: LeagueMode; league_id: string | null }[]
  const classicTeam = teams.find((t) => t.mode === 'classic') ?? null
  const teamIds = teams.map((t) => t.id)

  const byId = new Map<string, League>()
  const add = (row: LeagueRow, teamId: string | null) => {
    const team = teams.find((t) => t.id === teamId) ?? null
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      mode: row.mode,
      format: row.format,
      color: leagueColor(row.id, row.color),
      inviteCode: row.invite_code,
      isPublic: row.is_public,
      isOwner: row.owner_id === userId,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
    })
  }

  if (teamIds.length) {
    const { data: memberRows } = await supabase
      .from('league_members')
      .select(`team_id, leagues (${LEAGUE_FIELDS})`)
      .in('team_id', teamIds)
    for (const m of (memberRows ?? []) as unknown as { team_id: string; leagues: LeagueRow | null }[]) {
      if (m.leagues) add(m.leagues, m.team_id)
    }
  }

  // Leagues you created but haven't joined with a team yet (a classic league before your team exists)
  const { data: ownedRows } = await supabase.from('leagues').select(LEAGUE_FIELDS).eq('owner_id', userId)
  for (const row of (ownedRows ?? []) as LeagueRow[]) {
    if (!byId.has(row.id)) add(row, null)
  }

  const leagues = [...byId.values()].sort(
    (a, b) => Number(a.mode === 'draft') - Number(b.mode === 'draft') || a.name.localeCompare(b.name, 'tr'),
  )
  return { classicTeam: classicTeam ? { id: classicTeam.id, name: classicTeam.name } : null, leagues }
}

export async function getSelectedLeague(leagues: League[]) {
  const id = (await cookies()).get(SELECTED_LEAGUE_COOKIE)?.value
  return leagues.find((l) => l.id === id) ?? leagues[0] ?? null
}

export type Round = { id: number; number: number; deadline_at: string | null; status: string }

export async function getNextRound() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('next_round')
  const round = data as Round | null
  return round?.id ? round : null
}
