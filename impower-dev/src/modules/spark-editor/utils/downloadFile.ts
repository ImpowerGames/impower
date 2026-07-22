export const downloadFile = (
  filename: string,
  type: string,
  ...blobParts: BlobPart[]
): void => {
  // file object
  const file = new Blob(blobParts, { type });
  const url = URL.createObjectURL(file);
  // anchor link
  const element = document.createElement("a");
  element.href = url;
  element.download = `${filename}`;
  // simulate link click
  document.body.appendChild(element); // Required for this to work in FireFox
  element.click();
  // Tidy up once the download has kicked off — revoke the object URL (otherwise
  // the blob is pinned in memory for the page's lifetime, which adds up for large
  // assets) and drop the throwaway anchor.
  setTimeout(() => {
    element.remove();
    URL.revokeObjectURL(url);
  }, 0);
};
