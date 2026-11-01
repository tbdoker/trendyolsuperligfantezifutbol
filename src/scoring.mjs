// Tribün scoring, version 1.
// Every value is a multiple of 0.5, so totals stay exact in floating point.

export const RULES = {
  appearance: 1, // played 1–59 minutes
  sixtyPlus: 2, // played 60+ minutes (replaces the appearance point)
  goal: { KL: 6, DF: 6, OS: 5, FV: 4 },
  assist: 3,
  action: 0.5, // each chance created, shot on target, tackle, interception, block, save
  cleanSheet: { KL: 4, DF: 4, OS: 1, FV: 0 }, // needs 60+ minutes and 0 conceded
  concededPerTwo: -1, // KL and DF only, for every 2 goals conceded
  penaltySaved: 5,
  penaltyWon: 2,
  yellow: -1,
  red: -3, // a second yellow counts only as a red
  ownGoal: -2,
  errorToGoal: -2,
  penaltyMissed: -2,
  matchBonus: [3, 2, 1], // the top 3 players of each match
};

// Small actions: [stat key, Turkish label shown in the app]
const ACTIONS = [
  ['chances', 'Pozisyon yarattı'],
  ['shotsOnTarget', 'İsabetli şut'],
  ['tackles', 'Top kazanma'],
  ['interceptions', 'Araya girme'],
  ['blocks', 'Şut bloğu'],
  ['saves', 'Kurtarış'],
];

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Score one player's match.
 * @param {object} line normalized stat line, see fromApiFootball() for the fields
 * @returns {{ total: number, rows: { key: string, label: string, count: number|string, points: number }[] }}
 */
export function scoreLine(line) {
  const pos = line.pos;
  const minutes = n(line.minutes);
  const rows = [];
  const add = (key, label, count, points) => {
    if (points !== 0) rows.push({ key, label, count, points });
  };

  if (minutes <= 0) return { total: 0, rows };

  add('minutes', 'Süre', `${minutes}'`, minutes >= 60 ? RULES.sixtyPlus : RULES.appearance);
  add('goals', 'Gol', n(line.goals), n(line.goals) * RULES.goal[pos]);
  add('assists', 'Asist', n(line.assists), n(line.assists) * RULES.assist);
  for (const [key, label] of ACTIONS) add(key, label, n(line[key]), n(line[key]) * RULES.action);

  const conceded = n(line.conceded);
  if (minutes >= 60 && conceded === 0) add('cleanSheet', 'Gol yemedi', '', RULES.cleanSheet[pos]);
  if (pos === 'KL' || pos === 'DF') {
    add('conceded', 'Yenilen gol', conceded, Math.floor(conceded / 2) * RULES.concededPerTwo);
  }

  add('penaltySaved', 'Penaltı kurtardı', n(line.penaltySaved), n(line.penaltySaved) * RULES.penaltySaved);
  add('penaltyWon', 'Penaltı kazandırdı', n(line.penaltyWon), n(line.penaltyWon) * RULES.penaltyWon);

  if (n(line.red) > 0) add('red', 'Kırmızı kart', 1, RULES.red);
  else add('yellow', 'Sarı kart', n(line.yellow), n(line.yellow) * RULES.yellow);

  add('ownGoals', 'Kendi kalesine', n(line.ownGoals), n(line.ownGoals) * RULES.ownGoal);
  add('errors', 'Gole yol açan hata', n(line.errors), n(line.errors) * RULES.errorToGoal);
  add('penaltyMissed', 'Penaltı kaçırdı', n(line.penaltyMissed), n(line.penaltyMissed) * RULES.penaltyMissed);
  add('bonus', 'Maçın yıldızı', '', n(line.bonus));

  const total = rows.reduce((sum, r) => sum + r.points, 0);
  return { total, rows };
}

/**
 * Give the match bonus (+3/+2/+1) to the three best-rated players of one match.
 * Players without a rating get nothing. Ties on rating are broken by points before the bonus.
 * @param {{ id: any, rating: number|null, line: object }[]} players everyone who played in the match
 * @returns {Map<any, number>} player id -> bonus points
 */
export function matchBonus(players) {
  const ranked = players
    .filter((p) => typeof p.rating === 'number' && n(p.line.minutes) > 0)
    .map((p) => ({ ...p, base: scoreLine({ ...p.line, bonus: 0 }).total }))
    .sort((a, b) => b.rating - a.rating || b.base - a.base);
  const out = new Map();
  ranked.slice(0, RULES.matchBonus.length).forEach((p, i) => out.set(p.id, RULES.matchBonus[i]));
  return out;
}

const POSITIONS = { G: 'KL', D: 'DF', M: 'OS', F: 'FV' };

/**
 * Turn one API-Football player statistics block into our stat line.
 * API-Football reports many zero values as null; those become 0 here.
 * @param {object} s players[].statistics[0] from /fixtures/players
 * @param {{ teamConceded: number }} ctx goals conceded by the player's team in the match
 */
export function fromApiFootball(s, ctx) {
  const pos = POSITIONS[s.games?.position] ?? 'OS';
  return {
    pos,
    minutes: n(s.games?.minutes),
    goals: n(s.goals?.total),
    assists: n(s.goals?.assists),
    chances: n(s.passes?.key),
    shotsOnTarget: n(s.shots?.on),
    tackles: n(s.tackles?.total),
    interceptions: n(s.tackles?.interceptions),
    blocks: n(s.tackles?.blocks),
    saves: n(s.goals?.saves),
    // Goalkeepers get their own conceded count. For outfield players we use the team's total for
    // the whole match for now; using goal minutes and substitution times would be more exact.
    conceded: pos === 'KL' && s.goals?.conceded != null ? n(s.goals.conceded) : n(ctx.teamConceded),
    penaltySaved: n(s.penalty?.saved),
    penaltyWon: n(s.penalty?.won),
    penaltyMissed: n(s.penalty?.missed),
    yellow: n(s.cards?.yellow),
    red: n(s.cards?.red),
    ownGoals: 0, // not in player stats; needs the match events
    errors: 0, // not available from API-Football
    bonus: 0,
  };
}
