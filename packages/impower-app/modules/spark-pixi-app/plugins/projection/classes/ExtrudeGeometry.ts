import { MeshGeometry3D } from "pixi3d/pixi7";
import { flattenCurve, getCurves, Point } from "../../path";
import { triangulate } from "../utils/triangulate";

const DEFAULT_SHAPE =
  "M 0 0 C 0.4 0.3 0.6 0.3 1 0 C 0.7 0.4 0.7 0.6 1 1 C 0.6 0.7 0.4 0.7 0 1 C 0.3 0.6 0.3 0.4 0 0";

export interface UVGenerator {
  generateTopUV: (
    vertices: number[],
    indexA: number,
    indexB: number,
    indexC: number
  ) => Point[];
  generateSideWallUV: (
    vertices: number[],
    indexA: number,
    indexB: number,
    indexC: number,
    indexD: number
  ) => Point[];
}

const WorldUVGenerator: UVGenerator = {
  generateTopUV(vertices, indexA, indexB, indexC): Point[] {
    const a_x = vertices[indexA * 3];
    const a_y = vertices[indexA * 3 + 1];
    const b_x = vertices[indexB * 3];
    const b_y = vertices[indexB * 3 + 1];
    const c_x = vertices[indexC * 3];
    const c_y = vertices[indexC * 3 + 1];

    return [
      [a_x, a_y],
      [b_x, b_y],
      [c_x, c_y],
    ];
  },

  generateSideWallUV(vertices, indexA, indexB, indexC, indexD): Point[] {
    const a_x = vertices[indexA * 3];
    const a_y = vertices[indexA * 3 + 1];
    const a_z = vertices[indexA * 3 + 2];
    const b_x = vertices[indexB * 3];
    const b_y = vertices[indexB * 3 + 1];
    const b_z = vertices[indexB * 3 + 2];
    const c_x = vertices[indexC * 3];
    const c_y = vertices[indexC * 3 + 1];
    const c_z = vertices[indexC * 3 + 2];
    const d_x = vertices[indexD * 3];
    const d_y = vertices[indexD * 3 + 1];
    const d_z = vertices[indexD * 3 + 2];

    if (Math.abs(a_y - b_y) < Math.abs(a_x - b_x)) {
      return [
        [a_x, 1 - a_z],
        [b_x, 1 - b_z],
        [c_x, 1 - c_z],
        [d_x, 1 - d_z],
      ];
    }
    return [
      [a_y, 1 - a_z],
      [b_y, 1 - b_z],
      [c_y, 1 - c_z],
      [d_y, 1 - d_z],
    ];
  },
};

const removeDupEndPts = (points: Point[]): void => {
  const l = points.length;
  const [px, py] = points[l - 1];
  const [qx, qy] = points[0];
  if (l > 2 && px === qx && py === qy) {
    points.pop();
  }
};

const addContour = (vertices: number[], contour: Point[]): void => {
  for (let i = 0; i < contour.length; i += 1) {
    const [x, y] = contour[i];
    vertices.push(x);
    vertices.push(y);
  }
};

// calculate area of the contour polygon

const area = (contour: Point[]): number => {
  const n = contour.length;
  let a = 0.0;
  for (let p = n - 1, q = 0; q < n; p = q, q += 1) {
    const [px, py] = contour[p];
    const [qx, qy] = contour[q];
    a += px * qy - qx * py;
  }
  return a * 0.5;
};

const isClockWise = (pts: Point[]): boolean => {
  return area(pts) < 0;
};

const triangulateShape = (contour: Point[]): [number, number, number][] => {
  const vertices = []; // flat array of vertices like [ x0,y0, x1,y1, x2,y2, ... ]
  const faces = []; // final array of vertex indices like [ [ a,b,d ], [ b,c,d ] ]
  removeDupEndPts(contour);
  addContour(vertices, contour);
  const triangles = triangulate(vertices);
  for (let i = 0; i < triangles.length; i += 3) {
    faces.push(triangles.slice(i, i + 3));
  }
  return faces;
};

export interface ExtrudeGeometryOptions {
  path?: string;
  tolerance?: number;
  distance?: number;
  steps?: number;
  depth?: number;
  beveled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  UVGenerator?: UVGenerator;
}

export class ExtrudeGeometry {
  static create(options: ExtrudeGeometryOptions = {}): MeshGeometry3D {
    const tolerance = options.tolerance;
    const distance = options.distance;
    const steps = options.steps !== undefined ? options.steps : 1;
    const depth = options.depth !== undefined ? options.depth : 1;

    const beveled = options.beveled !== undefined ? options.beveled : true;
    let bevelThickness =
      options.bevelThickness !== undefined ? options.bevelThickness : 0.2;
    let bevelSize =
      options.bevelSize !== undefined
        ? options.bevelSize
        : bevelThickness - 0.1;
    let bevelOffset =
      options.bevelOffset !== undefined ? options.bevelOffset : 0;
    let bevelSegments =
      options.bevelSegments !== undefined ? options.bevelSegments : 3;

    const uvgen =
      options.UVGenerator !== undefined
        ? options.UVGenerator
        : WorldUVGenerator;

    const shapeCurves = getCurves(options?.path ?? DEFAULT_SHAPE);

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const addShape = (shape: Point[]): void => {
      const placeholder = [];

      // Safeguards if bevels are not enabled
      if (!beveled) {
        bevelSegments = 0;
        bevelThickness = 0;
        bevelSize = 0;
        bevelOffset = 0;
      }

      // Variables initialization

      let points = flattenCurve(shape, tolerance, distance);

      if (!isClockWise(points)) {
        points = points.reverse();
      }

      const faces = triangulateShape(points);

      /* Vertices */
      const contour = points; // vertices has all points but contour has only points of circumference
      const vlen = points.length;
      const flen = faces.length;

      const addVertex = (index: number): void => {
        positions.push(placeholder[index * 3 + 0]);
        positions.push(placeholder[index * 3 + 1]);
        positions.push(placeholder[index * 3 + 2]);
      };

      const addUV = (vec: Point): void => {
        uvs.push(vec[0]);
        uvs.push(vec[1]);
      };

      const v = (x: number, y: number, z: number): void => {
        placeholder.push(x);
        placeholder.push(y);
        placeholder.push(z);
      };

      const f3 = (a: number, b: number, c: number): void => {
        addVertex(a);
        addVertex(b);
        addVertex(c);

        const nextIndex = positions.length / 3;
        const uvs = uvgen.generateTopUV(
          positions,
          nextIndex - 3,
          nextIndex - 2,
          nextIndex - 1
        );

        addUV(uvs[0]);
        addUV(uvs[1]);
        addUV(uvs[2]);
      };

      const f4 = (a: number, b: number, c: number, d: number): void => {
        addVertex(a);
        addVertex(b);
        addVertex(d);

        addVertex(b);
        addVertex(c);
        addVertex(d);

        const nextIndex = positions.length / 3;
        const uvs = uvgen.generateSideWallUV(
          positions,
          nextIndex - 6,
          nextIndex - 3,
          nextIndex - 2,
          nextIndex - 1
        );

        addUV(uvs[0]);
        addUV(uvs[1]);
        addUV(uvs[3]);

        addUV(uvs[1]);
        addUV(uvs[2]);
        addUV(uvs[3]);
      };

      const buildLidFaces = (): void => {
        if (beveled) {
          let layer = 0; // steps + 1
          let offset = vlen * layer;

          // Bottom faces

          for (let i = 0; i < flen; i += 1) {
            const face = faces[i];
            f3(face[2] + offset, face[1] + offset, face[0] + offset);
          }

          layer = steps + bevelSegments * 2;
          offset = vlen * layer;

          // Top faces

          for (let i = 0; i < flen; i += 1) {
            const face = faces[i];
            f3(face[0] + offset, face[1] + offset, face[2] + offset);
          }
        } else {
          // Bottom faces

          for (let i = 0; i < flen; i += 1) {
            const face = faces[i];
            f3(face[2], face[1], face[0]);
          }

          // Top faces

          for (let i = 0; i < flen; i += 1) {
            const face = faces[i];
            f3(
              face[0] + vlen * steps,
              face[1] + vlen * steps,
              face[2] + vlen * steps
            );
          }
        }
      };

      const sidewalls = (contour, layeroffset): void => {
        let i = contour.length;

        while (i - 1 >= 0) {
          i -= 1;
          const j = i;
          let k = i - 1;
          if (k < 0) k = contour.length - 1;

          // console.log('b', i,j, i-1, k,vertices.length);

          for (let s = 0, sl = steps + bevelSegments * 2; s < sl; s += 1) {
            const slen1 = vlen * s;
            const slen2 = vlen * (s + 1);

            const a = layeroffset + j + slen1;
            const b = layeroffset + k + slen1;
            const c = layeroffset + k + slen2;
            const d = layeroffset + j + slen2;

            f4(a, b, c, d);
          }
        }
      };

      // Create faces for the z-sides of the shape

      const buildSideFaces = (): void => {
        let layeroffset = 0;
        sidewalls(contour, layeroffset);
        layeroffset += contour.length;
      };

      const scalePt2 = (pt, vec, size): Point => {
        if (!vec) console.error("THREE.ExtrudeGeometry: vec does not exist");

        return vec.clone().multiplyScalar(size).add(pt);
      };

      // Find directions for point movement

      const getBevelVec = (inPt, inPrev, inNext): Point => {
        // computes for inPt the corresponding point inPt' on a new contour
        //   shifted by 1 unit (length of normalized vector) to the left
        // if we walk along contour clockwise, this new contour is outside the old one
        //
        // inPt' is the intersection of the two lines parallel to the two
        //  adjacent edges of inPt at a distance of 1 unit on the left side.

        let v_trans_x;
        let v_trans_y;
        let shrink_by; // resulting translation vector for inPt

        // good reading for geometry algorithms (here: line-line intersection)
        // http://geomalgorithms.com/a05-_intersect-1.html

        const v_prev_x = inPt.x - inPrev.x;
        const v_prev_y = inPt.y - inPrev.y;
        const v_next_x = inNext.x - inPt.x;
        const v_next_y = inNext.y - inPt.y;

        const v_prev_lensq = v_prev_x * v_prev_x + v_prev_y * v_prev_y;

        // check for collinear edges
        const collinear0 = v_prev_x * v_next_y - v_prev_y * v_next_x;

        if (Math.abs(collinear0) > Number.EPSILON) {
          // not collinear

          // length of vectors for normalizing

          const v_prev_len = Math.sqrt(v_prev_lensq);
          const v_next_len = Math.sqrt(
            v_next_x * v_next_x + v_next_y * v_next_y
          );

          // shift adjacent points by unit vectors to the left

          const ptPrevShift_x = inPrev.x - v_prev_y / v_prev_len;
          const ptPrevShift_y = inPrev.y + v_prev_x / v_prev_len;

          const ptNextShift_x = inNext.x - v_next_y / v_next_len;
          const ptNextShift_y = inNext.y + v_next_x / v_next_len;

          // scaling factor for v_prev to intersection point

          const sf =
            ((ptNextShift_x - ptPrevShift_x) * v_next_y -
              (ptNextShift_y - ptPrevShift_y) * v_next_x) /
            (v_prev_x * v_next_y - v_prev_y * v_next_x);

          // vector from inPt to intersection point

          v_trans_x = ptPrevShift_x + v_prev_x * sf - inPt.x;
          v_trans_y = ptPrevShift_y + v_prev_y * sf - inPt.y;

          // Don't normalize!, otherwise sharp corners become ugly
          //  but prevent crazy spikes
          const v_trans_lensq = v_trans_x * v_trans_x + v_trans_y * v_trans_y;
          if (v_trans_lensq <= 2) {
            return [v_trans_x, v_trans_y];
          }
          shrink_by = Math.sqrt(v_trans_lensq / 2);
        } else {
          // handle special case of collinear edges

          let direction_eq = false; // assumes: opposite

          if (v_prev_x > Number.EPSILON) {
            if (v_next_x > Number.EPSILON) {
              direction_eq = true;
            }
          } else if (v_prev_x < -Number.EPSILON) {
            if (v_next_x < -Number.EPSILON) {
              direction_eq = true;
            }
          } else if (Math.sign(v_prev_y) === Math.sign(v_next_y)) {
            direction_eq = true;
          }

          if (direction_eq) {
            // console.log("Warning: lines are a straight sequence");
            v_trans_x = -v_prev_y;
            v_trans_y = v_prev_x;
            shrink_by = Math.sqrt(v_prev_lensq);
          } else {
            // console.log("Warning: lines are a straight spike");
            v_trans_x = v_prev_x;
            v_trans_y = v_prev_y;
            shrink_by = Math.sqrt(v_prev_lensq / 2);
          }
        }

        return [v_trans_x / shrink_by, v_trans_y / shrink_by];
      };

      const contourMovements = [];

      for (
        let i = 0, il = contour.length, j = il - 1, k = i + 1;
        i < il;
        i += 1, j += 1, k += 1
      ) {
        if (j === il) j = 0;
        if (k === il) k = 0;

        //  (j)---(i)---(k)
        // console.log('i,j,k', i, j , k)

        contourMovements[i] = getBevelVec(contour[i], contour[j], contour[k]);
      }

      const verticesMovements = contourMovements.concat();

      // Loop bevelSegments, 1 for the front, 1 for the back

      for (let b = 0; b < bevelSegments; b += 1) {
        // for ( b = bevelSegments; b > 0; b -- ) {

        const t = b / bevelSegments;
        const z = bevelThickness * Math.cos((t * Math.PI) / 2);
        const bs = bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset;

        // contract shape

        for (let i = 0, il = contour.length; i < il; i += 1) {
          const vert = scalePt2(contour[i], contourMovements[i], bs);

          v(vert[0], vert[1], -z);
        }
      }

      const bs = bevelSize + bevelOffset;

      // Back facing vertices

      for (let i = 0; i < vlen; i += 1) {
        const vert = beveled
          ? scalePt2(points[i], verticesMovements[i], bs)
          : points[i];
        v(vert[0], vert[1], 0);
      }

      // Add stepped vertices...
      // Including front facing vertices

      for (let s = 1; s <= steps; s += 1) {
        for (let i = 0; i < vlen; i += 1) {
          const vert = beveled
            ? scalePt2(points[i], verticesMovements[i], bs)
            : points[i];
          v(vert[0], vert[1], (depth / steps) * s);
        }
      }

      // Add bevel segments planes

      // for ( b = 1; b <= bevelSegments; b +=1 ) {
      for (let b = bevelSegments - 1; b >= 0; b -= 1) {
        const t = b / bevelSegments;
        const z = bevelThickness * Math.cos((t * Math.PI) / 2);
        const bs = bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset;
        // contract shape
        for (let i = 0, il = contour.length; i < il; i += 1) {
          const vert = scalePt2(contour[i], contourMovements[i], bs);
          v(vert[0], vert[1], depth + z);
        }
      }

      /* Faces */

      // Top and bottom faces

      buildLidFaces();

      // Sides faces

      buildSideFaces();
    };

    for (let i = 0, l = shapeCurves.length; i < l; i += 1) {
      const shape = shapeCurves[i];
      addShape(shape);
    }

    return Object.assign(new MeshGeometry3D(), {
      normals: {
        buffer: new Float32Array(normals),
      },
      uvs: [
        {
          buffer: new Float32Array(uvs),
        },
      ],
      indices: {
        buffer: new Uint16Array(indices),
      },
      positions: {
        buffer: new Float32Array(positions),
      },
    });
  }
}
