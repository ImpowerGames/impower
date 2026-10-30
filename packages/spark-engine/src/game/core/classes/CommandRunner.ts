import type { ICommandRunner } from "../types/ICommandRunner";
import type { Game } from "./Game";

export class CommandRunner<G extends Game> implements ICommandRunner {
  private _game: G;
  get game() {
    return this._game;
  }

  constructor(game: G) {
    this._game = game;
  }

  onInit(): void {
  }

  onUpdate(_deltaMS: number): void {
  }

  onDestroy(): void {
  }

  onExecute(): boolean {
    return false;
  }

  isFinished(): boolean | string {
    return true;
  }

  onFinished(): void {
  }

  onPreview(): boolean {
    return false;
  }
}
