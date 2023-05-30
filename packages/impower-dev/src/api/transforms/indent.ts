const indent = (str: string, amount: number) => {
  const indent = " ".repeat(amount);
  return indent + str.replaceAll("\n", `\n${indent}`);
};

export default indent;
