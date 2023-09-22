import getTextBuffer from "./getTextBuffer";

const createTextFile = (name: string, content: string) => {
  const blob = new File([getTextBuffer(content)], name, {
    type: "text/plain",
  });
  return blob;
};

export default createTextFile;
