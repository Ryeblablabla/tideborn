import './market-choice.css';

const verbs = {
  learn: '习得',
  upgrade: '进阶',
  temper: '淬炼',
  swap: '换招',
  reorient: '改修',
  cascade: '连携',
  dragonArt: '龙术',
  wild: '法宝',
};

function choiceCard(choice, index) {
  const shortcut = index + 1;
  return `
    <button type="button" class="market-choice-card" data-tone="${choice.tone}"
      data-action="marketChoose:${index}" aria-keyshortcuts="${shortcut}">
      <strong class="market-choice-name">${choice.title}</strong>
      <kbd class="market-choice-key" aria-hidden="true">${shortcut}</kbd>
      <span class="market-choice-effect">
        <span class="market-choice-description">${choice.description}</span>
        ${choice.pairing ? `<span class="market-choice-pairing">${choice.pairing}</span>` : ''}
        ${choice.detail ? `<span class="market-choice-detail">${choice.detail}</span>` : ''}
      </span>
      <span class="market-choice-claim">
        <span class="market-choice-seal" aria-hidden="true">取</span>
        <span class="market-choice-verb">${choice.opensCascade ? '招式＋连携' : verbs[choice.kind]}</span>
      </span>
    </button>`;
}

export function renderMarketChoices(choices, source) {
  return `
    <div class="market-choice-surface">
      <section class="modal market-choice-modal">
        ${source==='whirlpool'?'<p class="wonder-market-origin">守住漩涡 · 额外择法</p>':source==='wild'?
          '<p class="wonder-market-origin">镇住兽潮 · 可择一件法宝</p>':''}
        <h2>${source==='wild'?'择一法宝':'择一法门'}</h2>
        <div class="market-choice-grid" style="--choice-count: ${choices.length}">
          ${choices.map(choiceCard).join('')}
        </div>
      </section>
    </div>`;
}
