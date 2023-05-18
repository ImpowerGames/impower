const getCssBgFit = (value: string): string => {
  if (value === "") {
    return "contain";
  }
  return value;
};

export default getCssBgFit;
