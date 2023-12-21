const getCommandIndexAtLine = (
  line: number,
  commands: Record<string, { source: { line: number } }> | undefined
): number => {
  let commandIndex = 0;
  const commandArray = Object.values(commands || {});
  for (let i = 1; i < commandArray?.length || 0; i += 1) {
    const command = commandArray[i];
    if (command && command.source.line > line) {
      return commandIndex;
    } else {
      commandIndex = i;
    }
  }
  return commandIndex;
};

export default getCommandIndexAtLine;
