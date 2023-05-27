export const getAbsoluteUrl = (
  relativeUrl: string,
  version?: string
): string => {
  if (!relativeUrl?.startsWith("/")) {
    return relativeUrl;
  }
  let objectId = relativeUrl;
  objectId = objectId.substring(1);
  objectId = encodeURIComponent(objectId);
  let versionQuery = "";
  if (version) {
    versionQuery = `&v=${version}`;
  }
  const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return `https://firebasestorage.googleapis.com/v0/b/${firebaseProjectId}.appspot.com/o/${objectId}?alt=media${versionQuery}`;
};
