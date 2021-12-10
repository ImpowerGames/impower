export const getPrefixedUrl = (
  fileUrl: string,
  fileDirPrefix: string,
  fileNamePrefix: string
): string => {
  if (!fileUrl) {
    return fileUrl;
  }
  const baseUrl = fileUrl.split("/").slice(0, -1).join("/");
  const tokenQuery = "&token=";
  const tokenQueryIndex = fileUrl.indexOf(tokenQuery);
  if (tokenQueryIndex < 0) {
    return undefined;
  }
  const token = fileUrl.slice(tokenQueryIndex + tokenQuery.length);
  const objectId = fileUrl.substring(
    fileUrl.lastIndexOf("/") + 1,
    fileUrl.lastIndexOf("?")
  );
  const folderEndSlashIndex = objectId.lastIndexOf("%2F");
  const fileDir = objectId.substring(0, folderEndSlashIndex);
  const fileName = objectId.substring(folderEndSlashIndex + 3);
  const validFileDirPrefix = fileDirPrefix
    ? encodeURIComponent(fileDirPrefix)
    : "";
  const validFileNamePrefix = fileNamePrefix
    ? encodeURIComponent(fileNamePrefix)
    : "";
  return `${baseUrl}/${validFileDirPrefix}${fileDir}%2F${validFileNamePrefix}${fileName}?alt=media&v=${token}`;
};
