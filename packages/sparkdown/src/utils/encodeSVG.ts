const encodeSVG = (svg: string) => {
  return svg
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/{/g, "%7B")
    .replace(/}/g, "%7D")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ");
};

export default encodeSVG;
