const getDialogueCharacterKey = (name: string) => {
  return name
    .replace(/([ ])/g, "_")
    .replace(/([.'"`])/g, "")
    .toLowerCase();
};

export default getDialogueCharacterKey;
