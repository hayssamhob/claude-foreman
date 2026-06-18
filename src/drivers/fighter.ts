export interface FighterDriver {
  readonly name: string;
  tick(): Promise<void>;
}
export interface FighterDriverDeps {
  store: import('../state/db.js').Store;
  auth: import('../manager/worker.js').AuthFn;
  log: (m: string) => void;
}
