const createZipFile = (name: string, content: ArrayBuffer) => {
  const blob = new File([content], name, {
    type: "application/zip",
  });
  return blob;
};

export default createZipFile;
