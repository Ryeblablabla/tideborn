const BOARD_PATH = '/api/leaderboard';
const BOARD_SIZE = 50;
const RUN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const START_REQUEST_GRACE_MS = 5000;
// The fixed warnings, delays and ending sequence alone take over 30 seconds.
const MIN_CLEAR_TIME_MS = 30_000;
const SCORE_COLUMNS = 'nickname, duration_ms AS durationMs, length_tenths AS lengthTenths';
const ORDER_BY = {
  fast: 'duration_ms ASC, length_tenths DESC, submitted_at ASC, run_id ASC',
  long: 'length_tenths DESC, duration_ms ASC, submitted_at ASC, run_id ASC',
};
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function methodNotAllowed(allow) {
  return json({ error: '请求方式不支持。' }, 405, { Allow: allow });
}

function getSigningKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function encodeSignature(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function issueRun(secret) {
  const token = `${crypto.randomUUID()}.${Date.now()}`;
  const signature = await crypto.subtle.sign('HMAC', await getSigningKey(secret), encoder.encode(token));
  return `${token}.${encodeSignature(signature)}`;
}

async function verifyRun(secret, token) {
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}\.\d{13}\.[\w-]{43}$/.test(token)) return null;

  const [id, issuedAt, encoded] = token.split('.');
  const age = Date.now() - Number(issuedAt);
  const signature = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/') + '='), char => char.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', await getSigningKey(secret), signature, encoder.encode(`${id}.${issuedAt}`));
  return valid && age >= 0 ? { id, age } : null;
}

async function listScores(db, sort) {
  if (sort !== 'fast' && sort !== 'long') return json({ error: '排行榜排序无效。' }, 400);

  const { results: entries } = await db.prepare(`SELECT ${SCORE_COLUMNS} FROM leaderboard_scores ORDER BY ${ORDER_BY[sort]} LIMIT ?`)
    .bind(BOARD_SIZE).all();
  return json({ entries });
}

async function submitScore(request, db, secret) {
  if (Number(request.headers.get('content-length')) > 1024) return json({ error: '成绩资料过长。' }, 413);
  const text = await request.text();
  if (text.length > 1024) return json({ error: '成绩资料过长。' }, 413);

  let score;
  try { score = JSON.parse(text); } catch { return json({ error: '成绩资料无效。' }, 400); }
  const run = await verifyRun(secret, score?.runToken);
  if (!run) return json({ error: '本局的上榜凭证无效。' }, 400);

  // Keep recovery idempotent if a prior submission succeeded but its response was lost.
  const existing = await db.prepare(`SELECT ${SCORE_COLUMNS} FROM leaderboard_scores WHERE run_id = ?`).bind(run.id).first();
  if (existing) return json({ entry: existing });
  if (run.age > RUN_LIFETIME_MS) return json({ error: '本局的上榜凭证已过期。' }, 410);

  const { durationMs, lengthTenths } = score;
  if (!Number.isSafeInteger(durationMs) || durationMs < MIN_CLEAR_TIME_MS || durationMs > run.age + START_REQUEST_GRACE_MS ||
      !Number.isSafeInteger(lengthTenths) || lengthTenths < 30 || lengthTenths > 100000) {
    return json({ error: '这局的通关成绩无法登记。' }, 400);
  }

  const nickname = typeof score.nickname === 'string' ? score.nickname.trim().normalize('NFC') : '';
  if (!nickname || Array.from(nickname).length > 16 || /[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(nickname)) {
    return json({ error: '请填写 1 至 16 个字符的昵称。' }, 400);
  }

  const [, record] = await db.batch([
    db.prepare(`INSERT INTO leaderboard_scores (run_id, nickname, duration_ms, length_tenths, submitted_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (run_id) DO NOTHING`).bind(run.id, nickname, durationMs, lengthTenths, Date.now()),
    db.prepare(`SELECT ${SCORE_COLUMNS} FROM leaderboard_scores WHERE run_id = ?`).bind(run.id),
  ]);
  return json({ entry: record.results[0] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path !== BOARD_PATH && path !== `${BOARD_PATH}/runs`) return env.ASSETS.fetch(request);

    try {
      if (path === BOARD_PATH && request.method === 'GET') {
        return await listScores(env.DB, url.searchParams.get('sort') ?? 'fast');
      }
      if (request.method !== 'POST') return methodNotAllowed(path === BOARD_PATH ? 'GET, POST' : 'POST');
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: '请从游戏页面提交成绩。' }, 403);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return json({ error: '请求格式无效。' }, 415);
      }
      if (!env.LEADERBOARD_SIGNING_KEY) throw new Error('Missing leaderboard signing key');
      if (path.endsWith('/runs')) return json({ runToken: await issueRun(env.LEADERBOARD_SIGNING_KEY) }, 201);
      return await submitScore(request, env.DB, env.LEADERBOARD_SIGNING_KEY);
    } catch (error) {
      console.error('Leaderboard request failed:', error.message);
      return json({ error: '排行榜暂时不可用，请稍后再试。' }, 503);
    }
  },
};
