import { InstanceData } from "../../data";
import { InstanceRunner } from "../../project/classes/instance/InstanceRunner";

export const getNextJumpIndex = <
  D extends InstanceData,
  R extends InstanceRunner<D>
>(
  index: number,
  iterableRunners: { runner: R; data: D }[],
  validJumps: {
    check: (c: "if" | "elif" | "else" | "close") => boolean;
    offset: number;
  }[] = []
): number => {
  const currentLevel = iterableRunners[index]?.data.indent || 0;
  if (validJumps?.length > 0) {
    // Skip to the next instance that matches any of the specified jump points
    for (let i = index + 1; i < iterableRunners.length; i += 1) {
      const c = iterableRunners[i];
      if (c) {
        if (c.data.indent < currentLevel) {
          break;
        }
        if (c.data.indent === currentLevel) {
          const check = c?.data?.["check"] as "if" | "elif" | "else" | "close";
          const nextJump = validJumps.find((next) => next.check(check));
          if (nextJump) {
            return i + nextJump.offset;
          }
        }
      }
    }
  }
  // Skip to command after next close
  for (let i = index + 1; i < iterableRunners.length; i += 1) {
    const c = iterableRunners[i];
    if (c) {
      if (c.data.indent < currentLevel) {
        break;
      }
      if (c.data.indent === currentLevel) {
        const check = c?.data?.["check"] as "if" | "elif" | "else" | "close";
        if (check === "close") {
          return i + 1;
        }
      }
    }
  }
  return iterableRunners.length;
};
