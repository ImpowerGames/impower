export interface MovieSource {
  src: string;
  fileSrc: string;
  loop: boolean;
  muted: boolean;
  preview?: boolean;
}

export const createMovieElement = (
  doc: Document,
  video: MovieSource,
): HTMLVideoElement => {
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
  videoEl.crossOrigin = "anonymous";
  videoEl.setAttribute("src", video.src);
  return videoEl;
};

export const createVideoElement = (
  parent: HTMLElement,
  property: string,
  background: string,
  imageNames: string,
  video: MovieSource,
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
  const videoEl = createMovieElement(doc, video);
  videoEl.style.setProperty("position", "absolute");
  videoEl.style.setProperty("top", "0");
  videoEl.style.setProperty("left", "50%");
  videoEl.style.setProperty("height", "100%");
  videoEl.style.setProperty("transform", "translateX(-50%)");
  el.appendChild(videoEl);
  parent.appendChild(el);
  return el;
};

export const createCutsceneElement = (
  parent: HTMLElement,
  video: MovieSource,
): HTMLElement => {
  const doc = parent.ownerDocument;
  const el = doc.createElement("div");
  el.className = "cutscene";
  const videoEl = createMovieElement(doc, video);
  videoEl.classList.add("cutscene_video");
  el.appendChild(videoEl);
  parent.appendChild(el);
  return el;
};
