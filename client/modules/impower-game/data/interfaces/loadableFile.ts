import { ImpowerGame } from "../../game/classes/impowerGame";
import { VariableData } from "../../project/classes/instances/items/variable/variableData";

export interface LoadableFile<T> {
  getFileId(
    data: T,
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): string;
}

export const isLoadableFile = <T>(obj: unknown): obj is LoadableFile<T> => {
  if (!obj) {
    return false;
  }
  const loadable = obj as LoadableFile<T>;

  return loadable.getFileId !== undefined;
};
