import ListRow from "../../../packages/impower-ui/src/components/list-row/ListRow";
import VirtualList from "../../../packages/impower-ui/src/components/virtual-list/VirtualList";
import { render } from "preact";
import { useState } from "preact/hooks";
import { useLayout } from "../../../packages/impower-ui/src/hooks/useLayout";
import { OUTLINE_RAIL_ROW, railRowAfter, railRowExtent } from "../../src/modules/spark-editor/components/outline/railLayout";

type Row = { key: string; depth: number; label: string; scene: number };

const SCENES = 30;

const build = (folded: ReadonlySet<number>): Row[] =>
  Array.from({ length: SCENES }, (_, scene) => {
    const head: Row = { key: `s${scene}`, depth: 0, label: `scene_${scene}`, scene };
    if (folded.has(scene)) {
      return [head];
    }
    const branch: Row = { key: `b${scene}`, depth: 1, label: `branch_${scene}`, scene };
    const inner: Row = { key: `c${scene}`, depth: 2, label: `choose_${scene}`, scene };
    const tail: Row = { key: `t${scene}`, depth: 1, label: `then_${scene}`, scene };
    return scene % 3 === 0 ? [head, branch, inner, tail] : scene % 3 === 1 ? [head, branch] : [head];
  }).flat();

declare global {
  interface Window {
    rail: { fold: (scene: number) => void; reveal: (index: number) => void; rows: () => Row[] };
  }
}

function Rail() {
  useLayout();
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());
  const [reveal, setReveal] = useState<{ index: number; request: number }>({ index: -1, request: 0 });
  const rows = build(folded);
  window.rail = {
    fold: (scene) => setFolded((prev) => new Set([...prev, scene])),
    reveal: (index) => setReveal((prev) => ({ index, request: prev.request + 1 })),
    rows: () => rows,
  };
  return (
    <div style="width:231px;height:525px;display:flex;flex-direction:column">
      <VirtualList
        class="flex-1 pr-gutter-3.5 pb-3 pl-[26px]"
        label="Rail"
        size={OUTLINE_RAIL_ROW.size}
        items={rows}
        itemHeight={(_row, index) => railRowExtent(rows, index)}
        revealIndex={reveal.index}
        revealRequest={reveal.request}
        getKey={(row) => row.key}
        renderItem={(row, index) => (
          <ListRow
            size={OUTLINE_RAIL_ROW.size}
            indent={OUTLINE_RAIL_ROW.indent}
            tone={OUTLINE_RAIL_ROW.tone}
            depth={row.depth}
            after={railRowAfter(row, rows[index + 1])}
            label={row.label}
            onClick={() => {}}
          />
        )}
      />
    </div>
  );
}

render(<Rail />, document.body.appendChild(document.createElement("div")));
