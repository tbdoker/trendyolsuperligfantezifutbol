// The database's game functions raise errors like "club_limit: At most 3 players from one club".
// The code before the colon picks the Turkish message shown in the app.
const MESSAGES: Record<string, string> = {
  not_signed_in: 'Önce giriş yap.',
  bad_code: 'Bu davet koduyla bir lig bulunamadı.',
  no_classic_team: 'Önce klasik takımını kur, sonra lige katıl.',
  draft_started: 'Bu ligin draftı başladı, artık katılınamaz.',
  league_full: 'Bu lig dolu.',
  draft_is_h2h: 'Draft ligleri birebir (H2H) oynanır.',
  already_has_team: 'Bu sezon zaten bir klasik takımın var.',
  squad_size: 'Kadro 15 farklı oyuncudan oluşur.',
  squad_shape: 'Kadro 2 KL, 5 DF, 5 OS ve 3 FV olmalı.',
  club_limit: 'Bir kulüpten en fazla 3 oyuncu alabilirsin.',
  over_budget: 'Bütçen yetmiyor.',
  not_available: 'Bu oyuncu şu an alınamıyor.',
  formation: 'İlk 11: 1 KL, 3–5 DF, 2–5 OS ve 1–3 FV.',
  captain: 'İlk 11’den bir kaptan ve farklı bir yardımcı kaptan seç.',
  locked: 'Maçı başlamış bir oyuncunun yeri değiştirilemez.',
  deadline_passed: 'Bu haftanın transfer süresi doldu.',
  wildcard_used: 'Bu devrede wildcard’ı zaten kullandın.',
  not_your_turn: 'Sıra sende değil.',
  already_taken: 'Bu oyuncu başka bir takımda.',
  position_full: 'Bu mevkide kadron dolu.',
  not_owner: 'Bunu sadece lig sahibi yapabilir.',
}

const UNIQUE_VIOLATION = '23505'

export function friendlyError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return 'Bir şeyler ters gitti. Tekrar dene.'
  if (error.code === UNIQUE_VIOLATION && error.message?.includes('username')) return 'Bu kullanıcı adı alınmış.'
  const code = error.message?.split(':')[0]?.trim() ?? ''
  return MESSAGES[code] ?? 'Bir şeyler ters gitti. Tekrar dene.'
}
