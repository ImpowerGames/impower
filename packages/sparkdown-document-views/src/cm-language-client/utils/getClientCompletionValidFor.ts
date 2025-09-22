export const getClientCompletionValidFor = (
  triggerCharacters: string[] | undefined
) => {
  const chars = triggerCharacters
    ? triggerCharacters.join("").replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
    : "";
  return new RegExp(`^[^${chars}]*$`);
};
