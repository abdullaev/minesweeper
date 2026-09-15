import { Minesweeper } from './game';
import type { Config, GameSnapshot } from './game';

self.onmessage = (event: MessageEvent<{ config: Config; snapshot: GameSnapshot; first: number }>) => {
  try {
    const { config, snapshot, first } = event.data;
    const game = Minesweeper.restore(config, snapshot);
    if (!game || game.status !== 'ready' || !game.reveal(first, 0)) throw new Error('Не удалось создать поле. Попробуй ещё раз.');
    self.postMessage({ snapshot: game.snapshot(0) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Не удалось создать поле. Попробуй ещё раз.' });
  }
};
