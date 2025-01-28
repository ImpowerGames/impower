const getCssFlex = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true) {
    return "1";
  }
  if (value === false || value === "none") {
    return "0";
  }
  return value;
};

export default getCssFlex;
