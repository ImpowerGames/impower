const normalize = (str: string): string => {
  if (!str) {
    return str;
  }
  return str.toLowerCase().replace(/[#,]/g, "").trim();
};

export default normalize;
