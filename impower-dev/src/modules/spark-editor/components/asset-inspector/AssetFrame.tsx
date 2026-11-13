import { Lightbox, Thumbnail, ZoomFrame } from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";
import type { InspectedAsset } from "../../utils/assetDetails";
import SoundFrame from "./SoundFrame";

const SPECIMEN = "The quick brown fox jumps over the lazy dog";

let fonts = 0;
const loadedFaces = new Map<string, Promise<string>>();

const loadFace = (src: string): Promise<string> => {
  let loading = loadedFaces.get(src);
  if (!loading) {
    const family = `inspected-font-${(fonts += 1)}`;
    loading = new FontFace(family, `url("${src}")`).load().then(
      (face) => {
        document.fonts.add(face);
        return family;
      },
      (error: unknown) => {
        loadedFaces.delete(src);
        throw error;
      },
    );
    loadedFaces.set(src, loading);
  }
  return loading;
};

type FontFamily = { family: string } | { failed: true } | null;

function useFontFamily(src: string | undefined): FontFamily {
  const [loaded, setLoaded] = useState<FontFamily>(null);
  useEffect(() => {
    setLoaded(null);
    if (!src || typeof FontFace === "undefined" || typeof document === "undefined") {
      setLoaded(src ? null : { failed: true });
      return;
    }
    let alive = true;
    loadFace(src).then(
      (family) => alive && setLoaded({ family }),
      () => alive && setLoaded({ failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [src]);
  return loaded;
}

function FontSpecimen({ asset }: { asset: InspectedAsset }) {
  const loaded = useFontFamily(asset.src);
  return (
    <ZoomFrame label={`${asset.name} specimen`} surface="sheet">
      <div
        class="absolute inset-0 flex flex-col gap-2 overflow-hidden p-4 text-ink opacity-0 data-[ready]:opacity-100 motion-safe:transition-opacity motion-safe:duration-200"
        data-ready={loaded ? "" : undefined}
        data-font-specimen
      >
        <p class="m-0 text-[12px]/[1.4] text-muted">{asset.name}</p>
        {loaded && "failed" in loaded ? (
          <p class="m-0 text-[13px]/[1.5] text-muted" data-font-failed>
            This font could not be read, so it cannot be shown here.
          </p>
        ) : (
          <div
            class="flex min-w-0 flex-col gap-2 font-(family-name:--specimen-font) [&>p]:m-0 [&>p]:fade-edge"
            style={{ "--specimen-font": loaded ? `"${loaded.family}"` : "inherit" }}
          >
            <p class="text-[28px]/[1.2]">{SPECIMEN}</p>
            <p class="text-[18px]/[1.3]">{SPECIMEN}</p>
            <p class="text-[13px]/[1.4]">{SPECIMEN}</p>
          </div>
        )}
      </div>
    </ZoomFrame>
  );
}

function TextContents({ asset, read }: { asset: InspectedAsset; read: (path: string) => Promise<string> }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setText(null);
    read(asset.path).then(
      (body) => alive && setText(body),
      () => alive && setText("This file could not be read."),
    );
    return () => {
      alive = false;
    };
  }, [asset.path, asset.src]);
  return (
    <ZoomFrame label={`${asset.name} contents`} surface="sheet">
      <pre
        tabIndex={0}
        aria-label={`Contents of ${asset.name}`}
        class="absolute inset-0 m-0 overflow-auto p-3.5 font-mono text-[13px]/[1.5] whitespace-pre-wrap text-ink select-text [overflow-wrap:anywhere]"
        data-text-contents
      >
        {text ?? ""}
      </pre>
    </ZoomFrame>
  );
}

function FrameFailure({ children }: { children: string }) {
  return (
    <p
      class="absolute inset-x-0 bottom-0 m-0 p-4 text-center text-[13px]/[1.5] text-muted"
      role="status"
      data-frame-failed
    >
      {children}
    </p>
  );
}

function VideoFrame({ asset, onSeconds }: { asset: InspectedAsset; onSeconds: (seconds: number) => void }) {
  const [ratio, setRatio] = useState<number | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  return (
    <ZoomFrame label={asset.name} ratio={ratio}>
      {failed ? (
        <FrameFailure>This video could not be played here.</FrameFailure>
      ) : (
        <video
          src={asset.src}
          controls
          playsInline
          preload="metadata"
          class="absolute inset-0 size-full object-contain"
          onError={() => setFailed(true)}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget as HTMLVideoElement;
            if (video.videoWidth && video.videoHeight) {
              setRatio(video.videoWidth / video.videoHeight);
            }
            onSeconds(video.duration);
          }}
        />
      )}
    </ZoomFrame>
  );
}

function PictureFrame({
  asset,
  pixels,
  picture,
  onFull,
}: {
  asset: InspectedAsset;
  pixels?: { width: number; height: number } | null;
  picture?: string | null;
  onFull?: (open: boolean) => void;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string | undefined>(undefined);
  const [full, setFull] = useState(false);
  const src = picture === undefined ? asset.src : picture;
  const failed = picture === null || (!!src && brokenSrc === src);
  const ratio = pixels ? pixels.width / pixels.height : undefined;
  const view = (open: boolean) => {
    setFull(open);
    onFull?.(open);
  };
  const image = () =>
    src ? (
      <div class="absolute inset-0" onErrorCapture={() => setBrokenSrc(src)}>
        <Thumbnail size="fill" fit="contain" src={src} class="bg-transparent" />
      </div>
    ) : null;
  return (
    <>
      <ZoomFrame
        label={asset.name}
        zoomable={!failed}
        backdrop={failed ? "none" : "checker"}
        ratio={ratio}
        onExpand={failed || !src ? undefined : () => view(true)}
      >
        {image()}
        {failed && <FrameFailure>This picture could not be shown.</FrameFailure>}
      </ZoomFrame>
      <Lightbox label={`${asset.name} full size`} open={full && !failed} onOpenChange={view}>
        <ZoomFrame label={asset.name} fit="screen" zoomable backdrop="checker" ratio={ratio}>
          {image()}
        </ZoomFrame>
      </Lightbox>
    </>
  );
}

export type AssetFrameProps = {
  asset: InspectedAsset;
  pixels?: { width: number; height: number } | null;
  picture?: string | null;
  read: (path: string) => Promise<string>;
  onSeconds: (seconds: number) => void;
  onFull?: (open: boolean) => void;
};

export default function AssetFrame({ asset, pixels, picture, read, onSeconds, onFull }: AssetFrameProps) {
  if (asset.type === "image") {
    return <PictureFrame asset={asset} pixels={pixels} picture={picture} onFull={onFull} />;
  }
  if (asset.type === "video") {
    return <VideoFrame asset={asset} onSeconds={onSeconds} />;
  }
  if (asset.type === "audio") {
    return <SoundFrame asset={asset} />;
  }
  if (asset.type === "font") {
    return <FontSpecimen asset={asset} />;
  }
  if (asset.type === "text" && !asset.link) {
    return <TextContents asset={asset} read={read} />;
  }
  return null;
}
