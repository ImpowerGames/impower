/**
 * The movie counterpart of `createImageElement`: the same `instance` span,
 * holding a `<video class="object" playsinline>` in place of the `img`.
 *
 * `src` is what the element loads (the asset cache's object URL when the file
 * is resident, the file URL otherwise) and `fileSrc` the file URL, kept as
 * `data-src` because the page's asset pins and cache are keyed by it. A
 * preview loads only the metadata, which is enough to show the first frame.
 *
 * The span's background paints an image layer and the builtin `object` style
 * hides the `img`, which only sizes the span. A video paints itself, so the
 * element is made visible and placed as the background is: full height,
 * centered.
 */
export const createVideoElement = (
  parent: HTMLElement,
  property: string,
  background: string,
  imageNames: string,
  video: {
    src: string;
    fileSrc: string;
    loop: boolean;
    muted: boolean;
    preview?: boolean;
  },
  applyStyle: (
    el: HTMLElement,
    style: Record<string, string | number | null>,
  ) => void,
): HTMLElement => {
  const doc = parent.ownerDocument;
  const el = doc.createElement("span");
  el.className = "instance";
  el.setAttribute("image", imageNames);
  applyStyle(el, { [property]: background });
  const videoEl = doc.createElement("video");
  videoEl.className = "object";
  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("data-src", video.fileSrc);
  if (video.preview) {
    videoEl.setAttribute("preload", "metadata");
  }
  videoEl.loop = video.loop;
  videoEl.muted = video.muted;
  if (video.muted) {
    videoEl.setAttribute("muted", "");
  }
  videoEl.style.setProperty("visibility", "visible");
  videoEl.style.setProperty("position", "absolute");
  videoEl.style.setProperty("top", "0");
  videoEl.style.setProperty("left", "50%");
  videoEl.style.setProperty("height", "100%");
  videoEl.style.setProperty("transform", "translateX(-50%)");
  // The page sends a playing movie's sound through its mixers, and a media
  // element source outputs silence for media fetched from another origin
  // without CORS. So the element asks for CORS before it loads anything, as
  // the asset cache's own fetch of the file does; a same-origin file or a
  // `blob:` URL loads as before.
  videoEl.crossOrigin = "anonymous";
  videoEl.setAttribute("src", video.src);
  el.appendChild(videoEl);
  parent.appendChild(el);
  return el;
};
