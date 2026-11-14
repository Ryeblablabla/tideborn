import './leaderboard-ui.css';
import { getLeaderboard, leaderboardAvailable, submitLeaderboard } from './leaderboard-api.js';

function formatTime(durationMs) {
  const pad = (value, digits = 2) => String(Math.floor(value)).padStart(digits, '0');
  return `${pad(durationMs / 60_000)}:${pad(durationMs / 1000 % 60)}.${pad(durationMs % 1000, 3)}`;
}

function formatLength(lengthTenths) {
  return `${(lengthTenths / 10).toFixed(1)} 节`;
}

export function leaderboardEntry(submittable = false) {
  return `<button class="secondary leaderboard-entry" type="button" data-action="leaderboard" aria-haspopup="dialog">
    <span class="brush-label">${submittable ? '成绩上榜' : '排行榜'}</span>
  </button>`;
}

export function leaderboardPanel(score) {
  return `<section class="modal leaderboard-modal">
    <header class="leaderboard-heading">
      <h2>排行榜</h2>
      <button class="text-button" type="button" data-action="closeLeaderboard">返回</button>
    </header>
    ${score ? `<section class="leaderboard-submission" aria-label="本局成绩">
      <dl>
        <div><dt>本局用时</dt><dd>${formatTime(score.durationMs)}</dd></div>
        <div><dt>本局身长</dt><dd>${formatLength(score.lengthTenths)}</dd></div>
      </dl>
      <form class="leaderboard-form" hidden>
        <label for="leaderboard-nickname">公开昵称</label>
        <div class="leaderboard-form-row">
          <input id="leaderboard-nickname" name="nickname" type="text" maxlength="32" required
            autocapitalize="off" spellcheck="false" placeholder="最多 16 字"
            aria-describedby="leaderboard-submit-status">
          <button class="primary" type="submit">提交成绩</button>
        </div>
      </form>
      <p class="leaderboard-status" id="leaderboard-submit-status" role="status"></p>
    </section>` : ''}
    <div class="leaderboard-sorts" role="group" aria-label="排行榜排序">
      <button type="button" class="secondary" data-sort="fast" aria-pressed="true">最快通关</button>
      <button type="button" class="secondary" data-sort="long" aria-pressed="false">最长龙身</button>
    </div>
    <div class="leaderboard-records" data-sort="fast">
      <p class="leaderboard-status" role="status"></p>
      <button class="text-button leaderboard-retry" type="button" hidden>重新加载</button>
      <div class="leaderboard-scroll" hidden>
        <table aria-label="玩家成绩">
          <colgroup><col class="leaderboard-rank-col"><col><col class="leaderboard-time-col"><col class="leaderboard-length-col"></colgroup>
          <thead><tr>
            <th scope="col">名次</th><th scope="col">昵称</th>
            <th scope="col" aria-sort="ascending">用时</th><th scope="col">身长</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>`;
}

export function mountLeaderboard(panel, score, submission) {
  const sortButtons = [...panel.querySelectorAll('.leaderboard-sorts button')];
  const records = panel.querySelector('.leaderboard-records');
  const status = records.querySelector('.leaderboard-status');
  const retry = records.querySelector('.leaderboard-retry');
  const scroll = records.querySelector('.leaderboard-scroll');
  const tableBody = records.querySelector('tbody');
  const [, , timeHeader, lengthHeader] = records.querySelectorAll('th');
  let sort = 'fast';
  let request = 0;

  async function load() {
    const activeRequest = ++request;
    scroll.hidden = true;
    retry.hidden = true;
    if (!leaderboardAvailable) {
      status.textContent = '请在联机网页版查看排行榜。';
      return;
    }
    status.textContent = '正在读取排行榜…';
    try {
      const { entries } = await getLeaderboard(sort);
      if (request !== activeRequest || !panel.isConnected) return;
      tableBody.replaceChildren();
      for (const [index, entry] of entries.entries()) {
        const row = tableBody.insertRow();
        const name = document.createElement('bdi');
        name.textContent = entry.nickname;
        row.insertCell().textContent = index + 1;
        row.insertCell().append(name);
        row.insertCell().textContent = formatTime(entry.durationMs);
        row.insertCell().textContent = formatLength(entry.lengthTenths);
      }
      scroll.hidden = entries.length === 0;
      scroll.scrollTop = 0;
      status.textContent = entries.length === 0 ? '还没有玩家上榜。' : '';
    } catch (error) {
      if (request !== activeRequest || !panel.isConnected) return;
      status.textContent = error.message || '排行榜暂时无法读取。';
      retry.hidden = false;
    }
  }

  for (const button of sortButtons) {
    button.addEventListener('click', () => {
      if (button.dataset.sort === sort) return;
      sort = button.dataset.sort;
      records.dataset.sort = sort;
      for (const option of sortButtons) option.setAttribute('aria-pressed', String(option === button));
      const sorted = sort === 'fast' ? timeHeader : lengthHeader;
      const unsorted = sort === 'fast' ? lengthHeader : timeHeader;
      sorted.setAttribute('aria-sort', sort === 'fast' ? 'ascending' : 'descending');
      unsorted.removeAttribute('aria-sort');
      load();
    });
  }
  retry.addEventListener('click', load);
  load();
  if (score) mountSubmission(panel, score, submission, load);
}

function mountSubmission(panel, score, submission, refresh) {
  const form = panel.querySelector('.leaderboard-form');
  const input = form.elements.nickname;
  const button = form.querySelector('button');
  const status = panel.querySelector('#leaderboard-submit-status');
  input.value = submission.nickname;

  function showOutcome() {
    if (!panel.isConnected) return;
    input.readOnly = false;
    button.disabled = false;
    if (submission.entry) {
      if (form.contains(document.activeElement)) panel.focus({preventScroll: true});
      form.hidden = true;
      status.textContent = '成绩已提交，两张榜使用同一份成绩。';
    } else {
      status.textContent = submission.error ?? '';
    }
  }

  function waitForSubmission() {
    input.readOnly = true;
    button.disabled = true;
    status.textContent = '正在提交成绩…';
    submission.pending.then(() => {
      showOutcome();
      if (panel.isConnected && submission.entry) refresh();
    });
  }

  if (submission.entry) {
    showOutcome();
    return;
  }

  status.textContent = '正在读取本局的上榜资格…';
  score.run.then(({ runToken, error }) => {
    if (!panel.isConnected) return;
    if (!runToken) {
      status.textContent = error || '本局无法提交排行榜成绩。';
      return;
    }
    form.hidden = false;
    if (submission.pending) waitForSubmission();
    else showOutcome();
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (submission.pending || submission.entry) return;
      const nickname = input.value.trim().normalize('NFC');
      if (!nickname || Array.from(nickname).length > 16) {
        input.setAttribute('aria-invalid', 'true');
        status.textContent = '请输入 1 到 16 字的昵称。';
        input.focus();
        return;
      }
      input.value = nickname;
      submission.nickname = nickname;
      submission.error = '';
      const { durationMs, lengthTenths } = score;
      submission.pending = submitLeaderboard({ runToken, nickname, durationMs, lengthTenths })
        .then(({ entry }) => { submission.entry = entry; })
        .catch(error => { submission.error = error.message || '提交未成功，请再试。'; })
        .finally(() => { submission.pending = null; });
      waitForSubmission();
    });
    input.addEventListener('input', () => {
      submission.nickname = input.value;
      submission.error = '';
      input.removeAttribute('aria-invalid');
      status.textContent = '';
    });
  });
}
