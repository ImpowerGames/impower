import React from "react";
import { Action, UndoableAction } from "../types/actions";
import { UndoableState } from "../types/state";

export const createUndoableContext = <S, A extends Action>(): React.Context<
  [UndoableState<S>, React.Dispatch<UndoableAction<A>>]
> =>
  React.createContext<[UndoableState<S>, React.Dispatch<UndoableAction<A>>]>(
    undefined
  );
