import { PathCommand } from "./interpolatePath";

export const isRelativePathCommand = (command: PathCommand): boolean => {
  return command.type === command.type.toLowerCase();
};
