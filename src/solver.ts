// The solver sees only opened clues and mines already proved by deduction.
// Hidden cells are -2, proved mines are -1, opened clues are 0–8.
export function findForcedMoves(visible: Int8Array, neighbors: readonly number[][], totalMines: number): { safe: number[]; mines: number[] } {
  const safe = new Set<number>();
  const mines = new Set<number>();
  const constraints: { cells: number[]; set: Set<number>; count: number }[] = [];
  const hidden: number[] = [];
  let remaining = totalMines;
  const classify = (cells: number[], count: number): void => {
    if (count === 0) cells.forEach(i => safe.add(i));
    else if (count === cells.length) cells.forEach(i => mines.add(i));
  };
  visible.forEach((clue, index) => {
    if (clue === -2) hidden.push(index);
    else if (clue === -1) remaining--;
    else {
      const cells = neighbors[index].filter(i => visible[i] === -2);
      if (!cells.length) return;
      const count = clue - neighbors[index].filter(i => visible[i] === -1).length;
      classify(cells, count);
      constraints.push({ cells, set: new Set(cells), count });
    }
  });
  // The total mine count is public information, including away from the frontier.
  classify(hidden, remaining);
  if (safe.size || mines.size) return { safe: [...safe], mines: [...mines] };

  for (let a = 0; a < constraints.length; a++) {
    for (let b = a + 1; b < constraints.length; b++) {
      const left = constraints[a];
      const right = constraints[b];
      if (!left.cells.some(i => right.set.has(i))) continue;
      const onlyLeft = left.cells.filter(i => !right.set.has(i));
      const onlyRight = right.cells.filter(i => !left.set.has(i));
      // Subtract the two equations. At an extreme, every cell in one
      // difference is a mine and every cell in the other is safe.
      // This covers subset rules (e.g. 1–2–1) and overlapping constraints.
      if (left.count - right.count === onlyLeft.length) {
        onlyLeft.forEach(i => mines.add(i));
        onlyRight.forEach(i => safe.add(i));
      }
      if (right.count - left.count === onlyRight.length) {
        onlyRight.forEach(i => mines.add(i));
        onlyLeft.forEach(i => safe.add(i));
      }
    }
  }
  return { safe: [...safe], mines: [...mines] };
}

export function isSolvable(first: number, neighbors: readonly number[][], totalMines: number, revealClue: (index: number) => number): boolean {
  const visible = new Int8Array(neighbors.length).fill(-2);
  let opened = 0;
  let pending = [first];
  while (true) {
    while (pending.length) {
      const index = pending.pop()!;
      if (visible[index] !== -2) continue;
      // The caller exposes a clue only after this cell has been proved safe.
      const clue = revealClue(index);
      if (clue < 0) return false;
      visible[index] = clue;
      opened++;
      if (clue === 0) pending.push(...neighbors[index]);
    }
    if (opened === visible.length - totalMines) return true;
    const moves = findForcedMoves(visible, neighbors, totalMines);
    if (!moves.safe.length && !moves.mines.length) return false;
    moves.mines.forEach(i => { visible[i] = -1; });
    pending = moves.safe;
  }
}
