import { Dispatch } from "react";
import { ConfirmDialogAction } from "./confirmDialogActions";
import {
  createConfirmDialogState,
  ConfirmDialogState,
} from "./confirmDialogState";

export type ConfirmDialogContextState = [
  ConfirmDialogState,
  Dispatch<ConfirmDialogAction>
];

export const createConfirmDialogContextState =
  (): ConfirmDialogContextState => [
    createConfirmDialogState(),
    (): void => null,
  ];
