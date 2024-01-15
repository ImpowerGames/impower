import { CommandData } from "./CommandData";

export interface ICommandRunner<D extends CommandData = CommandData> {
  onInit: () => void;
  onUpdate: (deltaMS: number) => void;
  onDestroy: () => void;

  willSaveCheckpoint: (command: D) => boolean;
  onExecute: (command: D) => number[];
  isFinished: (command: D) => boolean;
  onFinished: (command: D) => void;
  onPreview: (command: D) => void;
}
