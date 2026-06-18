export interface StallSignal {
  type: "stall";
  rounds: number;
  reason: string;
}

/**
 * Catches a zero-progress retry loop: if the fighter's diff is empty or
 * identical to the previous round's diff for `threshold` consecutive rounds,
 * it has stalled.
 */
export class StallDetector {
  private zeroProgressRounds = 0;
  private lastDiff = "";

  check(diff: string, _round: number, threshold = 3): StallSignal | null {
    const noProgress = diff.trim() === "" || diff.trim() === this.lastDiff.trim();
    if (noProgress) {
      this.zeroProgressRounds++;
    } else {
      this.zeroProgressRounds = 0;
      this.lastDiff = diff;
    }

    if (this.zeroProgressRounds >= threshold) {
      return {
        type: "stall",
        rounds: this.zeroProgressRounds,
        reason:
          diff.trim() === ""
            ? `no diff produced for ${this.zeroProgressRounds} consecutive rounds`
            : `identical diff repeated for ${this.zeroProgressRounds} consecutive rounds`,
      };
    }
    return null;
  }

  reset(): void {
    this.zeroProgressRounds = 0;
    this.lastDiff = "";
  }
}
