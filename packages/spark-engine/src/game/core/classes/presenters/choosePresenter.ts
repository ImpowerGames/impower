import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { PresentOptions, Presenter } from "./Presenter";
import { StagePresenter } from "./StagePresenter";
import {
  presentsText,
  textLayoutOpenAfter,
  UNSHOWN_TEXT_MESSAGE,
} from "./textLayouts";
import { VisualNovelPresenter } from "./VisualNovelPresenter";

const reportedUnshownText = new WeakSet<Game>();

export function choosePresenter(
  game: Game,
  instructions: Instructions,
  options: PresentOptions,
): Presenter {
  if (!presentsText(instructions) || textLayoutOpenAfter(game, instructions)) {
    return new VisualNovelPresenter(game, instructions, options);
  }
  if (!reportedUnshownText.has(game)) {
    reportedUnshownText.add(game);
    game.log(UNSHOWN_TEXT_MESSAGE, "warning");
  }
  return new StagePresenter(game, instructions, options);
}
