import { CommandData, CommandTypeId } from "../../../../../../../data";
import { CommandRunner } from "../../../command/commandRunner";

export class CloseCommandRunner extends CommandRunner<
  CommandData<CommandTypeId.CloseCommand>
> {
  closesGroup(_data: CommandData): boolean {
    return true;
  }
}
