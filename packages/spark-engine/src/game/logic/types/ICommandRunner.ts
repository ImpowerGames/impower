import { CommandData } from "./CommandData";

export interface ICommandRunner<D extends CommandData = CommandData> {
  onInit: () => void;
  onUpdate: (deltaMS: number) => void;
  onDestroy: () => void;

  onExecute: (command: D) => number[];
  isFinished: (command: D) => boolean | null;
  onFinished: (command: D) => void;
  onPreview: (command: D) => void;
}
