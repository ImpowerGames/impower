import { InstanceData } from "../../data";
import { InstanceRunner } from "../../project/classes/instance/instanceRunner";

export const getNextJumpIndex = <
  D extends InstanceData,
  R extends InstanceRunner<D>
>(
  validJumps: {
    check: (c: "if" | "elif" | "else" | "close") => boolean;
    offset: number;
  }[],
  index: number,
  iterableRunners: { runner: R; data: D }[]
): number => {
  let nextCommandIndex: number | undefined;
  const currentLevel = iterableRunners[index].data.indent;
  if (validJumps.length > 0) {
    // Skip to the next instance that matches any of the specified jump points
    for (let i = index + 1; i < iterableRunners.length; i += 1) {
      const c = iterableRunners[i];
      if (c.data.indent < currentLevel) {
        break;
      }
      if (c.data.indent === currentLevel) {
        const check = c?.data?.check as "if" | "elif" | "else" | "close";
        const nextJump = validJumps.find((next) => next.check(check));
        if (nextJump) {
          nextCommandIndex = i + nextJump.offset;
          break;
        }
      }
    }
  }
  return nextCommandIndex !== undefined
    ? nextCommandIndex
    : iterableRunners.length;
};
