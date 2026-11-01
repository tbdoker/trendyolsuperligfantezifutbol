// Small API-Football client for scripts.
// - keeps requests ~6.5 s apart (the free plan allows about 10 a minute)
// - retries once after a 429
// - never goes over the request budget given for this run

const BASE = 'https://v3.football.api-sports.io';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {}

export function createClient({ key, budget = Infinity, gapMs = 6500 }) {
  if (!key) throw new ApiError('APIFOOTBALL_KEY is not set. Add it as a repository secret.');
  let calls = 0;
  let last = 0;

  async function get(path, params = {}, retried = false) {
    if (calls >= budget) throw new ApiError(`Request budget of ${budget} reached`);
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const since = Date.now() - last;
    if (since < gapMs) await wait(gapMs - since);
    last = Date.now();
    calls++;
    const res = await fetch(url, { headers: { 'x-apisports-key': key } });
    if (res.status === 429 && !retried) {
      await wait(61000);
      return get(path, params, true);
    }
    if (!res.ok) throw new ApiError(`${path}: HTTP ${res.status}`);
    const body = await res.json();
    const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors || {});
    if (errors.length) throw new ApiError(`${path}: ${errors.join(' | ')}`);
    return body;
  }

  return {
    get,
    get calls() {
      return calls;
    },
    get left() {
      return budget - calls;
    },
  };
}
