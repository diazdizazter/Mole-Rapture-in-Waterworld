const GRID_SIZE = 5;
const CENTER_INDEX = 12;
const BASE_CLICKS = 90;
const BASE_SPAWN_MS = 1100;
const BASE_TOKEN_MS = 900;

const tokenConfig = {
  jerry: { label: 'Jerry', image: 'img/better-jerry.png' },
  deadFish: { label: 'Dead Fish', image: 'img/dead-fish.png' },
  yellowSkull: { label: 'Yellow Skull', image: 'img/yellow-skull.png' },
  bio: { label: 'Bio', image: 'img/bio.png' },
  well: { label: 'Well', image: 'img/well-logo.png' },
  spring: { label: 'Spring', image: 'img/spring-logo.png' },
  pool: { label: 'Pool', image: 'img/pool-logo.png' },
  waterGirl: { label: 'Water Girl', image: 'img/water-girl.png' },
  nuke: { label: 'Nuke', image: 'img/nuke.png' }
};

const state = {
  active: false,
  ended: false,
  mainScore: 0,
  reserveScore: 0,
  clicksLeft: BASE_CLICKS,
  totalJerry: 0,
  spawnCount: 0,
  waterGirlChanceBonus: 0,
  nukeChanceBonus: 0,
  springCharges: 0,
  bioCharges: 0,
  activeToken: null,
  spawnInterval: null,
  tokenTimeout: null,
  counts: Object.keys(tokenConfig).reduce((acc, key) => ({ ...acc, [key]: 0 }), {})
};

function createGrid() {
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'grid-cell';
    cell.dataset.index = String(i);
    if (i === CENTER_INDEX) {
      cell.classList.add('center-lock');
      cell.disabled = true;
      cell.setAttribute('aria-label', 'Center locked');
    }
    grid.appendChild(cell);
  }
}

function setMessage(text, type = '') {
  const message = document.getElementById('message');
  message.className = `message ${type}`.trim();
  message.textContent = text;
}

function getWaterGirlChance() {
  return 0.02 + state.waterGirlChanceBonus / 100;
}

function getNukeChance() {
  return 0.02 + state.nukeChanceBonus / 100;
}

function getSpeedMultiplier() {
  const nukeBoost = 1 + Math.floor(state.nukeChanceBonus / 5) * 0.08;
  const slowFromGirl = state.waterGirlChanceBonus >= 10 ? 0.85 : 1;
  const rampBoost = 1 + Math.floor((state.nukeChanceBonus + state.waterGirlChanceBonus) / 10) * 0.04;
  return nukeBoost * slowFromGirl * rampBoost;
}

function getSpawnMs() {
  return Math.max(350, Math.round(BASE_SPAWN_MS / getSpeedMultiplier()));
}

function getTokenLifetime(type) {
  let ms = Math.round(BASE_TOKEN_MS / getSpeedMultiplier());
  if (type === 'nuke') ms += 420;
  if (state.bioCharges > 0 && ['jerry', 'well', 'spring', 'pool'].includes(type)) ms = Math.round(ms * 0.68);
  if (type === 'waterGirl') ms = Math.round(ms * 0.5);
  return Math.max(260, ms);
}

function updateStats() {
  document.getElementById('main-score').textContent = String(state.mainScore);
  document.getElementById('reserve-score').textContent = String(Math.max(0, state.reserveScore));
  document.getElementById('clicks-left').textContent = String(state.clicksLeft);
  document.getElementById('water-girl-percent').textContent = `${Math.round(getWaterGirlChance() * 100)}%`;
  document.getElementById('nuke-percent').textContent = `${Math.round(getNukeChance() * 100)}%`;
}

function renderInventory() {
  const list = document.getElementById('inventory-list');
  list.innerHTML = '';
  Object.entries(tokenConfig).forEach(([key, data]) => {
    const row = document.createElement('div');
    row.className = 'inventory-row';
    row.innerHTML = `
      <img src="${data.image}" alt="${data.label}">
      <span>${data.label}</span>
      <strong>${state.counts[key]}</strong>
    `;
    list.appendChild(row);
  });
}

function clearActiveToken() {
  if (!state.activeToken) return;
  const cell = document.querySelector(`.grid-cell[data-index="${state.activeToken.index}"]`);
  if (cell) {
    cell.innerHTML = '';
    cell.classList.remove('active-cell');
  }
  state.activeToken = null;
}

function endGame(win) {
  state.active = false;
  state.ended = true;
  clearInterval(state.spawnInterval);
  clearTimeout(state.tokenTimeout);
  clearActiveToken();

  const centerCell = document.querySelector(`.grid-cell[data-index="${CENTER_INDEX}"]`);
  const grid = document.getElementById('game-grid');
  if (centerCell) {
    centerCell.disabled = false;
    centerCell.classList.remove('center-lock');
    const icon = win ? tokenConfig.waterGirl.image : tokenConfig.nuke.image;
    centerCell.innerHTML = `<img class="token" src="${icon}" alt="${win ? 'Water Girl' : 'Nuke'}">`;
  }
  grid.classList.toggle('win-grid', win);
  grid.classList.toggle('loss-grid', !win);
  setMessage(win ? 'Instant win! Water Girl saved Waterworld.' : 'Instant loss! Nuke meltdown.', win ? 'win' : 'loss');
}

function spendClick() {
  state.clicksLeft -= 1;
  if (state.clicksLeft <= 0 && !state.ended) {
    endGame(state.mainScore > 0);
  }
}

function applyJerryBonus() {
  const reserveStep = state.waterGirlChanceBonus >= 5 ? 4 : 5;
  if (state.totalJerry % reserveStep === 0) state.reserveScore += 1;
}

function applyTokenEffect(type, index) {
  const jerryPoints = state.waterGirlChanceBonus >= 5 ? 2 : 1;
  if (type === 'waterGirl') return endGame(true);
  if (type === 'nuke') return endGame(false);

  if (type === 'jerry') {
    state.mainScore += jerryPoints;
    state.totalJerry += 1;
    applyJerryBonus();
    setMessage(`+${jerryPoints} Jerry collected.`);
  }
  if (type === 'deadFish') {
    state.mainScore -= 1;
    state.reserveScore = Math.max(0, state.reserveScore - 1);
    setMessage('Dead Fish hit: -1 main, -1 reserve.', 'loss');
  }
  if (type === 'yellowSkull') {
    state.mainScore -= 1;
    state.nukeChanceBonus += 1;
    setMessage('Yellow Skull hit: -1 main, +1% nuke.', 'loss');
  }
  if (type === 'bio') {
    state.mainScore -= 1;
    state.bioCharges = 10;
    setMessage('Bio hit: good tokens stay up less (10 clicks).', 'loss');
  }
  if (type === 'well') {
    if (Math.random() < 0.5) {
      state.mainScore += 1;
      setMessage('Well bonus: +1 main.');
    } else {
      state.reserveScore += 1;
      setMessage('Well bonus: +1 reserve.');
    }
    state.waterGirlChanceBonus += 1;
  }
  if (type === 'spring') {
    state.mainScore += 1;
    state.springCharges = 10;
    setMessage('Spring bonus: good token bounce active (10 clicks).');
  }
  if (type === 'pool') {
    state.mainScore += 1;
    state.reserveScore += 1;
    setMessage('Pool bonus: +1 main, +1 reserve.');
  }

  if (state.mainScore <= 0) endGame(false);

  if (state.springCharges > 0 || state.bioCharges > 0) {
    if (state.springCharges > 0) state.springCharges -= 1;
    if (state.bioCharges > 0) state.bioCharges -= 1;
  }

  if (type === 'spring' && state.active && !state.ended) {
    setTimeout(() => spawnToken(index, true), 900);
  }
}

function pickTokenType() {
  state.spawnCount += 1;
  const oddSpawn = state.spawnCount % 2 === 1;
  const evenSpawn = !oddSpawn;
  const nukeChance = getNukeChance();
  const waterGirlChance = getWaterGirlChance();

  if (oddSpawn && Math.random() < waterGirlChance) return 'waterGirl';
  if (evenSpawn && Math.random() < nukeChance) return 'nuke';

  const pool = [
    ['jerry', state.waterGirlChanceBonus >= 7 ? 26 : 38],
    ['deadFish', state.nukeChanceBonus >= 6 ? 0 : 12],
    ['yellowSkull', state.nukeChanceBonus >= 11 ? 0 : 12],
    ['bio', 11],
    ['well', 10],
    ['spring', 9],
    ['pool', 8]
  ];

  if (state.nukeChanceBonus >= 6) pool.push(['nuke', 10]);
  if (state.nukeChanceBonus >= 11) pool.push(['nuke', 12]);
  if (state.waterGirlChanceBonus >= 7) pool.push(['waterGirl', 8]);

  const totalWeight = pool.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  for (const [type, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return 'jerry';
}

function getSpawnIndex() {
  const indices = [];
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
    if (i !== CENTER_INDEX) indices.push(i);
  }
  return indices[Math.floor(Math.random() * indices.length)];
}

function spawnToken(preferredIndex, isBounce = false) {
  if (!state.active || state.ended) return;
  clearTimeout(state.tokenTimeout);
  clearActiveToken();

  const type = pickTokenType();
  const index = typeof preferredIndex === 'number' ? preferredIndex : getSpawnIndex();
  const cell = document.querySelector(`.grid-cell[data-index="${index}"]`);
  if (!cell) return;

  cell.classList.add('active-cell');
  cell.innerHTML = `<img class="token ${type}" src="${tokenConfig[type].image}" alt="${tokenConfig[type].label}">`;
  state.activeToken = { type, index };
  state.counts[type] += 1;
  updateStats();
  renderInventory();

  const duration = isBounce ? 2000 : getTokenLifetime(type);
  state.tokenTimeout = setTimeout(() => {
    if (state.activeToken && state.activeToken.index === index) clearActiveToken();
  }, duration);
}

function startSpawnLoop() {
  clearInterval(state.spawnInterval);
  state.spawnInterval = setInterval(() => {
    if (state.active && !state.ended) spawnToken();
  }, getSpawnMs());
}

function startGame() {
  if (state.active) return;
  state.active = true;
  state.ended = false;
  state.mainScore = 0;
  state.reserveScore = 0;
  state.clicksLeft = BASE_CLICKS;
  state.totalJerry = 0;
  state.spawnCount = 0;
  state.waterGirlChanceBonus = 0;
  state.nukeChanceBonus = 0;
  state.springCharges = 0;
  state.bioCharges = 0;
  state.counts = Object.keys(tokenConfig).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  document.getElementById('game-grid').classList.remove('win-grid', 'loss-grid');
  createGrid();
  updateStats();
  renderInventory();
  setMessage('Game started. Tap tokens and survive the chaos.');
  spawnToken();
  startSpawnLoop();
}

function resetGame() {
  state.active = false;
  state.ended = false;
  clearInterval(state.spawnInterval);
  clearTimeout(state.tokenTimeout);
  state.mainScore = 0;
  state.reserveScore = 0;
  state.clicksLeft = BASE_CLICKS;
  state.totalJerry = 0;
  state.spawnCount = 0;
  state.waterGirlChanceBonus = 0;
  state.nukeChanceBonus = 0;
  state.springCharges = 0;
  state.bioCharges = 0;
  state.activeToken = null;
  state.counts = Object.keys(tokenConfig).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  createGrid();
  document.getElementById('game-grid').classList.remove('win-grid', 'loss-grid');
  updateStats();
  renderInventory();
  setMessage('Reset complete. Press Start to play.');
}

document.getElementById('game-grid').addEventListener('click', (event) => {
  const cell = event.target.closest('.grid-cell');
  if (!cell || !state.active || state.ended || !state.activeToken) return;
  const index = Number(cell.dataset.index);
  if (index !== state.activeToken.index) return;

  const { type } = state.activeToken;
  clearTimeout(state.tokenTimeout);
  clearActiveToken();
  spendClick();
  if (state.ended) return;
  applyTokenEffect(type, index);
  updateStats();
  renderInventory();
  if (state.active && !state.ended) {
    startSpawnLoop();
    spawnToken();
  }
});

document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('reset-game').addEventListener('click', resetGame);

createGrid();
updateStats();
renderInventory();
