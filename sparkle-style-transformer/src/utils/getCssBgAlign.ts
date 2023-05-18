const getCssBgAlign = (value: string): string => {
  if (value === "") {
    return "center";
  }
  return value;
};

export default getCssBgAlign;
