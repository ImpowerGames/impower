import { CommandParams } from "./CommandParams";
import { CommandReference } from "./CommandReference";

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
  index: number;
  params: P;
}
