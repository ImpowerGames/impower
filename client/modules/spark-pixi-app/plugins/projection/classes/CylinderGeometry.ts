import { MeshGeometry3D, Vec3 } from "pixi3d/pixi7";

export interface CylinderGeometryOptions {
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radialSegments?: number;
  heightSegments?: number;
  openEnded?: boolean;
  thetaStart?: number;
  thetaLength?: number;
}

export class CylinderGeometry {
  static create(options: CylinderGeometryOptions = {}): MeshGeometry3D {
    // Based on https://github.com/mrdoob/three.js/blob/master/src/geometries/CylinderGeometry.js

    const radiusTop = options?.radiusTop ?? 1;
    const radiusBottom = options?.radiusBottom ?? 1;
    const height = options?.height ?? 1;
    const radialSegments = Math.floor(options?.radialSegments ?? 32);
    const heightSegments = Math.floor(options?.heightSegments ?? 1);
    const openEnded = options?.openEnded ?? false;
    const thetaStart = options?.thetaStart ?? 0;
    const thetaLength = options?.thetaLength ?? Math.PI * 2;

    // buffers
    const indices = [];
    const positions = [];
    const uvs = [];
    const normals = [];

    // helper variables
    let index = 0;
    const indexArray = [];
    const halfHeight = height / 2;

    const generateTorso = (): void => {
      // this will be used to calculate the normal
      const slope = (radiusBottom - radiusTop) / height;

      // generate vertices, normals and uvs
      for (let y = 0; y <= heightSegments; y += 1) {
        const indexRow = [];

        const v = y / heightSegments;

        // calculate the radius of the current row
        const radius = v * (radiusBottom - radiusTop) + radiusTop;

        for (let x = 0; x <= radialSegments; x += 1) {
          const u = x / radialSegments;

          const theta = u * thetaLength + thetaStart;

          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);

          // vertex
          const vertexX = radius * sinTheta;
          const vertexY = -v * height + halfHeight;
          const vertexZ = radius * cosTheta;
          positions.push(vertexX, vertexY, vertexZ);

          // normal
          const normalX = sinTheta;
          const normalY = slope;
          const normalZ = cosTheta;
          const normal = Vec3.normalize(
            Vec3.fromValues(normalX, normalY, normalZ)
          );
          normals.push(normal[0], normal[1], normal[2]);

          // uv

          uvs.push(u, 1 - v);

          // save index of vertex in respective row
          indexRow.push(index);
          index += 1;
        }

        // now save vertices of the row in our index array
        indexArray.push(indexRow);
      }

      // generate indices
      for (let x = 0; x < radialSegments; x += 1) {
        for (let y = 0; y < heightSegments; y += 1) {
          // we use the index array to access the correct indices
          const a = indexArray[y][x];
          const b = indexArray[y + 1][x];
          const c = indexArray[y + 1][x + 1];
          const d = indexArray[y][x + 1];
          // faces
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }
    };

    const generateCap = (top: boolean): void => {
      // save the index of the first center vertex
      const centerIndexStart = index;

      const radius = top === true ? radiusTop : radiusBottom;
      const sign = top === true ? 1 : -1;

      // first we generate the center vertex data of the cap.
      // because the geometry needs one set of uvs per face,
      // we must generate a center vertex per face/segment

      for (let x = 1; x <= radialSegments; x += 1) {
        // vertex
        positions.push(0, halfHeight * sign, 0);

        // normal
        normals.push(0, sign, 0);

        // uv
        uvs.push(0.5, 0.5);

        // increase index
        index += 1;
      }

      // save the index of the last center vertex
      const centerIndexEnd = index;

      // now we generate the surrounding vertices, normals and uvs
      for (let x = 0; x <= radialSegments; x += 1) {
        const u = x / radialSegments;
        const theta = u * thetaLength + thetaStart;

        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        // vertex
        const vertexX = radius * sinTheta;
        const vertexY = halfHeight * sign;
        const vertexZ = radius * cosTheta;
        positions.push(vertexX, vertexY, vertexZ);

        // normal
        normals.push(0, sign, 0);

        // uv
        const uvX = cosTheta * 0.5 + 0.5;
        const uvY = sinTheta * 0.5 * sign + 0.5;
        uvs.push(uvX, uvY);

        // increase index
        index += 1;
      }

      // generate indices
      for (let x = 0; x < radialSegments; x += 1) {
        const c = centerIndexStart + x;
        const i = centerIndexEnd + x;
        if (top === true) {
          // face top
          indices.push(i, i + 1, c);
        } else {
          // face bottom
          indices.push(i + 1, i, c);
        }
      }
    };

    // generate geometry
    generateTorso();
    if (openEnded === false) {
      if (radiusTop > 0) generateCap(true);
      if (radiusBottom > 0) generateCap(false);
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
