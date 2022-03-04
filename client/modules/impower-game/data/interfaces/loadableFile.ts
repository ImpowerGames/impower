import { ImpowerGame } from "../../game/classes/impowerGame";
import { VariableValue } from "../../project/classes/instances/items/variable/variableValue";

export interface LoadableFile<T> {
  getFileId(
    data: T,
    variables: { [id: string]: VariableValue },
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
