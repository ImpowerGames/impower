import { Ease } from "../../../data/enums/ease";
import { GameEvent } from "../events/gameEvent";
import { Manager } from "./manager";

export interface AssetState {
  loadedFileIds: string[];
}

export interface AssetEvents {
  onShowImageFile: GameEvent<{
    id: string;
    x: number;
    y: number;
    duration: number;
    ease: Ease;
  }>;
  onMoveImageFile: GameEvent<{
    id: string;
    x: number;
    y: number;
    ease: Ease;
    duration: number;
    additive: boolean;
  }>;
  onRotateImageFile: GameEvent<{
    id: string;
    angle: number;
    ease: Ease;
    duration: number;
    additive: boolean;
  }>;
  onScaleImageFile: GameEvent<{
    id: string;
    x: number;
    y: number;
    ease: Ease;
    duration: number;
    additive: boolean;
  }>;
  onHideImageFile: GameEvent<{
    id: string;
    duration: number;
    ease: Ease;
  }>;
  onPlayAudioFile: GameEvent<{
    id: string;
    volume: number;
    loop: boolean;
    duration: number;
  }>;
  onPauseAudioFile: GameEvent<{
    id: string;
    duration: number;
  }>;
  onResumeAudioFile: GameEvent<{
    id: string;
    duration: number;
  }>;
  onStopAudioFile: GameEvent<{
    id: string;
    duration: number;
  }>;
  onMarkImageAsClickTrigger: GameEvent<{ id: string }>;
  onMarkImageAsHoverTrigger: GameEvent<{ id: string }>;
  onMarkImageAsDragTrigger: GameEvent<{ id: string }>;
  onMarkImageAsDropTrigger: GameEvent<{ id: string }>;
  onClickDownImage: GameEvent<{ id: string }>;
  onClickUpImage: GameEvent<{ id: string }>;
  onHoverImage: GameEvent<{ id: string }>;
  onDragImage: GameEvent<{ id: string }>;
  onDropImage: GameEvent<{ id: string }>;

  onUnloadFragment: GameEvent<{ id: string }>;
  onUnloadImageFile: GameEvent<{ id: string }>;
  onUnloadAudioFile: GameEvent<{ id: string }>;
}

export class AssetManager extends Manager<AssetState, AssetEvents> {
  getInitialState(): AssetState {
    return {
      loadedFileIds: [],
    };
  }

  getInitialEvents(): AssetEvents {
    return {
      onShowImageFile: new GameEvent<{
        id: string;
        x: number;
        y: number;
        duration: number;
        ease: Ease;
      }>(),
      onMoveImageFile: new GameEvent<{
        id: string;
        x: number;
        y: number;
        ease: Ease;
        duration: number;
        additive: boolean;
      }>(),
      onRotateImageFile: new GameEvent<{
        id: string;
        angle: number;
        ease: Ease;
        duration: number;
        additive: boolean;
      }>(),
      onScaleImageFile: new GameEvent<{
        id: string;
        x: number;
        y: number;
        ease: Ease;
        duration: number;
        additive: boolean;
      }>(),
      onHideImageFile: new GameEvent<{
        id: string;
        duration: number;
        ease: Ease;
      }>(),
      onPlayAudioFile: new GameEvent<{
        id: string;
        volume: number;
        loop: boolean;
        duration: number;
      }>(),
      onPauseAudioFile: new GameEvent<{
        id: string;
        duration: number;
      }>(),
      onResumeAudioFile: new GameEvent<{
        id: string;
        duration: number;
      }>(),
      onStopAudioFile: new GameEvent<{
        id: string;
        duration: number;
      }>(),
      onMarkImageAsClickTrigger: new GameEvent<{ id: string }>(),
      onMarkImageAsHoverTrigger: new GameEvent<{ id: string }>(),
      onMarkImageAsDragTrigger: new GameEvent<{ id: string }>(),
      onMarkImageAsDropTrigger: new GameEvent<{ id: string }>(),
      onClickDownImage: new GameEvent<{ id: string }>(),
      onClickUpImage: new GameEvent<{ id: string }>(),
      onHoverImage: new GameEvent<{ id: string }>(),
      onDragImage: new GameEvent<{ id: string }>(),
      onDropImage: new GameEvent<{ id: string }>(),
      onUnloadFragment: new GameEvent<{ id: string }>(),
      onUnloadImageFile: new GameEvent<{ id: string }>(),
      onUnloadAudioFile: new GameEvent<{ id: string }>(),
    };
  }

  getSaveData(): AssetState {
    return this.deepCopyState(this.state);
  }

  loadDefaultImage(data: { id: string }): void {
    const { id } = data;
    if (!this.doesFileExist(id)) {
      this.state.loadedFileIds.push(id);

      this.events.onShowImageFile.emit({
        id,
        x: 128,
        y: 128,
        duration: 0,
        ease: Ease.Linear,
      });
    }
  }

  loadFragment(data: { id: string }): void {
    this.state.loadedFileIds.push(data.id);
  }

  loadFragments(data: { ids: string[] }): void {
    data.ids.map((id) => this.loadFragment({ id }));
  }

  loadAllFragments(): void {
    this.loadFragments({ ids: Object.keys(this.state.loadedFileIds) });
  }

  doesFileExist(id: string): boolean {
    return this.state.loadedFileIds.includes(id);
  }

  showImageFile(data: {
    id: string;
    x: number;
    y: number;
    duration: number;
    ease: Ease;
  }): void {
    const { id } = data;

    if (!this.doesFileExist(id)) {
      this.state.loadedFileIds.push(id);
    }
    this.events.onShowImageFile.emit({ ...data });
  }

  moveImageFile(data: {
    id: string;
    x: number;
    y: number;
    duration: number;
    additive: boolean;
    ease: Ease;
  }): void {
    this.loadDefaultImage({ id: data.id });
    this.events.onMoveImageFile.emit({ ...data });
  }

  rotateImageFile(data: {
    id: string;
    angle: number;
    duration: number;
    additive: boolean;
    ease: Ease;
  }): void {
    this.loadDefaultImage({ id: data.id });
    this.events.onRotateImageFile.emit({ ...data });
  }

  scaleImageFile(data: {
    id: string;
    x: number;
    y: number;
    duration: number;
    additive: boolean;
    ease: Ease;
  }): void {
    this.loadDefaultImage({ id: data.id });
    this.events.onScaleImageFile.emit({ ...data });
  }

  hideImageFile(data: { id: string; duration: number; ease: Ease }): void {
    const { id } = data;

    if (!this.doesFileExist(id)) {
      this.state.loadedFileIds.push(id);
    }
    this.events.onHideImageFile.emit({ ...data });
  }

  playAudioFile(data: {
    id: string;
    volume: number;
    loop: boolean;
    duration: number;
  }): void {
    const { id } = data;

    if (!this.doesFileExist(id)) {
      this.state.loadedFileIds.push(id);
    }

    this.events.onPlayAudioFile.emit({ ...data });
  }

  pauseAudioFile(data: { id: string; duration: number }): void {
    const { id } = data;

    if (!this.doesFileExist(id)) {
      this.state.loadedFileIds.push(id);
    }

    this.events.onPauseAudioFile.emit({ ...data });
  }

  resumeAudioFile(data: { id: string; duration: number }): void {
    const { id } = data;

    if (!this.doesFileExist(id)) {
      this.state.loadedFileIds.push(id);
    }

    this.events.onResumeAudioFile.emit({ ...data });
  }

  stopAudioFile(data: { id: string; duration: number }): void {
    this.events.onStopAudioFile.emit({ ...data });
  }

  markImageAsClickTrigger(data: { id: string }): void {
    this.events.onMarkImageAsClickTrigger.emit({ ...data });
    this.loadDefaultImage({ id: data.id });
  }

  markImageAsHoverTrigger(data: { id: string }): void {
    this.events.onMarkImageAsHoverTrigger.emit({ ...data });
    this.loadDefaultImage({ id: data.id });
  }

  markImageAsDragTrigger(data: { id: string }): void {
    this.events.onMarkImageAsDragTrigger.emit({ ...data });
    this.loadDefaultImage({ id: data.id });
  }

  markImageAsDropTrigger(data: { id: string }): void {
    this.events.onMarkImageAsDropTrigger.emit({ ...data });
    this.loadDefaultImage({ id: data.id });
  }

  clickDownImage(data: { id: string }): void {
    this.events.onClickDownImage.emit({ ...data });
  }

  clickUpImage(data: { id: string }): void {
    this.events.onClickUpImage.emit({ ...data });
  }

  hoverImage(data: { id: string }): void {
    this.events.onHoverImage.emit({ ...data });
  }

  dragImage(data: { id: string }): void {
    this.events.onDragImage.emit({ ...data });
  }

  dropImage(data: { id: string }): void {
    this.events.onDropImage.emit({ ...data });
  }

  unloadFragment(data: { id: string }): void {
    this.state.loadedFileIds = this.state.loadedFileIds.filter(
      (x) => x !== data.id
    );
    this.events.onUnloadFragment.emit({ ...data });
  }

  unloadFragments(data: { ids: string[] }): void {
    data.ids.map((id) => this.unloadFragment({ id }));
  }

  unloadAllFragments(): void {
    this.loadFragments({ ids: Object.keys(this.state.loadedFileIds) });
  }

  unloadImageFile(data: { id: string }): void {
    const { id } = data;

    this.state.loadedFileIds = this.state.loadedFileIds.filter(
      (element) => element[0] !== id
    );
    this.events.onUnloadImageFile.emit({ ...data });
  }

  unloadAudioFile(data: { id: string }): void {
    const { id } = data;

    this.state.loadedFileIds = this.state.loadedFileIds.filter(
      (element) => element[0] !== id
    );
    this.events.onUnloadAudioFile.emit({ ...data });
  }
}
