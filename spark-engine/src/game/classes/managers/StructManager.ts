import { Manager } from "../Manager";

export interface StructState {}

export interface StructEvents {}

export class StructManager extends Manager<StructState, StructEvents> {
  private _objectMap: Record<string, Record<string, unknown>>;

  public get objectMap(): Record<string, Record<string, unknown>> {
    return this._objectMap;
  }

  constructor(
    objectMap: Record<string, Record<string, unknown>>,
    state?: StructState
  ) {
    super(state);
    this._objectMap = objectMap;
  }

  getInitialState(): StructState {
    return {};
  }

  getInitialEvents(): StructEvents {
    return {};
  }

  getSaveData(): StructState {
    return this.deepCopyState(this.state);
  }
}
