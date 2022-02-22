import { DisplayType } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandData } from "../../../command/commandData";
import { CommandRunner } from "../../../command/commandRunner";
import { VariableData } from "../../../variable/variableData";
import { DisplayCommandData } from "./displayCommandData";

export class DisplayCommandRunner extends CommandRunner<DisplayCommandData> {
  down = false;

  onExecute(
    data: DisplayCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    this.down = game.input.state.pointer.down.includes(0);
    const ui = data.ui || "impower-ui-display";
    const characterEl = document.querySelector(`#${ui} .character`);
    const parentheticalEl = document.querySelector(`#${ui} .parenthetical`);
    const contentEl = document.querySelector(`#${ui} .content`);
    const character = data.type === DisplayType.Dialogue ? data.character : "";
    const parenthetical =
      data.type === DisplayType.Dialogue ? data.parenthetical : "";
    const content = data?.content;
    characterEl?.replaceChildren(character);
    parentheticalEl?.replaceChildren(parenthetical);
    contentEl?.replaceChildren(content);
    return super.onExecute(data, variables, game, index, blockCommands);
  }

  isFinished(
    data: DisplayCommandData,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): boolean {
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    if (!prevDown && this.down) {
      return true;
    }
    return false;
  }
}
