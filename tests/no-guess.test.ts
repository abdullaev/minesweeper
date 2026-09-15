import { describe, expect, test } from 'bun:test';
import { DIFFICULTIES, Minesweeper } from '../src/game';
import { findForcedMoves, isSolvable } from '../src/solver';

function seeded(seed: number): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('logical deductions', () => {
  test('every deduction agrees with every possible board, using an exhaustive independent oracle', () => {
    const game = new Minesweeper({ width: 4, height: 3, mines: 3 });
    const neighbors = game.cells.map((_, i) => game.neighbors(i));
    // Enumerate all 220 ways of placing three mines on twelve cells.
    const layouts: { mask: number; clues: number[] }[] = [];
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
      const mask = (1 << a) | (1 << b) | (1 << c);
      layouts.push({ mask, clues: neighbors.map(list => list.filter(i => mask & (1 << i)).length) });
    }
    let deductions = 0;
    for (const layout of layouts) {
      for (const opened of [0, 1, 42, 341, 1365, 2730, 4095]) {
        const visible = Int8Array.from(layout.clues, (clue, i) => {
          if (layout.mask & (1 << i)) return opened & (1 << i) && i % 3 === 0 ? -1 : -2;
          return opened & (1 << i) ? clue : -2;
        });
        const possible = layouts.filter(candidate => visible.every((clue, i) => {
          if (clue === -2) return true;
          if (clue === -1) return Boolean(candidate.mask & (1 << i));
          return !(candidate.mask & (1 << i)) && candidate.clues[i] === clue;
        }));
        expect(possible.length).toBeGreaterThan(0);
        const moves = findForcedMoves(visible, neighbors, 3);
        for (const i of moves.safe) {
          expect(visible[i]).toBe(-2);
          expect(possible.every(candidate => !(candidate.mask & (1 << i)))).toBe(true);
        }
        for (const i of moves.mines) {
          expect(visible[i]).toBe(-2);
          expect(possible.every(candidate => Boolean(candidate.mask & (1 << i)))).toBe(true);
        }
        deductions += moves.safe.length + moves.mines.length;
      }
    }
    expect(deductions).toBeGreaterThan(1000);
  });

  test('uses overlapping clues when no single clue gives a move', () => {
    // {2,3}=1 and {2,3,4}=2 imply that 4 is a mine.
    const visible = new Int8Array([1, 2, -2, -2, -2, -2]);
    expect(findForcedMoves(visible, [[2, 3], [2, 3, 4], [], [], [], []], 3)).toEqual({ safe: [], mines: [4] });
  });

  test('uses the total mine count for cells with no adjacent opened clue', () => {
    expect(findForcedMoves(new Int8Array([-1, -2, -2]), [[], [], []], 1)).toEqual({ safe: [1, 2], mines: [] });
    expect(findForcedMoves(new Int8Array([-2, -2]), [[], []], 2)).toEqual({ safe: [], mines: [0, 1] });
  });

  test('rejects a genuinely ambiguous board without looking behind the mine barrier', () => {
    const game = new Minesweeper({ width: 3, height: 5, mines: 4 }, () => 0);
    game.reveal(1);
    expect(game.cells.flatMap((cell, i) => cell.mine ? [i] : [])).toEqual([6, 7, 8, 9]);
    const opened: number[] = [];
    expect(isSolvable(1, game.cells.map((_, i) => game.neighbors(i)), 4, i => {
      opened.push(i);
      return game.cells[i].mine ? -1 : game.cells[i].adjacent;
    })).toBe(false);
    expect(opened.every(i => i < 6)).toBe(true);
  });
});

describe('no-guess games', () => {
  for (const [name, config] of Object.entries(DIFFICULTIES)) {
    test(`${name}: generated boards can be played to victory using only visible information`, () => {
      const size = config.width * config.height;
      for (let seed = 0; seed < 8; seed++) {
        for (const first of [0, config.width - 1, Math.floor(config.height / 2) * config.width + Math.floor(config.width / 2), size - config.width, size - 1]) {
          const game = new Minesweeper({ ...config, noGuess: true }, seeded(seed * size + first));
          game.reveal(first, 1000);
          const layout = game.cells.map(cell => cell.mine);
          expect(layout.filter(Boolean)).toHaveLength(config.mines);
          for (const i of [first, ...game.neighbors(first)]) expect(layout[i]).toBe(false);
          const neighbors = game.cells.map((_, i) => game.neighbors(i));
          game.cells.forEach((cell, i) => expect(cell.adjacent).toBe(neighbors[i].filter(j => layout[j]).length));
          // The generation proof must not leave its own flags or opened cells.
          if (!game.finished) expect(game.flags).toBe(0);
          for (let step = 0; !game.finished && step < size; step++) {
            const visible = Int8Array.from(game.cells, cell => cell.revealed ? cell.adjacent : cell.flagged ? -1 : -2);
            const moves = findForcedMoves(visible, neighbors, config.mines);
            expect(moves.safe.length + moves.mines.length).toBeGreaterThan(0);
            for (const i of moves.mines) {
              expect(layout[i]).toBe(true);
              game.toggleFlag(i);
            }
            for (const i of moves.safe) {
              expect(layout[i]).toBe(false);
              if (!game.cells[i].revealed) game.reveal(i, 2000);
            }
          }
          expect(game.status).toBe('won');
          expect(game.cells.map(cell => cell.mine)).toEqual(layout);
        }
      }
    });
  }

  test('exhausted generation leaves a clean ready board and never falls back to guessing', () => {
    const game = new Minesweeper({ width: 3, height: 5, mines: 4, noGuess: true }, () => 0);
    game.toggleFlag(14);
    const before = game.snapshot();
    expect(() => game.reveal(1)).toThrow('Не удалось подобрать поле без угадываний');
    expect(game.snapshot()).toEqual(before);
  });

  test('preserves pre-game flags, mode, board and timer across restoration', () => {
    const game = new Minesweeper({ ...DIFFICULTIES.beginner, noGuess: true }, seeded(10));
    game.toggleFlag(1);
    game.reveal(0, 1000);
    expect(game.cells[1].flagged).toBe(true);
    expect(game.cells[1].revealed).toBe(false);
    const snapshot = game.snapshot(4750);
    const restored = Minesweeper.restore(game.config, snapshot, 10000)!;
    expect(restored.config.noGuess).toBe(true);
    expect(restored.snapshot(10000)).toEqual(snapshot);
    expect(restored.elapsed(10250)).toBe(4);
    restored.toggleFlag(1);
    restored.reveal(1);
    expect(restored.status).not.toBe('lost');
  });
});
