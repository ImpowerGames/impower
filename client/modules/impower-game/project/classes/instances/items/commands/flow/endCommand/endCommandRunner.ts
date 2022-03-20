import { CommandData } from "../../../../../../../data";
import { CommandRunner } from "../../../command/commandRunner";

export class EndCommandRunner extends CommandRunner<CommandData> {
  onExecute(): number[] {
    return null;
  }
}
