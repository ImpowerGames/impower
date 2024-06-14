import { CommandParams } from "./CommandParams";
import { DocumentSource } from "./DocumentSource";

export interface CommandData<
  T extends string = string,
  P extends CommandParams = CommandParams
> {
  type: T | "";
  parent: string;
  id: string;
  index: number;
  indent: number;
  params: P;
  source: DocumentSource;
}
