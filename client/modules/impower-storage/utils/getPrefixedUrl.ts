export const getPrefixedUrl = (
  fileUrl: string,
  fileDirPrefix: string,
  fileNamePrefix: string
): string => {
  if (!fileUrl) {
    return fileUrl;
  }
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
  const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const validFileDirPrefix = fileDirPrefix
    ? encodeURIComponent(fileDirPrefix)
    : "";
  const validFileNamePrefix = fileNamePrefix
    ? encodeURIComponent(fileNamePrefix)
    : "";
  return `https://firebasestorage.googleapis.com/v0/b/${firebaseProjectId}.appspot.com/o/${validFileDirPrefix}${fileDir}%2F${validFileNamePrefix}${fileName}?alt=media${tokenQuery}${token}`;
};
