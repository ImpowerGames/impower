import { CommandData } from "../../../../../../../data";
import { CommandRunner } from "../../../command/CommandRunner";

export class EndCommandRunner extends CommandRunner<CommandData> {
  onExecute(): number[] {
    return [];
  }
}
