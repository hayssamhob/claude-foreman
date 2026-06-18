const HUNK_HEADER = /@@ -(\d+),?\d* \+(\d+),?\d* @@/g;

export enum CircleType {
  SAME_REGION = "same_region",
  SAME_ERROR = "same_error",
  NET_ZERO = "net_zero",
}

interface AttemptRecord {
  changedFiles: string[];
  hunks: Array<[number, number]>;
  addedLines: Set<string>;
  removedLines: Set<string>;
  errors: string[];
}

function parseAttempt(changedFiles: string[], diff: string, errors: string[]): AttemptRecord {
  const hunks: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(HUNK_HEADER.source, "g");
  while ((m = re.exec(diff)) !== null) hunks.push([parseInt(m[1], 10), parseInt(m[2], 10)]);

  const addedLines = new Set<string>();
  const removedLines = new Set<string>();
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) addedLines.add(line.slice(1).trim());
    if (line.startsWith("-") && !line.startsWith("---")) removedLines.add(line.slice(1).trim());
  }
  return { changedFiles, hunks, addedLines, removedLines, errors };
}

export class CircleDetector {
  private history: AttemptRecord[] = [];

  check(
    _attempt: number,
    changedFiles: string[],
    diff: string,
    errors: string[]
  ): CircleType | null {
    const record = parseAttempt(changedFiles, diff, errors);

    if (this.history.length === 0) {
      this.history.push(record);
      return null;
    }

    const prev = this.history[this.history.length - 1];
    this.history.push(record);

    // Same files + overlapping diff region
    if (
      record.hunks.length > 0 &&
      prev.hunks.length > 0 &&
      new Set(changedFiles).size === new Set(prev.changedFiles).size &&
      [...changedFiles].every((f) => prev.changedFiles.includes(f))
    ) {
      const prevHunkKeys = new Set(prev.hunks.map(([a, b]) => `${a}:${b}`));
      if (record.hunks.some(([a, b]) => prevHunkKeys.has(`${a}:${b}`))) {
        return CircleType.SAME_REGION;
      }
    }

    // Same error signature
    if (errors.length > 0 && prev.errors.length > 0) {
      const prevSigs = new Set(prev.errors.map(errorSignature));
      if (errors.some((e) => prevSigs.has(errorSignature(e)))) {
        return CircleType.SAME_ERROR;
      }
    }

    // Net-zero: current adds what previous removed and vice versa
    if (
      record.addedLines.size > 0 &&
      record.removedLines.size > 0 &&
      prev.addedLines.size > 0 &&
      prev.removedLines.size > 0
    ) {
      const addsInPrevRemoved = [...record.addedLines].some((l) => prev.removedLines.has(l));
      const removesInPrevAdded = [...record.removedLines].some((l) => prev.addedLines.has(l));
      if (addsInPrevRemoved && removesInPrevAdded) return CircleType.NET_ZERO;
    }

    return null;
  }

  reset(): void {
    this.history = [];
  }
}

function errorSignature(error: string): string {
  const m = /^(TS\d+|E\d+|SyntaxError|TypeError|ReferenceError)/.exec(error);
  return m ? m[1] : error.slice(0, 50);
}
