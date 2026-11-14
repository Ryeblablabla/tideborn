// The web build serves the game and scores from the same origin.
export const leaderboardAvailable = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);

async function requestLeaderboard(path = '', data) {
  if (!leaderboardAvailable) throw new Error('请在网页版查看共享排行榜。');

  let response;
  try {
    response = await fetch(`./api/leaderboard${path}`, {
      ...(data === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('排行榜暂时连不上，请稍后再试。');
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(result?.error || '排行榜暂时不可用，请稍后再试。');
  }
  return result;
}

export function startLeaderboardRun() {
  return requestLeaderboard('/runs', {});
}

export function getLeaderboard(sort) {
  return requestLeaderboard(`?sort=${encodeURIComponent(sort)}`);
}

export function submitLeaderboard(score) {
  return requestLeaderboard('', score);
}
