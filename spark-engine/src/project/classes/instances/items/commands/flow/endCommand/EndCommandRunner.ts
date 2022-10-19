import { CommandData } from "../../../../../../../data";
import { CommandRunner } from "../../../command/CommandRunner";

export class EndCommandRunner extends CommandRunner<CommandData> {
  override onExecute(): number[] {
    return [];
  }
}
