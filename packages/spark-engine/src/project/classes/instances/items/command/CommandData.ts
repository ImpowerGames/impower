import { CommandReference } from "../../../../../data/interfaces/references/CommandReference";
import { CommandParams } from "./CommandParams";

export interface CommandData<
  T extends string = string,
  P extends CommandParams = CommandParams
> {
  reference: CommandReference<T>;
  source: {
    file: string;
    line: number;
    from: number;
    to: number;
  };
  indent: number;
  params: P;
}
