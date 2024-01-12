export const getNextJumpIndex = <
  D extends { indent: number; params: Record<string, unknown> }
>(
  index: number,
  commands: D[],
  validJumps: {
    check: (c: "if" | "elseif" | "else" | "end") => boolean;
    offset: number;
  }[] = []
): number => {
  const currentLevel = commands[index]?.indent || 0;
  if (validJumps?.length > 0) {
    // Skip to the next instance that matches any of the specified jump points
    for (let i = index + 1; i < commands.length; i += 1) {
      const c = commands[i];
      if (c) {
        if (c.indent < currentLevel) {
          break;
        }
        if (c.indent === currentLevel) {
          const check = c?.params?.["check"] as
            | "if"
            | "elseif"
            | "else"
            | "end";
          const nextJump = validJumps.find((next) => next.check(check));
          if (nextJump) {
            return i + nextJump.offset;
          }
        }
      }
    }
  }
  // Skip to command after next end
  for (let i = index + 1; i < commands.length; i += 1) {
    const c = commands[i];
    if (c) {
      if (c.indent < currentLevel) {
        break;
      }
      if (c.indent === currentLevel) {
        const check = c?.params?.["check"] as "if" | "elseif" | "else" | "end";
        if (check === "end") {
          return i + 1;
        }
      }
    }
  }
  return commands.length;
};
