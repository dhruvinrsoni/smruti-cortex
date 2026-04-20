/**
 * Port for time operations — enables deterministic testing.
 * Production adapter: delegates to Date.now(), setTimeout, etc.
 * Test adapter: manual clock with controllable time.
 */
export interface IClockPort {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
}

/** Default production clock that delegates to global functions. */
export const SystemClock: IClockPort = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id),
};
