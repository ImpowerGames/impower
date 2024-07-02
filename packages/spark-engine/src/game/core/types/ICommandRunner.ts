export interface ICommandRunner {
  onInit: () => void;
  onUpdate: (deltaMS: number) => void;
  onDestroy: () => void;

  onExecute: () => boolean;

  isFinished: () => boolean | string;
  onFinished: () => void;

  onPreview: () => void;
}
