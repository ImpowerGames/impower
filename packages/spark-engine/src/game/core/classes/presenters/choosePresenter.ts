import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { PresentOptions, Presenter } from "./Presenter";
import { VisualNovelPresenter } from "./VisualNovelPresenter";

export function choosePresenter(
  game: Game,
  instructions: Instructions,
  options: PresentOptions,
): Presenter {
  return new VisualNovelPresenter(game, instructions, options);
}
