import { CommandData } from "./CommandData";

export interface ICommandRunner<D extends CommandData = CommandData> {
  onInit: () => void;
  onUpdate: (deltaMS: number) => void;
  onDestroy: () => void;

  isChoicepoint: (command: D) => boolean;
  isSavepoint: (command: D) => boolean;
  onExecute: (command: D) => number[];
  isFinished: (command: D) => boolean | string;
  onFinished: (command: D) => void;
  onPreview: (command: D) => void;
}
