export interface ProgramEmitter {
  emit(op: number, arg?: number, aux?: number, flags?: number): void;
  emitObject(obj: EmittedObject): void;
  emitObjects(objects: readonly EmittedObject[]): void;
  emitBranchBody(branch: object): void;
  emitFunctionInPlace(fn: object): void;
  bindParameters(
    params: readonly { name: string; vararg: boolean; rootSlot?: string | null }[],
  ): void;
  emitChoose(weave: object): void;
  emitPreambleChoose(weave: object): void;
  emitLoopExit(divert: object, exit: "break" | "continue"): void;
  jump(op: number, flags?: number, aux?: number): ProgramLabel;
  jumpBack(op: number, label: ProgramLabel, flags?: number): void;
  bind(label: ProgramLabel): void;
  string(text: string): number;
  number(value: number): number;
  variable(name: string): number;
  recordRead(value: string): void;
  recordResolution(value: string): void;
  fact(symbol: number, name: string): string;
  reference(symbol: number): void;
  referenceTarget(symbol: number): void;
  functionSymbol(fn: object): number;
  targetSymbol(target: object | null, written: string): number;
  labelSymbol(gather: object): number;
  alternatorSymbol(sequence: object): number;
  exportHere(symbol: number): void;
  unsupported(construct: string): never;
}

export interface EmittedObject {
  readonly ownDebugMetadata: unknown;
  EmitProgram(emitter: ProgramEmitter): void;
}

export interface ProgramLabel {
  offset: number;
}

export class UnsupportedConstruct extends Error {
  constructor(public readonly construct: string) {
    super(`The binary program does not emit ${construct}`);
  }
}

export class StatementFailure extends Error {
  constructor(
    public readonly uri: string,
    public readonly line: number,
    public readonly error: unknown,
    public readonly endLine = line,
  ) {
    super(error instanceof Error ? error.message : String(error));
  }
}
