export const getPrefixedUrl = (
  fileUrl: string,
  fileNamePrefix: string
): string => {
  if (!fileUrl) {
    return fileUrl;
  }
  const trimmedFileUrl = fileUrl.endsWith("/") ? fileUrl.slice(0, -1) : fileUrl;
  const tokenQuery = "&token=";
  const tokenQueryIndex = trimmedFileUrl.indexOf(tokenQuery);
  if (tokenQueryIndex < 0) {
    return undefined;
  }
  const baseUrl = trimmedFileUrl.split("/").slice(0, -1).join("/");
  const objectId = trimmedFileUrl.split("/").slice(-1).join("");
  const token = trimmedFileUrl.slice(tokenQueryIndex + tokenQuery.length);
  const folderEndSlashIndex = objectId.lastIndexOf("%2F");
  const fileDir = objectId.substring(0, folderEndSlashIndex);
  const fileName = objectId.substring(folderEndSlashIndex + 3);
  const validFileNamePrefix = fileNamePrefix
    ? encodeURIComponent(fileNamePrefix)
    : "";
  return `${baseUrl}/${fileDir}%2F${validFileNamePrefix}${fileName}?alt=media&v=${token}`;
};
