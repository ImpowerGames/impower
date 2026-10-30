export const downloadFile = (
  filename: string,
  type: string,
  ...blobParts: BlobPart[]
): void => {
  const file = new Blob(blobParts, { type });
  const url = URL.createObjectURL(file);
  const element = document.createElement("a");
  element.href = url;
  element.download = `${filename}`;
  document.body.appendChild(element);
  element.click();
  setTimeout(() => {
    element.remove();
    URL.revokeObjectURL(url);
  }, 0);
};
