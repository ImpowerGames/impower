export const getClientCompletionValidFor = (
  triggerCharacters: string[] | undefined
) => {
  const chars = triggerCharacters ? triggerCharacters.join("") : "";
  return new RegExp(`[^${chars}]*$`);
};
