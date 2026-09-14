import { describe, expect, test } from 'bun:test';
import { DIFFICULTIES, Minesweeper } from '../src/game';

function seeded(seed = 42): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('Minesweeper', () => {
  for (const [name, config] of Object.entries(DIFFICULTIES)) {
    test(`${name}: safe first move, exact mine count and correct adjacent numbers`, () => {
      for (const first of [0, config.width - 1, Math.floor(config.width * config.height / 2), config.width * config.height - 1]) {
        const game = new Minesweeper(config, seeded(first));
        game.reveal(first, 1000);
        expect(game.cells.filter(c => c.mine)).toHaveLength(config.mines);
        for (const i of [first, ...game.neighbors(first)]) expect(game.cells[i].mine).toBe(false);
        game.cells.forEach((cell, index) => {
          expect(cell.adjacent).toBe(game.neighbors(index).filter(i => game.cells[i].mine).length);
        });
        expect(game.cells[first].adjacent).toBe(0);
        expect(game.revealed).toBeGreaterThan(1);
      }
    });
  }

  test('flags block opening, are limited to mine count, and do not start the timer', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    for (let i = 0; i < 10; i++) expect(game.toggleFlag(i)).toBe(true);
    expect(game.remaining).toBe(0);
    expect(game.toggleFlag(10)).toBe(false);
    expect(game.reveal(0)).toBe(false);
    expect(game.status).toBe('ready');
    expect(game.elapsed()).toBe(0);
    expect(game.toggleFlag(0)).toBe(true);
    expect(game.remaining).toBe(1);
    game.reveal(0, 1000);
    expect(game.cells[1].flagged).toBe(true);
    expect(game.cells[1].revealed).toBe(false);
    expect(game.toggleFlag(0)).toBe(false);
  });

  test('empty regions reveal all reachable safe neighbors without wrapping rows', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    expect(game.neighbors(0)).toEqual([1, 9, 10]);
    expect(game.neighbors(8)).toEqual([7, 16, 17]);
    game.reveal(40);
    game.cells.forEach((cell, index) => {
      if (cell.revealed && cell.adjacent === 0) {
        for (const neighbor of game.neighbors(index)) expect(game.cells[neighbor].revealed).toBe(true);
      }
    });
  });

  test('hitting a mine ends the game and freezes the timer and board', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    game.reveal(40, 1000);
    expect(game.elapsed(3500)).toBe(2);
    const mine = game.cells.findIndex(cell => cell.mine);
    game.reveal(mine, 6100);
    expect(game.status).toBe('lost');
    expect(game.exploded).toBe(mine);
    expect(game.elapsed(99000)).toBe(5);
    expect(game.toggleFlag(0)).toBe(false);
    expect(game.reveal(0)).toBe(false);
  });

  test('opening every safe cell wins without requiring flags', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    game.reveal(40, 1000);
    game.cells.forEach((cell, index) => { if (!cell.mine) game.reveal(index, 9000); });
    expect(game.status).toBe('won');
    expect(game.remaining).toBe(0);
    expect(game.elapsed(50000)).toBe(8);
    expect(game.revealed).toBe(71);
  });

  test('chording requires matching flags and opens safe neighbors', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    game.reveal(40);
    const number = game.cells.findIndex((cell, index) => cell.revealed && cell.adjacent > 0 && game.neighbors(index).some(i => !game.cells[i].mine && !game.cells[i].revealed));
    expect(number).toBeGreaterThanOrEqual(0);
    expect(game.chord(number)).toBe(false);
    for (const i of game.neighbors(number)) if (game.cells[i].mine) game.toggleFlag(i);
    const before = game.revealed;
    expect(game.chord(number)).toBe(true);
    expect(game.revealed).toBeGreaterThan(before);
    expect(game.status).not.toBe('lost');
  });

  test('matching but incorrect flags can detonate a mine when chording', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    game.reveal(40);
    const number = game.cells.findIndex((cell, index) => cell.revealed && cell.adjacent > 0 && game.neighbors(index).some(i => !game.cells[i].mine && !game.cells[i].revealed));
    const neighbors = game.neighbors(number);
    const safe = neighbors.find(i => !game.cells[i].mine && !game.cells[i].revealed)!;
    game.toggleFlag(safe);
    neighbors.filter(i => game.cells[i].mine).slice(1).forEach(i => game.toggleFlag(i));
    expect(game.chord(number)).toBe(true);
    expect(game.status).toBe('lost');
  });

  test('invalid boards and out-of-range moves are rejected', () => {
    expect(() => new Minesweeper({ width: 3, height: 3, mines: 1 })).toThrow();
    const game = new Minesweeper(DIFFICULTIES.beginner);
    expect(game.reveal(-1)).toBe(false);
    expect(game.toggleFlag(1000)).toBe(false);
  });

  test('restores an unstarted board with flags and a safe first move', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner);
    game.toggleFlag(0);
    const restored = Minesweeper.restore(game.config, JSON.parse(JSON.stringify(game.snapshot())), 50000)!;
    expect(restored.status).toBe('ready');
    expect(restored.flags).toBe(1);
    expect(restored.elapsed(90000)).toBe(0);
    expect(restored.reveal(0)).toBe(false);
    restored.reveal(40, 90000);
    expect(restored.cells[40].mine).toBe(false);
    expect(restored.cells[40].adjacent).toBe(0);
    expect(restored.cells.filter(cell => cell.mine)).toHaveLength(10);
  });

  for (const [name, config] of Object.entries(DIFFICULTIES)) {
    test(`${name}: restores the exact board and continues timing without offline time`, () => {
      const game = new Minesweeper(config, seeded());
      game.reveal(0, 1000);
      const mine = game.cells.findIndex(cell => cell.mine);
      game.toggleFlag(mine);
      const snapshot = JSON.parse(JSON.stringify(game.snapshot(4750)));
      const restored = Minesweeper.restore(config, snapshot, 100000)!;
      expect(restored.snapshot(100000)).toEqual(snapshot);
      expect(restored.elapsed(100250)).toBe(4);
      expect(restored.remaining).toBe(game.remaining);
      expect(restored.revealed).toBe(game.revealed);
      restored.toggleFlag(mine);
      restored.reveal(mine, 101000);
      expect(restored.status).toBe('lost');
      expect(restored.elapsed()).toBe(4);
      expect(game.cells[mine].flagged).toBe(true);
      expect(snapshot.cells[mine].flagged).toBe(true);
    });
  }

  for (const outcome of ['won', 'lost'] as const) {
    test(`restores a ${outcome} game with a frozen timer and board`, () => {
      const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
      game.reveal(40, 1000);
      if (outcome === 'lost') game.reveal(game.cells.findIndex(cell => cell.mine), 6500);
      else game.cells.forEach((cell, index) => { if (!cell.mine) game.reveal(index, 6500); });
      const restored = Minesweeper.restore(game.config, game.snapshot(90000), 100000)!;
      expect(restored.status).toBe(outcome);
      expect(restored.cells).toEqual(game.cells);
      expect(restored.exploded).toBe(game.exploded);
      expect(restored.elapsed(999999)).toBe(5);
      expect(restored.reveal(0)).toBe(false);
      expect(restored.toggleFlag(0)).toBe(false);
    });
  }

  test('rejects malformed or inconsistent saved games', () => {
    const game = new Minesweeper(DIFFICULTIES.beginner, seeded());
    game.reveal(40, 1000);
    const saved = game.snapshot(5000);
    const mine = game.cells.findIndex(cell => cell.mine);
    for (const value of [
      null, {}, [], 'invalid',
      { ...saved, status: 'unknown' },
      { ...saved, status: 'ready' },
      { ...saved, status: 'won' },
      { ...saved, status: 'lost', exploded: mine },
      { ...saved, elapsedMs: -1 },
      { ...saved, elapsedMs: Infinity },
      { ...saved, cells: [] },
      { ...saved, cells: saved.cells.map(() => null) },
      { ...saved, cells: saved.cells.map(cell => ({ ...cell, mine: false })) },
      { ...saved, cells: saved.cells.map(cell => ({ ...cell, adjacent: 9 })) },
      { ...saved, cells: saved.cells.map(cell => ({ ...cell, flagged: true })) },
      { ...saved, exploded: 0 },
    ]) expect(Minesweeper.restore(game.config, value)).toBeNull();
    expect(Minesweeper.restore(DIFFICULTIES.expert, saved)).toBeNull();
  });
});
