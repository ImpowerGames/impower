const getTextBuffer = (content: string) => {
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(content);
  return encodedText;
};

export default getTextBuffer;
