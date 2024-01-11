const getCommandIndexAtLine = (
  line: number,
  commands: { source: { line: number } }[] | undefined
): number => {
  if (!commands) {
    return -1;
  }
  let commandIndex = 0;
  for (let i = 1; i < commands.length || 0; i += 1) {
    const command = commands[i];
    if (command && command.source.line > line) {
      return commandIndex;
    } else {
      commandIndex = i;
    }
  }
  return commandIndex;
};

export default getCommandIndexAtLine;
