import { GameEvent } from "../events/gameEvent";
import { Manager } from "./manager";

export interface EntityState {
  loadedConstructs: string[];
}

export interface EntityEvents {
  onLoadConstruct: GameEvent<{ id: string }>;
  onUnloadConstruct: GameEvent<{ id: string }>;
  onClearPreviousConstructs: GameEvent;
  onSetElementImage: GameEvent<{
    imageRefId: string;
    constructRefId: string;
    elementRefId: string;
  }>;
}

export class EntityManager extends Manager<EntityState, EntityEvents> {
  getInitialState(): EntityState {
    return {
      loadedConstructs: [],
    };
  }

  getInitialEvents(): EntityEvents {
    return {
      onLoadConstruct: new GameEvent<{ id: string }>(),
      onUnloadConstruct: new GameEvent<{ id: string }>(),
      onClearPreviousConstructs: new GameEvent(),
      onSetElementImage: new GameEvent<{
        imageRefId: string;
        constructRefId: string;
        elementRefId: string;
      }>(),
    };
  }

  getSaveData(): EntityState {
    return this.deepCopyState(this.state);
  }

  loadConstruct(data: { id: string }): void {
    this.state.loadedConstructs.push(data.id);
    this.events.onLoadConstruct.emit({ ...data });
  }

  loadConstructs(data: { ids: string[] }): void {
    data.ids.map((id) => this.loadConstruct({ id }));
  }

  loadAllConstructs(): void {
    this.loadConstructs({ ids: Object.keys(this.state.loadedConstructs) });
  }

  unloadConstruct(data: { id: string }): void {
    this.state.loadedConstructs = this.state.loadedConstructs.filter(
      (x) => x !== data.id
    );

    this.events.onUnloadConstruct.emit({ ...data });
  }

  unloadConstructs(data: { ids: string[] }): void {
    data.ids.map((id) => this.unloadConstruct({ id }));
  }

  unloadAllConstructs(): void {
    this.unloadConstructs({ ids: Object.keys(this.state.loadedConstructs) });
  }

  clearPreviousConstructs(): void {
    this.events.onClearPreviousConstructs.emit();
  }

  setElementImage(data: {
    imageRefId: string;
    constructRefId: string;
    elementRefId: string;
  }): void {
    this.state.loadedConstructs.push(data.constructRefId);
    this.events.onSetElementImage.emit({ ...data });
  }
}
