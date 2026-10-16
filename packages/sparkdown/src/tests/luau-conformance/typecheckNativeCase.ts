import { loadNativeFixture, type NativeFixture } from "../analysis-backend/native-conformance/nativeFixture";

export interface NativeCaseMemory {
  instances: number;
  initializedLinearBytes: number;
  peakLinearBytes: number;
  perInstancePeakBytes: number[];
}

/** Async initialization finishes before the existing synchronous assertion callbacks run. */
export class NativeCaseScope {
  private consumed = 0;
  private readonly initial: number[];
  private readonly peak: number[];
  constructor(private readonly fixtures: readonly NativeFixture[]) {
    this.initial = fixtures.map(fixture => fixture.heapBytes());
    this.peak = [...this.initial];
  }
  acquire(): NativeFixture {
    const fixture = this.fixtures[this.consumed++];
    if (!fixture) throw Error("Native check was not preinitialized for the current case");
    return fixture;
  }
  memory(): NativeCaseMemory {
    this.fixtures.forEach((fixture, index) => { this.peak[index] = Math.max(this.peak[index]!, fixture.heapBytes()); });
    return { instances: this.fixtures.length,
      initializedLinearBytes: this.initial.reduce((sum, value) => sum + value, 0),
      peakLinearBytes: this.peak.reduce((sum, value) => sum + value, 0), perInstancePeakBytes: [...this.peak] };
  }
}

let active: NativeCaseScope | undefined;
let initializing = false;
export function currentNativeCase(): NativeCaseScope {
  if (!active) throw Error("Native fixture case must be initialized asynchronously before checking");
  return active;
}

/** One current case only: independent checks acquire distinct instances; SAME sessions acquire once. */
export async function withNativeCase<T>(
  count: number,
  callback: (scope: NativeCaseScope) => T | Promise<T>,
  load: () => Promise<NativeFixture> = loadNativeFixture,
): Promise<{ value: T; memory: NativeCaseMemory }> {
  if (!Number.isSafeInteger(count) || count < 0) throw Error("Invalid current-case native fixture count");
  if (active || initializing) throw Error("Native fixture cases cannot overlap");
  const fixtures: NativeFixture[] = [];
  initializing = true;
  try {
    for (let index = 0; index < count; index++) fixtures.push(await load());
    const scope = new NativeCaseScope(fixtures);
    active = scope;
    const value = await callback(scope);
    return { value, memory: scope.memory() };
  } finally {
    active = undefined;
    initializing = false;
    // Attempt every disposal even if one fails. Do not leave later native sessions alive.
    const failures: unknown[] = [];
    for (const fixture of fixtures) {
      try { fixture.dispose(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Native fixture case disposal failed");
  }
}
