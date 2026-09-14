import '@fontsource-variable/golos-text';
import '@fontsource-variable/jetbrains-mono';
import './style.css';
import { DIFFICULTIES, Minesweeper } from './game';
import { GameAudio } from './audio';
import { ExplosionEffect } from './explosion';
import type { Difficulty } from './game';

const icons = {
  mine: '<path d="M12 2v4m0 12v4M2 12h4m12 0h4M4.8 4.8l2.8 2.8m8.8 8.8 2.8 2.8M4.8 19.2l2.8-2.8m8.8-8.8 2.8-2.8" stroke-width="2.6"/><path d="M10.5 2h3M10.5 22h3M2 10.5v3m20-3v3M3.8 5.8l2-2m12.4 16.4 2-2M3.8 18.2l2 2M18.2 3.8l2 2" stroke-width="1.4"/><path fill="currentColor" fill-rule="evenodd" stroke="none" d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm-4.9 6.3a.8.8 0 0 0 1.55.4 3.5 3.5 0 0 1 2.55-2.55.8.8 0 0 0-.4-1.55 5.1 5.1 0 0 0-3.7 3.7Zm7.4 4.7a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 3h8m-6-3h4v3h-4z"/>',
  cursor: '<path d="m5 3 14 10-7 1-3 7-4-18Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m-6 0 6-6"/>',
} as const;
function icon(name: keyof typeof icons, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

type Preferences = { difficulty: Difficulty; bests: Partial<Record<Difficulty, number>>; theme: 'auto' | 'light' | 'dark'; sound: boolean };
const preferences: Preferences = { difficulty: 'beginner', bests: {}, theme: 'auto', sound: true };
try {
  const saved = JSON.parse(localStorage.getItem('minefield:v1') ?? '{}');
  if (saved && typeof saved === 'object') {
    if (Object.hasOwn(DIFFICULTIES, saved.difficulty)) preferences.difficulty = saved.difficulty;
    if (saved.theme === 'light' || saved.theme === 'dark') preferences.theme = saved.theme;
    if (typeof saved.sound === 'boolean') preferences.sound = saved.sound;
    for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
      const best = saved.bests?.[difficulty];
      if (typeof best === 'number' && Number.isInteger(best) && best >= 0) preferences.bests[difficulty] = best;
    }
  }
} catch { /* The game also works when browser storage is unavailable. */ }

function savePreferences(): void {
  try { localStorage.setItem('minefield:v1', JSON.stringify(preferences)); } catch { /* Storage may be disabled. */ }
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell" data-screen="level">
    <header class="app-header">
      <div class="header-start"><span class="brand" id="brand">сапёр<span>.</span></span><button class="back-button" id="back-to-levels" hidden>${icon('back')} Уровни</button></div>
      <span class="header-title" id="game-label"></span>
      <div class="header-actions">
        <button class="icon-button" id="restart" title="Новая игра (R)" aria-label="Начать новую игру" hidden>${icon('reset')}</button>
        <button class="icon-button" id="help-open" title="Как играть" aria-label="Как играть">${icon('help')}</button>
        <button class="icon-button" id="sound-toggle" aria-label="Звук" aria-pressed="true"></button>
        <button class="icon-button" id="theme-toggle" aria-label="Переключить тему"></button>
      </div>
    </header>

    <main class="stage">
      <section class="level-screen" id="level-screen" aria-labelledby="level-title">
        <h1 id="level-title" tabindex="-1">Выбери уровень</h1>
        <div class="level-list">
          ${Object.entries(DIFFICULTIES).map(([key, config], i) => `<button class="level-button" data-difficulty="${key}"><span class="level-symbol" aria-hidden="true">${'▮'.repeat(i + 1)}</span><span class="level-info"><strong>${config.label}</strong><span>${config.width} × ${config.height} · ${config.mines} мин</span><span class="level-best" data-best="${key}" hidden></span></span>${icon('arrow', 'level-arrow')}</button>`).join('')}
        </div>
        <button class="text-button resume-button" id="resume" hidden>Продолжить игру ${icon('arrow')}</button>
      </section>

      <section class="game-screen" id="game-screen" aria-label="Игра Сапёр" hidden>
        <div class="game-hud">
          <div class="dashboard">
            <div class="metric"><span>${icon('flag')} Мины</span><strong id="mine-count">010</strong></div>
            <div class="metric"><span>${icon('clock')} Время</span><strong id="timer">00:00</strong></div>
            <div class="metric"><span>${icon('trophy')} Очки</span><strong id="score">0</strong></div>
          </div>
          <progress id="progress" value="0" max="71" aria-label="Открыто безопасных клеток"></progress>
        </div>
        <div class="board-frame"><div class="board-scroll" id="board-scroll" role="region" aria-label="Игровое поле с прокруткой" tabindex="-1"><div id="board" class="board" role="grid" aria-label="Минное поле" aria-describedby="board-instructions"></div></div><div class="explosion-overlay" id="explosion-overlay" aria-hidden="true" hidden></div></div>
        <div class="game-toolbar" id="game-toolbar">
          <div class="mode-switch" id="mode-switch" role="group" aria-label="Режим нажатия"><button id="mode-open" aria-pressed="true">${icon('cursor')} Открыть</button><button id="mode-flag" aria-pressed="false">${icon('flag')} Флаг</button></div>
        </div>
        <section class="result-panel" id="result-panel" aria-labelledby="result-title" hidden>
          <div class="result-summary"><div class="result-heading"><span class="result-symbol" id="result-symbol" aria-hidden="true"></span><h2 id="result-title" tabindex="-1"></h2></div><p class="result-detail" id="result-detail"></p></div>
          <div class="result-actions"><button class="primary-button" id="play-again">${icon('reset')} Ещё раз</button><button class="secondary-button" id="choose-level">Другой уровень</button></div>
        </section>
      </section>
    </main>
  </div>
  <p class="sr-only" id="game-status" role="status" aria-live="polite"></p>
  <p class="sr-only" id="board-instructions">Стрелки — выбор клетки. Enter или пробел — открыть. F — флаг. Цифра показывает число мин рядом.</p>
  <dialog id="help-dialog" aria-labelledby="help-title"><div class="help-header"><h2 id="help-title">Как играть</h2><button class="icon-button" id="help-close" aria-label="Закрыть справку">${icon('close')}</button></div>
    <p>Открой все клетки без мин. Цифра — число мин рядом. Первый ход безопасный.</p>
    <dl class="help-controls"><div><dt>Открыть</dt><dd>Клик / касание</dd></div><div><dt>Флаг</dt><dd>Правый клик / долгое нажатие</dd></div><div><dt>Открыть соседей</dt><dd>Нажми на цифру, когда флагов вокруг столько же. Ошибочный флаг может привести к взрыву.</dd></div><div><dt>Очки</dt><dd>10 за каждую открытую клетку без мины</dd></div></dl>
    <p class="keyboard-help"><kbd>← ↑ ↓ →</kbd> выбор · <kbd>Enter</kbd> открыть<br><kbd>F</kbd> флаг · <kbd>R</kbd> заново</p>
  </dialog>`;

function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const board = element('board');
const status = element('game-status');
type Screen = 'level' | 'game';
let screen: Screen = 'level';
let game = new Minesweeper(DIFFICULTIES[preferences.difficulty]);
let hasGame = false;
let buttons: HTMLButtonElement[] = [];
let activeIndex = 0;
let mode: 'open' | 'flag' = 'open';
let recordSaved = false;
let newRecord = false;
let resultShown = false;
const helpDialog = element<HTMLDialogElement>('help-dialog');
const audio = new GameAudio(preferences.sound);
const explosion = new ExplosionEffect(element('explosion-overlay'));
let soundRevision = 0;

function saveGame(): void {
  if (!hasGame) return;
  try {
    localStorage.setItem('minefield:game:v1', JSON.stringify({
      difficulty: preferences.difficulty,
      game: game.snapshot(),
      screen, mode, activeIndex, recordSaved, newRecord,
    }));
  } catch { /* Storage may be disabled or full. */ }
}

function restoreGame(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem('minefield:game:v1') ?? 'null');
    if (!saved || !Object.hasOwn(DIFFICULTIES, saved.difficulty) ||
      !['level', 'game'].includes(saved.screen) || !['open', 'flag'].includes(saved.mode) ||
      typeof saved.recordSaved !== 'boolean' || typeof saved.newRecord !== 'boolean') return false;
    const difficulty = saved.difficulty as Difficulty;
    const restored = Minesweeper.restore(DIFFICULTIES[difficulty], saved.game);
    if (!restored || !Number.isInteger(saved.activeIndex) || saved.activeIndex < 0 || saved.activeIndex >= restored.cells.length) return false;
    game = restored;
    preferences.difficulty = difficulty;
    hasGame = true;
    screen = saved.screen;
    activeIndex = saved.activeIndex;
    recordSaved = saved.recordSaved;
    newRecord = saved.newRecord;
    buildBoard();
    setMode(saved.mode);
    render();
    showScreen(saved.screen, false);
    return true;
  } catch { return false; }
}

function stopExplosion(): void {
  explosion.stop();
  audio.stop();
}

function updateSoundButton(): void {
  const button = element('sound-toggle');
  button.innerHTML = icon(preferences.sound ? 'sound' : 'muted');
  button.setAttribute('aria-pressed', String(preferences.sound));
  button.title = preferences.sound ? 'Выключить звук' : 'Включить звук';
}
element('sound-toggle').addEventListener('click', () => {
  soundRevision++;
  preferences.sound = !preferences.sound;
  audio.setEnabled(preferences.sound);
  savePreferences();
  updateSoundButton();
  if (preferences.sound) audio.play('open');
});
// Unlock on the gesture itself, before the long-press timer fires on a phone.
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true });
document.addEventListener('keydown', () => audio.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveGame(); stopExplosion(); }
});
window.addEventListener('pagehide', () => { saveGame(); stopExplosion(); });
updateSoundButton();

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(): void {
  const dark = preferences.theme === 'dark' || (preferences.theme === 'auto' && darkMedia.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  element('theme-toggle').innerHTML = icon(dark ? 'sun' : 'moon');
  element('theme-toggle').setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191d1b' : '#f6f5f0');
}
element('theme-toggle').addEventListener('click', () => {
  preferences.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  savePreferences();
  applyTheme();
});
darkMedia.addEventListener('change', applyTheme);
applyTheme();

function updateRecords(): void {
  document.querySelectorAll<HTMLElement>('[data-best]').forEach(label => {
    const best = preferences.bests[label.dataset.best as Difficulty];
    label.hidden = best === undefined;
    label.textContent = best === undefined ? '' : `Рекорд ${formatTime(best)}`;
  });
}

function showScreen(next: Screen, moveFocus = true): void {
  cancelPress();
  suppressClick = false;
  screen = next;
  if (next === 'level') stopExplosion();
  for (const name of ['level', 'game'] as const) element(`${name}-screen`).hidden = name !== next;
  document.querySelector<HTMLElement>('.app-shell')!.dataset.screen = next;
  element('brand').hidden = next !== 'level';
  element('back-to-levels').hidden = next === 'level';
  element('restart').hidden = next !== 'game' || game.finished;
  element('game-label').textContent = next === 'game' ? DIFFICULTIES[preferences.difficulty].label : '';
  element('resume').hidden = !hasGame || game.finished;
  if (moveFocus) {
    if (next === 'game') setActive(activeIndex, true);
    else element(`${next}-title`).focus({ preventScroll: true });
  }
  saveGame();
}

function reset(): void {
  cancelPress();
  stopExplosion();
  void explosion.preload();
  game = new Minesweeper(DIFFICULTIES[preferences.difficulty]);
  hasGame = true;
  recordSaved = false;
  newRecord = false;
  resultShown = false;
  activeIndex = 0;
  buildBoard();
  setMode('open');
  showScreen('game');
  element('board-scroll').scrollTo(0, 0);
  render();
  audio.play('start');
}

function buildBoard(): void {
  const { width, height, mines } = game.config;
  const progress = element<HTMLProgressElement>('progress');
  progress.max = width * height - mines;
  board.style.setProperty('--columns', String(width));
  board.classList.toggle('board-beginner', preferences.difficulty === 'beginner');
  board.setAttribute('aria-rowcount', String(height));
  board.setAttribute('aria-colcount', String(width));
  board.replaceChildren();
  buttons = [];
  for (let y = 0; y < height; y++) {
    const row = document.createElement('div');
    row.className = 'board-row';
    row.setAttribute('role', 'row');
    for (let x = 0; x < width; x++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(y * width + x);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-rowindex', String(y + 1));
      button.setAttribute('aria-colindex', String(x + 1));
      button.tabIndex = y * width + x === activeIndex ? 0 : -1;
      row.append(button);
      buttons.push(button);
    }
    board.append(row);
  }
}

function act(index: number, action: 'open' | 'flag'): void {
  if (game.finished) return;
  const revealed = game.revealed;
  const changed = action === 'flag' ? game.toggleFlag(index) : game.reveal(index);
  if (!changed) return;
  render();
  saveGame();
  if (game.status === 'won') audio.play('win');
  else if (game.status === 'lost') {
    audio.stop();
    const revision = soundRevision;
    const soundEnabled = preferences.sound;
    explosion.play(() => {
      if (soundEnabled && revision === soundRevision) audio.play('lose');
    });
  }
  else if (action === 'flag') audio.play(game.cells[index].flagged ? 'flag' : 'unflag');
  else if (game.revealed > revealed) audio.play(game.revealed - revealed > 1 ? 'expand' : 'open');
}

function render(): void {
  if (game.status === 'won' && !recordSaved) {
    recordSaved = true;
    const best = preferences.bests[preferences.difficulty];
    if (best === undefined || game.elapsed() < best) {
      newRecord = true;
      preferences.bests[preferences.difficulty] = game.elapsed();
      savePreferences();
      updateRecords();
    }
  }
  game.cells.forEach((cell, index) => {
    const button = buttons[index];
    const showMine = cell.mine && game.status === 'lost';
    const wrongFlag = cell.flagged && !cell.mine && game.status === 'lost';
    button.className = `cell${cell.revealed ? ' revealed' : ''}${cell.flagged ? ' flagged' : ''}${showMine ? ' mined' : ''}${wrongFlag ? ' wrong-flag' : ''}${index === game.exploded ? ' exploded' : ''}`;
    button.dataset.number = String(cell.adjacent);
    const content = cell.flagged ? icon('flag') : showMine ? icon('mine') : cell.revealed && cell.adjacent > 0 ? String(cell.adjacent) : '';
    if (button.innerHTML !== content) button.innerHTML = content;
    const description = wrongFlag ? 'Ошибочный флаг' : cell.flagged ? 'Флаг' : showMine ? 'Мина' : cell.revealed ? cell.adjacent ? `Мин рядом: ${cell.adjacent}` : 'Пусто' : 'Закрыта';
    button.setAttribute('aria-label', `Строка ${Math.floor(index / game.config.width) + 1}, столбец ${index % game.config.width + 1}: ${description}`);
    button.setAttribute('aria-disabled', String(game.finished));
  });
  element('mine-count').textContent = String(game.remaining).padStart(3, '0');
  element('timer').textContent = formatTime(game.elapsed());
  element('score').textContent = String(game.revealed * 10);
  const progress = element<HTMLProgressElement>('progress');
  progress.value = game.revealed;
  progress.setAttribute('aria-valuetext', `${game.revealed} из ${progress.max}`);
  board.dataset.status = game.status;
  const messages = {
    ready: 'Первый ход безопасный.',
    playing: 'Игра началась.',
    won: 'Победа! Все безопасные клетки открыты.',
    lost: 'Поражение. Открыта мина.',
  };
  if (status.textContent !== messages[game.status]) status.textContent = messages[game.status];
  element('game-toolbar').hidden = game.finished;
  element('result-panel').hidden = !game.finished;
  element('game-screen').classList.toggle('finished', game.finished);
  element('restart').hidden = game.finished;
  if (game.finished && !resultShown) {
    resultShown = true;
    cancelPress();
    element('result-panel').dataset.outcome = game.status;
    element('result-symbol').innerHTML = icon(game.status === 'won' ? 'trophy' : 'mine');
    element('result-title').textContent = game.status === 'won' ? 'Победа!' : 'Поражение';
    element('result-detail').textContent = game.status === 'lost' ? `Открыто ${game.revealed} из ${progress.max}` : newRecord ? 'Новый личный рекорд' : `Рекорд ${formatTime(preferences.bests[preferences.difficulty]!)}`;
    // Keep the final move visible if the result panel reduces the scroll area.
    if (screen === 'game') {
      setActive(game.exploded ?? activeIndex, true);
      element('result-title').focus({ preventScroll: true });
    }
  }
}

function setActive(index: number, focus = false): void {
  buttons[activeIndex].tabIndex = -1;
  activeIndex = index;
  buttons[index].tabIndex = 0;
  if (focus) {
    buttons[index].focus({ preventScroll: true });
    buttons[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function cellTarget(event: Event): HTMLButtonElement | null {
  return event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-index]') : null;
}

let pressTimer: ReturnType<typeof setTimeout> | undefined;
let pressOrigin: { x: number; y: number } | null = null;
let suppressClick = false;
function cancelPress(): void {
  clearTimeout(pressTimer);
  pressTimer = undefined;
  pressOrigin = null;
}

board.addEventListener('pointerdown', event => {
  cancelPress();
  suppressClick = false;
  const target = cellTarget(event);
  if (!target || !event.isPrimary) return;
  setActive(Number(target.dataset.index));
  if (event.pointerType === 'mouse' || game.finished) return;
  pressOrigin = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    suppressClick = true;
    act(Number(target.dataset.index), 'flag');
  }, 450);
});
board.addEventListener('pointermove', event => {
  if (pressOrigin && Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 10) {
    suppressClick = true;
    cancelPress();
  }
});
window.addEventListener('pointerup', cancelPress);
board.addEventListener('pointercancel', () => { suppressClick = true; cancelPress(); });
board.addEventListener('pointerleave', cancelPress);
board.addEventListener('click', event => {
  const target = cellTarget(event);
  if (!target || suppressClick) return;
  const index = Number(target.dataset.index);
  setActive(index);
  act(index, mode === 'flag' && !game.cells[index].revealed ? 'flag' : 'open');
});
board.addEventListener('contextmenu', event => {
  event.preventDefault();
  const target = cellTarget(event);
  if (!target || suppressClick) return;
  cancelPress();
  act(Number(target.dataset.index), 'flag');
});
board.addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || (event.ctrlKey && !['Home', 'End'].includes(event.key))) return;
  const target = cellTarget(event);
  if (!target) return;
  const index = Number(target.dataset.index);
  const { width } = game.config;
  const x = index % width;
  const moves: Record<string, number> = {
    ArrowLeft: x > 0 ? index - 1 : index,
    ArrowRight: x < width - 1 ? index + 1 : index,
    ArrowUp: Math.max(x, index - width),
    ArrowDown: Math.min(game.cells.length - width + x, index + width),
    Home: event.ctrlKey ? 0 : index - x,
    End: event.ctrlKey ? game.cells.length - 1 : index - x + width - 1,
  };
  if (Object.hasOwn(moves, event.key)) {
    event.preventDefault();
    setActive(moves[event.key], true);
  } else if (['f', 'а', 'enter', ' '].includes(event.key.toLowerCase())) {
    event.preventDefault();
    suppressClick = false;
    if (event.repeat) return;
    act(index, ['f', 'а'].includes(event.key.toLowerCase()) ? 'flag' : 'open');
  }
});

function setMode(next: typeof mode): void {
  mode = next;
  element('mode-open').setAttribute('aria-pressed', String(mode === 'open'));
  element('mode-flag').setAttribute('aria-pressed', String(mode === 'flag'));
  board.classList.toggle('flag-mode', mode === 'flag');
  saveGame();
}
element('mode-open').addEventListener('click', () => setMode('open'));
element('mode-flag').addEventListener('click', () => setMode('flag'));
element('restart').addEventListener('click', reset);
element('play-again').addEventListener('click', reset);
element('back-to-levels').addEventListener('click', () => showScreen('level'));
element('choose-level').addEventListener('click', () => showScreen('level'));
element('resume').addEventListener('click', () => showScreen('game'));
element('help-open').addEventListener('click', () => { cancelPress(); helpDialog.showModal(); });
element('help-close').addEventListener('click', () => helpDialog.close());
helpDialog.addEventListener('click', event => {
  if (event.target !== helpDialog) return;
  const bounds = helpDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) helpDialog.close();
});
document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
  button.addEventListener('click', () => {
    const difficulty = button.dataset.difficulty as Difficulty;
    preferences.difficulty = difficulty;
    savePreferences();
    reset();
  });
});
window.addEventListener('keydown', event => {
  if (screen === 'level' || helpDialog.open || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (['r', 'к'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    reset();
    setActive(0, true);
  }
});
updateRecords();
if (!restoreGame()) showScreen('level', false);
window.setInterval(() => {
  if (game.status === 'playing') element('timer').textContent = formatTime(game.elapsed());
}, 250);
window.setInterval(() => { if (game.status === 'playing') saveGame(); }, 1000);
