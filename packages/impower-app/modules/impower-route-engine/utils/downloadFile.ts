export const downloadFile = (
  filename: string,
  type: string,
  ...blobParts: BlobPart[]
): void => {
  // file object
  const file = new Blob(blobParts, { type });
  // anchor link
  const element = document.createElement("a");
  element.href = URL.createObjectURL(file);
  element.download = `${filename}`;
  // simulate link click
  document.body.appendChild(element); // Required for this to work in FireFox
  element.click();
};
