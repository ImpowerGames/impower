import { useEffect, useState } from "preact/hooks";

export type TextPreviewProps = {
  src: string;
};

/**
 * Text-file preview: fetches the file's text and renders it in a scrollable
 * `<pre>`. (The old engine used `<object data=… type="text/plain">`, but Chrome
 * doesn't reliably render text/plain in an `<object>` — it shows a blank box —
 * so we fetch + render the text ourselves.) The body is selectable so the
 * content can be read/copied, even though the surrounding chrome is not.
 */
export default function TextPreview({ src }: TextPreviewProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(false);
    fetch(src)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) {
          setText(t);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return <div class="m-auto text-sm text-white/50">Can't preview this file.</div>;
  }
  if (text == null) {
    return <div class="m-auto text-sm text-white/50">Loading…</div>;
  }
  return (
    <pre class="size-full select-text overflow-auto whitespace-pre-wrap break-words rounded bg-white p-4 font-mono text-sm text-black">
      {text}
    </pre>
  );
}
