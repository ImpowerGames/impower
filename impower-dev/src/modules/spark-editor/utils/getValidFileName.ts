const getValidFileName = (fileName: string): string => {
  return fileName.replace(/[^\w\n\r.]/g, "_");
};

export default getValidFileName;
