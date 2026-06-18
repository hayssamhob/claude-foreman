import { config } from "./config.js";
import { notify } from "./notify.js";

export interface CostSnapshot {
  tokens: number;
  usdCents: number;
  queueDepth: number;
}

export class CostLedger {
  private tokens = 0;
  private usdCents = 0;
  private queueDepth = 0;
  private tripped: string | null = null;

  record(tokens: number, usdCents: number): void {
    if (this.tripped) return;
    this.tokens += tokens;
    this.usdCents += usdCents;
  }

  snapshot(): CostSnapshot {
    return { tokens: this.tokens, usdCents: this.usdCents, queueDepth: this.queueDepth };
  }

  isTripped(): boolean {
    return this.tripped !== null;
  }

  tripReason(): string | null {
    return this.tripped;
  }

  reset(): void {
    this.tokens = 0;
    this.usdCents = 0;
    this.tripped = null;
  }

  check(queueDepth: number, log: (m: string) => void): string | null {
    this.queueDepth = queueDepth;
    if (this.tripped) return this.tripped;

    let reason: string | null = null;

    if (config.maxUsd !== undefined && this.usdCents / 100 > config.maxUsd) {
      reason = "maxUsd";
    } else if (config.maxTokens !== undefined && this.tokens > config.maxTokens) {
      reason = "maxTokens";
    } else if (config.maxQueue !== undefined && queueDepth > config.maxQueue) {
      reason = "maxQueue";
    }

    if (reason) {
      this.tripped = reason;
      const msg = `Cost ceiling hit: ${reason} exceeded`;
      log(msg);
      void notify("Cost ceiling hit", msg, { priority: "high" });
      return reason;
    }

    return null;
  }
}
