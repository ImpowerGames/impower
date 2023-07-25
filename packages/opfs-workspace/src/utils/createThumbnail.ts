const createThumbnail = async (file: File, size = 256) => {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const ratio = Math.max(size / width, size / height);

  const x = (size - width * ratio) / 2;
  const y = (size - height * ratio) / 2;

  if (ctx) {
    ctx.drawImage(
      bitmap,
      0,
      0,
      width,
      height,
      x,
      y,
      width * ratio,
      height * ratio
    );
  }

  return canvas.convertToBlob({ quality: 1, type: "image/webp" });
};

export default createThumbnail;
