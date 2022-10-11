import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

export interface EntityState {
  spawnedEntities: string[];
}

export interface EntityEvents {
  onSpawnEntity: GameEvent<{ id: string }>;
  onDestroyEntity: GameEvent<{ id: string }>;
}

export class EntityManager extends Manager<EntityState, EntityEvents> {
  constructor(state?: EntityState) {
    super(state);
  }

  getInitialState(): EntityState {
    return {
      spawnedEntities: [],
    };
  }

  getInitialEvents(): EntityEvents {
    return {
      onSpawnEntity: new GameEvent<{ id: string }>(),
      onDestroyEntity: new GameEvent<{ id: string }>(),
    };
  }

  getSaveData(): EntityState {
    return this.deepCopyState(this.state);
  }

  spawnEntity(data: { id: string }): void {
    this.state.spawnedEntities.push(data.id);
    this.events.onSpawnEntity.emit({ ...data });
  }

  spawnEntities(data: { ids: string[] }): void {
    data.ids.map((id) => this.spawnEntity({ id }));
  }

  spawnAllEntities(): void {
    this.spawnEntities({ ids: Object.keys(this.state.spawnedEntities) });
  }

  destroyEntity(data: { id: string }): void {
    this.state.spawnedEntities = this.state.spawnedEntities.filter(
      (x) => x !== data.id
    );

    this.events.onDestroyEntity.emit({ ...data });
  }

  destroyEntities(data: { ids: string[] }): void {
    data.ids.map((id) => this.destroyEntity({ id }));
  }

  destroyAllEntities(): void {
    this.destroyEntities({ ids: Object.keys(this.state.spawnedEntities) });
  }
}
