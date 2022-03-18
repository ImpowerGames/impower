import { CommandData } from "../../../../../../../data";
import { CommandRunner } from "../../../command/commandRunner";

export class CloseCommandRunner extends CommandRunner<
  CommandData<"CloseCommand">
> {
  closesGroup(): boolean {
    return true;
  }
}
