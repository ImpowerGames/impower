import { InstanceData } from "../../data";
import { InstanceRunner } from "../../project/classes/instance/instanceRunner";

export const getNextJumpIndex = <
  D extends InstanceData,
  R extends InstanceRunner<D>
>(
  validJumps: { refTypeId: string; indexOffset: number }[],
  index: number,
  iterableRunners: { runner: R; data: D; level: number }[]
): number => {
  let nextCommandIndex: number | undefined;
  const currentLevel = iterableRunners[index].level;
  if (validJumps.length > 0) {
    // Skip to the next instance that matches any of the specified jump points
    for (let i = index + 1; i < iterableRunners.length; i += 1) {
      const c = iterableRunners[i];
      if (c.level < currentLevel) {
        break;
      }
      if (c.level === currentLevel) {
        const { refTypeId } = c.data.reference;
        const nextJump = validJumps.find(
          (next) => next.refTypeId === refTypeId
        );
        if (nextJump) {
          nextCommandIndex = i + nextJump.indexOffset;
          break;
        }
      }
    }
  }
  return nextCommandIndex !== undefined
    ? nextCommandIndex
    : iterableRunners.length;
};
