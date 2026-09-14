export const DIFFICULTIES = {
  beginner: { label: 'Новичок', width: 9, height: 9, mines: 10 },
  intermediate: { label: 'Любитель', width: 16, height: 16, mines: 40 },
  expert: { label: 'Эксперт', width: 30, height: 16, mines: 99 },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;
export type Status = 'ready' | 'playing' | 'won' | 'lost';
export interface Cell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}
export interface Config { width: number; height: number; mines: number }
export interface GameSnapshot {
  cells: Cell[];
  status: Status;
  exploded: number | null;
  elapsedMs: number;
}

export class Minesweeper {
  readonly cells: Cell[];
  readonly config: Readonly<Config>;
  status: Status = 'ready';
  exploded: number | null = null;
  private startedAt: number | null = null;
  private endedAt: number | null = null;

  constructor(config: Config, private readonly random: () => number = Math.random) {
    const { width, height, mines } = config;
    if (![width, height, mines].every(Number.isInteger) || width < 3 || height < 3 || mines < 1 || mines > width * height - 9) {
      throw new Error('Invalid board configuration');
    }
    this.config = Object.freeze({ ...config });
    this.cells = Array.from({ length: width * height }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }));
  }

  get flags(): number { return this.cells.filter(cell => cell.flagged).length; }
  get remaining(): number { return this.config.mines - this.flags; }
  get revealed(): number { return this.cells.filter(cell => cell.revealed && !cell.mine).length; }
  get finished(): boolean { return this.status === 'won' || this.status === 'lost'; }

  elapsed(now = Date.now()): number {
    return this.startedAt === null ? 0 : Math.max(0, Math.floor(((this.endedAt ?? now) - this.startedAt) / 1000));
  }

  snapshot(now = Date.now()): GameSnapshot {
    return {
      cells: this.cells.map(cell => ({ ...cell })),
      status: this.status,
      exploded: this.exploded,
      elapsedMs: this.startedAt === null ? 0 : Math.max(0, (this.endedAt ?? now) - this.startedAt),
    };
  }

  static restore(config: Config, value: unknown, now = Date.now()): Minesweeper | null {
    if (!value || typeof value !== 'object') return null;
    const saved = value as Partial<GameSnapshot>;
    if (!['ready', 'playing', 'won', 'lost'].includes(saved.status ?? '') ||
      typeof saved.elapsedMs !== 'number' || !Number.isSafeInteger(saved.elapsedMs) || saved.elapsedMs < 0 ||
      !Array.isArray(saved.cells) || saved.cells.length !== config.width * config.height) return null;
    if (!saved.cells.every(cell => cell && typeof cell === 'object' &&
      typeof cell.mine === 'boolean' && typeof cell.revealed === 'boolean' && typeof cell.flagged === 'boolean' &&
      Number.isInteger(cell.adjacent) && cell.adjacent >= 0 && cell.adjacent <= 8 && !(cell.revealed && cell.flagged))) return null;

    const game = new Minesweeper(config);
    saved.cells.forEach((cell, index) => { game.cells[index] = { ...cell }; });
    game.status = saved.status as Status;
    if (game.flags > config.mines || game.cells.some((cell, index) =>
      cell.adjacent !== game.neighbors(index).filter(i => game.cells[i].mine).length)) return null;
    const mines = game.cells.filter(cell => cell.mine).length;
    const exposedMines = game.cells.filter(cell => cell.mine && cell.revealed).length;
    if (game.status === 'ready') {
      if (mines !== 0 || game.revealed !== 0 || saved.elapsedMs !== 0) return null;
    } else {
      if (mines !== config.mines || game.revealed === 0) return null;
      const allSafeOpen = game.revealed === game.cells.length - config.mines;
      if ((game.status === 'won') !== allSafeOpen) return null;
      if (game.status === 'won' && game.flags !== config.mines) return null;
      game.startedAt = now - saved.elapsedMs;
      game.endedAt = game.finished ? now : null;
    }
    if (game.status === 'lost') {
      if (typeof saved.exploded !== 'number' || !Number.isInteger(saved.exploded) ||
        !game.cells[saved.exploded]?.mine || !game.cells[saved.exploded]?.revealed || exposedMines !== 1) return null;
      game.exploded = saved.exploded;
    } else if (saved.exploded !== null || exposedMines !== 0) return null;
    return game;
  }

  neighbors(index: number): number[] {
    const { width, height } = this.config;
    const x = index % width;
    const y = Math.floor(index / width);
    const result: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
          result.push((y + dy) * width + x + dx);
        }
      }
    }
    return result;
  }

  toggleFlag(index: number): boolean {
    const cell = this.cells[index];
    if (!cell || cell.revealed || this.finished || (!cell.flagged && this.remaining === 0)) return false;
    cell.flagged = !cell.flagged;
    return true;
  }

  reveal(index: number, now = Date.now()): boolean {
    const cell = this.cells[index];
    if (!cell || cell.flagged || this.finished) return false;
    if (cell.revealed) return this.chord(index, now);
    if (this.status === 'ready') {
      this.placeMines(index);
      this.status = 'playing';
      this.startedAt = now;
    }
    this.open([index], now);
    return true;
  }

  chord(index: number, now = Date.now()): boolean {
    const cell = this.cells[index];
    if (!cell?.revealed || !cell.adjacent || this.finished) return false;
    const neighbors = this.neighbors(index);
    if (neighbors.filter(i => this.cells[i].flagged).length !== cell.adjacent) return false;
    const unopened = neighbors.filter(i => !this.cells[i].revealed && !this.cells[i].flagged);
    if (!unopened.length) return false;
    this.open(unopened, now);
    return true;
  }

  private placeMines(first: number): void {
    const safe = new Set([first, ...this.neighbors(first)]);
    const candidates = this.cells.map((_, index) => index).filter(index => !safe.has(index));
    // Partial Fisher–Yates: every eligible cell has the same chance of a mine.
    for (let i = 0; i < this.config.mines; i++) {
      const j = i + Math.floor(this.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      this.cells[candidates[i]].mine = true;
    }
    this.cells.forEach((cell, index) => {
      cell.adjacent = this.neighbors(index).filter(i => this.cells[i].mine).length;
    });
  }

  private open(indices: number[], now: number): void {
    const pending = [...indices];
    // Iterative flood fill avoids a deep call stack on large empty regions.
    while (pending.length) {
      const index = pending.pop()!;
      const cell = this.cells[index];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      if (cell.mine) {
        this.exploded = index;
        this.status = 'lost';
        this.endedAt = now;
        return;
      }
      if (cell.adjacent === 0) pending.push(...this.neighbors(index));
    }
    if (this.revealed === this.cells.length - this.config.mines) {
      this.status = 'won';
      this.endedAt = now;
      this.cells.forEach(cell => { if (cell.mine) cell.flagged = true; });
    }
  }
}
