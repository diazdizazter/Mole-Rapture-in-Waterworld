const GRID_SIZE = 5;
const CENTER_INDEX = 12;
const BASE_CLICKS = 90;
const BASE_SPAWN_MS = 1100;
const BASE_TOKEN_MS = 900;
const GLOBAL_SPEED_BOOST = 1.11;
const STAGE_BASELINE = 4;
const STAGE_UP_MULTIPLIER = 1.12;
const STAGE_DOWN_MULTIPLIER = 0.89;
const GRID_MODE_BY_STAGE = { 1: '3x3', 2: '5x5' };
const WIN_SOUND_PATH = 'wav/mixkit-light-applause-with-laughter-audience-512.wav';
const winAudio = new Audio(WIN_SOUND_PATH);

const tokenConfig = {
  jerry: { label: 'Jerry', image: 'img/better-jerry.png' },
  deadFish: { label: 'Dead Fish', image: 'img/dead-fish.png' },
  yellowSkull: { label: 'Yellow Skull', image: 'img/yellow-skull.png' },
  bio: { label: 'Bio', image: 'img/bio.png' },
  well: { label: 'Well', image: 'img/well-logo.png' },
  spring: { label: 'Spring', image: 'img/spring-logo.png' },
  pool: { label: 'Pool', image: 'img/pool-logo.png' },
  waterGirl: { label: 'Water Girl', image: 'img/water-girl.png' },
  nuke: { label: 'Nuke', image: 'img/nuke.png' },
  recycling: { label: 'Recycling', image: 'img/recycling.png' },
  gasmask: { label: 'Gas Mask', image: 'img/gasmask.png' }
};

const state = {
  active: false,
  ended: false,
  sessionWins: 0,
  sessionLosses: 0,
  mainScore: 0,
  reserveScore: 0,
  clicksLeft: BASE_CLICKS,
  totalJerry: 0,
  spawnCount: 0,
  waterGirlChanceBonus: 0,
  nukeChanceBonus: 0,
  springCharges: 0,
  bioCharges: 0,
  popupSpeedStage: 4,
  cycleSpeedStage: 4,
  gridDensityStage: 2,
  playableIndices: [],
  activeToken: null,
  spawnInterval: null,
  tokenTimeout: null,
  tokensClicked: 0,
  tokensMissed: 0,
  totalTokensSpawned: 0,
  counts: Object.keys(tokenConfig).reduce((acc, key) => ({ ...acc, [key]: 0 }), {})
};

function getStageSpeedMultiplier(stage) {
  if (stage === STAGE_BASELINE) return 1;
  if (stage > STAGE_BASELINE) {
    return STAGE_UP_MULTIPLIER ** (stage - STAGE_BASELINE);
  }
  return STAGE_DOWN_MULTIPLIER ** (STAGE_BASELINE - stage);
}

function getPopupSpeedMultiplier() {
  return getStageSpeedMultiplier(state.popupSpeedStage);
}

function getCycleSpeedMultiplier() {
  return getStageSpeedMultiplier(state.cycleSpeedStage);
}

function formatStageDelta(stage) {
  const multiplier = getStageSpeedMultiplier(stage);
  const percent = (multiplier - 1) * 100;
  if (Math.abs(percent) < 0.05) return '0%';
  const rounded = Math.round(percent * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? '+' : ''}${text}%`;
}

function refreshDifficultyLabels() {
  const popupLabel = document.getElementById('popup-speed-value');
  const cycleLabel = document.getElementById('cycle-speed-value');
  const gridLabel = document.getElementById('grid-density-value');
  if (popupLabel) {
    popupLabel.textContent = `Stage ${state.popupSpeedStage} (${formatStageDelta(state.popupSpeedStage)})`;
  }
  if (cycleLabel) {
    cycleLabel.textContent = `Stage ${state.cycleSpeedStage} (${formatStageDelta(state.cycleSpeedStage)})`;
  }
  if (gridLabel) {
    const mode = getGridMode();
    const count = getPlayableIndices(mode).length;
    gridLabel.textContent = `${mode} (${count} playable)`;
  }
}

function handlePopupSpeedChange(value) {
  const stage = Math.max(1, Math.min(5, Number(value)));
  state.popupSpeedStage = stage;
  refreshDifficultyLabels();
}

function handleCycleSpeedChange(value) {
  const stage = Math.max(1, Math.min(5, Number(value)));
  state.cycleSpeedStage = stage;
  refreshDifficultyLabels();
  if (state.active && !state.ended) {
    startSpawnLoop();
  }
}

function getGridMode(stage = state.gridDensityStage) {
  const normalizedStage = Math.max(1, Math.min(2, Number(stage)));
  return GRID_MODE_BY_STAGE[normalizedStage] ?? GRID_MODE_BY_STAGE[2];
}

function getPlayableIndices(mode = getGridMode()) {
  if (mode === '3x3') {
    return [6, 7, 8, 11, 13, 16, 17, 18];
  }

  const all = [];
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
    if (i !== CENTER_INDEX) all.push(i);
  }
  return all;
}

function applyGridDensityToUI() {
  const grid = document.getElementById('game-grid');
  if (!grid) return;

  state.playableIndices = getPlayableIndices();

  const playableSet = new Set(state.playableIndices);
  const cells = grid.querySelectorAll('.grid-cell');
  cells.forEach((cell) => {
    const index = Number(cell.dataset.index);
    if (index === CENTER_INDEX) return;
    const isPlayable = playableSet.has(index);
    cell.classList.toggle('non-playable', !isPlayable);
    cell.disabled = !isPlayable;
  });

  if (state.activeToken && !playableSet.has(state.activeToken.index)) {
    clearTimeout(state.tokenTimeout);
    clearActiveToken();
    if (state.active && !state.ended) {
      spawnToken();
    }
  }
}

function handleGridDensityChange(value) {
  const stage = Math.max(1, Math.min(2, Number(value)));
  state.gridDensityStage = stage;
  refreshDifficultyLabels();
  applyGridDensityToUI();
}

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
  applyGridDensityToUI();
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
  return Math.max(350, Math.round(BASE_SPAWN_MS / (getSpeedMultiplier() * GLOBAL_SPEED_BOOST * getCycleSpeedMultiplier())));
}

function getTokenLifetime(type) {
  let ms = Math.round(BASE_TOKEN_MS / (getSpeedMultiplier() * GLOBAL_SPEED_BOOST * getPopupSpeedMultiplier()));
  if (type === 'nuke') ms += 420;
  if (state.bioCharges > 0 && ['jerry', 'well', 'spring', 'pool'].includes(type)) ms = Math.round(ms * 0.68);
  if (type === 'waterGirl') ms = Math.round(ms * 0.5);
  return Math.max(260, ms);
}

function updateStats() {
  document.getElementById('main-score').textContent = String(state.mainScore);
  document.getElementById('reserve-score').textContent = String(Math.max(0, state.reserveScore));
  document.getElementById('clicks-left').textContent = String(state.clicksLeft);
  document.getElementById('session-wins').textContent = String(state.sessionWins);
  document.getElementById('session-losses').textContent = String(state.sessionLosses);
  document.getElementById('water-girl-percent').textContent = `${Math.round(getWaterGirlChance() * 100)}%`;
  document.getElementById('nuke-percent').textContent = `${Math.round(getNukeChance() * 100)}%`;
  document.getElementById('tokens-clicked').textContent = String(state.tokensClicked);
  document.getElementById('tokens-missed').textContent = String(state.tokensMissed);
  document.getElementById('tokens-total').textContent = String(state.totalTokensSpawned);
}

function renderInventory() {
  const list = document.getElementById('inventory-list');
  list.innerHTML = '';
  const goodTokens = ['jerry', 'well', 'spring', 'pool', 'waterGirl', 'recycling'];
  const badTokens = ['deadFish', 'yellowSkull', 'bio', 'gasmask', 'nuke'];
  
  const goodSection = document.createElement('div');
  goodSection.className = 'inventory-section';
  const goodHeader = document.createElement('div');
  goodHeader.className = 'inventory-header';
  goodHeader.textContent = 'Good Tokens';
  goodSection.appendChild(goodHeader);
  
  goodTokens.forEach(key => {
    const data = tokenConfig[key];
    const row = document.createElement('div');
    row.className = 'inventory-row';
    row.innerHTML = `
      <img src="${data.image}" alt="${data.label}">
      <span>${data.label}</span>
      <strong>${state.counts[key]}</strong>
    `;
    goodSection.appendChild(row);
  });
  list.appendChild(goodSection);
  
  const badSection = document.createElement('div');
  badSection.className = 'inventory-section';
  const badHeader = document.createElement('div');
  badHeader.className = 'inventory-header';
  badHeader.textContent = 'Bad Tokens';
  badSection.appendChild(badHeader);
  
  badTokens.forEach(key => {
    const data = tokenConfig[key];
    const row = document.createElement('div');
    row.className = 'inventory-row';
    row.innerHTML = `
      <img src="${data.image}" alt="${data.label}">
      <span>${data.label}</span>
      <strong>${state.counts[key]}</strong>
    `;
    badSection.appendChild(row);
  });
  list.appendChild(badSection);
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

function endGame(win, isWaterGirlVictory = false) {
  if (state.ended) return;
  state.active = false;
  state.ended = true;
  if (win) {
    state.sessionWins += 1;
  } else {
    state.sessionLosses += 1;
  }
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
  let message = '';
  if (win) {
    message = isWaterGirlVictory ? 'Instant win! Water Girl saved Waterworld.' : 'you survived WaterWorld Rapture! CONGRATULATIONS!!';
  } else {
    message = 'Instant loss! Nuke meltdown.';
  }
  setMessage(message, win ? 'win' : 'loss');
  updateStats();

  if (win) {
    winAudio.currentTime = 0;
    winAudio.play().catch(() => {});
  }
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

function applyReserveConversion() {
  while (state.reserveScore >= 7) {
    state.reserveScore -= 7;
    state.mainScore += 3;
    setMessage('7 reserve points converted to +3 main score!');
  }
}

function applyTokenEffect(type, index) {
  const jerryPoints = state.waterGirlChanceBonus >= 5 ? 2 : 1;
  if (type === 'waterGirl') return endGame(true, true);
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
  if (type === 'recycling') {
    state.clicksLeft -= 1;
    state.mainScore += 1;
    setMessage('Recycling: -1 extra click, +1 main.');
  }
  if (type === 'gasmask') {
    state.clicksLeft += 1;
    state.reserveScore = Math.max(0, state.reserveScore - 1);
    setMessage('Gas Mask: +1 click, -1 reserve.');
  }

  if (state.mainScore <= 0) endGame(false);

  const goodBounceTypes = ['jerry', 'well', 'spring', 'pool'];
  const shouldBounceGoodToken = goodBounceTypes.includes(type) && state.springCharges > 0;

  if (state.springCharges > 0 || state.bioCharges > 0) {
    if (state.springCharges > 0) state.springCharges -= 1;
    if (state.bioCharges > 0) state.bioCharges -= 1;
  }

  if (shouldBounceGoodToken && state.active && !state.ended) {
    setTimeout(() => spawnToken(index, true), 900);
  }

  applyReserveConversion();
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
    ['jerry', state.waterGirlChanceBonus >= 7 ? 22 : 30],
    ['deadFish', state.nukeChanceBonus >= 6 ? 0 : 16],
    ['yellowSkull', state.nukeChanceBonus >= 11 ? 0 : 16],
    ['bio', 11],
    ['well', 5],
    ['spring', 9],
    ['pool', 8],
    ['recycling', 6],
    ['gasmask', 6]
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
  const indices = state.playableIndices.length > 0 ? state.playableIndices : getPlayableIndices();
  return indices[Math.floor(Math.random() * indices.length)];
}

function isFailureToken(type) {
  return ['deadFish', 'yellowSkull', 'bio', 'nuke'].includes(type);
}

function runHitAnimation(cell, type, onDone) {
  const fail = isFailureToken(type);
  const token = cell.querySelector('.token');
  cell.classList.add('hit-anim');
  cell.classList.add(fail ? 'hit-fail' : 'hit-success');
  if (!fail && token) token.classList.add('spin-ccw');

  setTimeout(() => {
    cell.classList.remove('hit-anim', 'hit-fail', 'hit-success');
    if (token) token.classList.remove('spin-ccw');
    onDone();
  }, 300);
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
  state.totalTokensSpawned += 1;
  updateStats();
  renderInventory();

  const duration = isBounce ? 2000 : getTokenLifetime(type);
  state.tokenTimeout = setTimeout(() => {
    if (state.activeToken && state.activeToken.index === index) {
      state.tokensMissed += 1;
      clearActiveToken();
      updateStats();
    }
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
  state.tokensClicked = 0;
  state.tokensMissed = 0;
  state.totalTokensSpawned = 0;
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
  state.tokensClicked = 0;
  state.tokensMissed = 0;
  state.totalTokensSpawned = 0;
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
  clearInterval(state.spawnInterval);
  state.tokensClicked += 1;
  runHitAnimation(cell, type, () => {
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
});

document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('reset-game').addEventListener('click', resetGame);
document.getElementById('popup-speed-slider').addEventListener('input', (event) => {
  handlePopupSpeedChange(event.target.value);
});
document.getElementById('cycle-speed-slider').addEventListener('input', (event) => {
  handleCycleSpeedChange(event.target.value);
});
document.getElementById('grid-density-slider').addEventListener('input', (event) => {
  handleGridDensityChange(event.target.value);
});

createGrid();
updateStats();
renderInventory();
refreshDifficultyLabels();
