const getCssChildLayout = (value: string): string => {
  if (value === "") {
    return "row";
  }
  return value;
};

export default getCssChildLayout;
