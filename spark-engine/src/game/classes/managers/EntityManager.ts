import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

export interface EntityState {
  loadedEntities: string[];
}

export interface EntityEvents {
  onLoadEntity: GameEvent<{ id: string }>;
  onUnloadEntity: GameEvent<{ id: string }>;
  onClearPreviousEntities: GameEvent;
}

export class EntityManager extends Manager<EntityState, EntityEvents> {
  private _objectMap: Record<string, Record<string, unknown>>;

  public get objectMap(): Record<string, Record<string, unknown>> {
    return this._objectMap;
  }

  constructor(
    objectMap: Record<string, Record<string, unknown>>,
    state?: EntityState
  ) {
    super(state);
    this._objectMap = objectMap;
  }

  getInitialState(): EntityState {
    return {
      loadedEntities: [],
    };
  }

  getInitialEvents(): EntityEvents {
    return {
      onLoadEntity: new GameEvent<{ id: string }>(),
      onUnloadEntity: new GameEvent<{ id: string }>(),
      onClearPreviousEntities: new GameEvent(),
    };
  }

  getSaveData(): EntityState {
    return this.deepCopyState(this.state);
  }

  loadEntity(data: { id: string }): void {
    this.state.loadedEntities.push(data.id);
    this.events.onLoadEntity.emit({ ...data });
  }

  loadEntities(data: { ids: string[] }): void {
    data.ids.map((id) => this.loadEntity({ id }));
  }

  loadAllEntities(): void {
    this.loadEntities({ ids: Object.keys(this.state.loadedEntities) });
  }

  unloadEntity(data: { id: string }): void {
    this.state.loadedEntities = this.state.loadedEntities.filter(
      (x) => x !== data.id
    );

    this.events.onUnloadEntity.emit({ ...data });
  }

  unloadEntities(data: { ids: string[] }): void {
    data.ids.map((id) => this.unloadEntity({ id }));
  }

  unloadAllEntities(): void {
    this.unloadEntities({ ids: Object.keys(this.state.loadedEntities) });
  }

  clearPreviousEntities(): void {
    this.events.onClearPreviousEntities.emit();
  }
}
