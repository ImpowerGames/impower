import { PathCommand, PathData } from "../types/Path";

/**
 * Translate all relative commands to absolute commands
 */
export const absolutizePath = (segments: PathCommand[]): PathCommand[] => {
  let cx = 0;
  let cy = 0;
  let subx = 0;
  let suby = 0;
  const out: PathCommand[] = [];
  segments.forEach(({ command, data }) => {
    switch (command) {
      case "M":
        out.push({ command: "M", data: [...data] });
        [cx, cy] = data;
        [subx, suby] = data;
        break;
      case "m":
        cx += data[0];
        cy += data[1];
        out.push({ command: "M", data: [cx, cy] as number[] as PathData });
        subx = cx;
        suby = cy;
        break;
      case "L":
        out.push({ command: "L", data: [...data] });
        [cx, cy] = data;
        break;
      case "l":
        cx += data[0];
        cy += data[1];
        out.push({ command: "L", data: [cx, cy] as number[] as PathData });
        break;
      case "C":
        out.push({ command: "C", data: [...data] });
        cx = data[4];
        cy = data[5];
        break;
      case "c": {
        const newdata = data.map((d, i) =>
          i % 2 ? d + cy : d + cx
        ) as number[] as PathData;
        out.push({ command: "C", data: newdata });
        cx = newdata[4];
        cy = newdata[5];
        break;
      }
      case "Q":
        out.push({ command: "Q", data: [...data] });
        cx = data[2];
        cy = data[3];
        break;
      case "q": {
        const newdata = data.map((d, i) =>
          i % 2 ? d + cy : d + cx
        ) as number[] as PathData;
        out.push({ command: "Q", data: newdata });
        cx = newdata[2];
        cy = newdata[3];
        break;
      }
      case "A":
        out.push({ command: "A", data: [...data] });
        cx = data[5];
        cy = data[6];
        break;
      case "a":
        cx += data[5];
        cy += data[6];
        out.push({
          command: "A",
          data: [data[0], data[1], data[2], data[3], data[4], cx, cy],
        });
        break;
      case "H":
        out.push({ command: "H", data: [...data] });
        cx = data[0];
        break;
      case "h":
        cx += data[0];
        out.push({ command: "H", data: [cx] as number[] as PathData });
        break;
      case "V":
        out.push({ command: "V", data: [...data] });
        cy = data[0];
        break;
      case "v":
        cy += data[0];
        out.push({ command: "V", data: [cy] as number[] as PathData });
        break;
      case "S":
        out.push({ command: "S", data: [...data] });
        cx = data[2];
        cy = data[3];
        break;
      case "s": {
        const newdata = data.map((d, i) =>
          i % 2 ? d + cy : d + cx
        ) as PathData;
        out.push({ command: "S", data: newdata });
        cx = newdata[2];
        cy = newdata[3];
        break;
      }
      case "T":
        out.push({ command: "T", data: [...data] });
        cx = data[0];
        cy = data[1];
        break;
      case "t":
        cx += data[0];
        cy += data[1];
        out.push({ command: "T", data: [cx, cy] as number[] as PathData });
        break;
      case "Z":
      case "z":
        out.push({ command: "Z", data: [] as number[] as PathData });
        cx = subx;
        cy = suby;
        break;
      default:
        break;
    }
  });
  return out;
};
