export type LcsDiffOp<T> =
  | { type: "same"; beforeItem: T; afterItem: T }
  | { type: "delete"; beforeItem: T }
  | { type: "insert"; afterItem: T };

/** Builds insert/delete/same operations using a longest-common-subsequence table. */
export function buildLcsDiffOps<T>(
  beforeItems: readonly T[],
  afterItems: readonly T[],
  isEqual: (beforeItem: T, afterItem: T) => boolean = Object.is
): LcsDiffOp<T>[] {
  const beforeCount = beforeItems.length;
  const afterCount = afterItems.length;
  const columnCount = afterCount + 1;
  const scores = new Uint32Array((beforeCount + 1) * columnCount);

  /** Reads a score from the flattened dynamic-programming table. */
  const scoreAt = (beforeIndex: number, afterIndex: number) =>
    scores[beforeIndex * columnCount + afterIndex];
  /** Writes a score into the flattened dynamic-programming table. */
  const setScore = (beforeIndex: number, afterIndex: number, value: number) => {
    scores[beforeIndex * columnCount + afterIndex] = value;
  };

  for (let beforeIndex = beforeCount - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterCount - 1; afterIndex >= 0; afterIndex -= 1) {
      if (isEqual(beforeItems[beforeIndex], afterItems[afterIndex])) {
        setScore(beforeIndex, afterIndex, scoreAt(beforeIndex + 1, afterIndex + 1) + 1);
      } else {
        setScore(
          beforeIndex,
          afterIndex,
          Math.max(scoreAt(beforeIndex + 1, afterIndex), scoreAt(beforeIndex, afterIndex + 1))
        );
      }
    }
  }

  const ops: LcsDiffOp<T>[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeCount && afterIndex < afterCount) {
    if (isEqual(beforeItems[beforeIndex], afterItems[afterIndex])) {
      ops.push({
        type: "same",
        beforeItem: beforeItems[beforeIndex],
        afterItem: afterItems[afterIndex]
      });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (scoreAt(beforeIndex + 1, afterIndex) >= scoreAt(beforeIndex, afterIndex + 1)) {
      ops.push({ type: "delete", beforeItem: beforeItems[beforeIndex] });
      beforeIndex += 1;
    } else {
      ops.push({ type: "insert", afterItem: afterItems[afterIndex] });
      afterIndex += 1;
    }
  }

  while (beforeIndex < beforeCount) {
    ops.push({ type: "delete", beforeItem: beforeItems[beforeIndex] });
    beforeIndex += 1;
  }

  while (afterIndex < afterCount) {
    ops.push({ type: "insert", afterItem: afterItems[afterIndex] });
    afterIndex += 1;
  }

  return ops;
}
