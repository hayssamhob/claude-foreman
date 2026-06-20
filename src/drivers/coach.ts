/**
 * CoachDriver socket — the vendor-agnostic interface the Coach (judgment role)
 * runs behind. Mirror of FighterDriver, but shaped for one-shot judgment calls
 * (interview / plan / judge → structured verdict) rather than a tick loop.
 */
export interface CoachDriver {
  readonly name: string;
  run<T>(prompt: string): Promise<T>;
}

export interface CoachDriverDeps {
  log: (m: string) => void;
}
