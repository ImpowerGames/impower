import { MeshGeometry3D, Vec3 } from "pixi3d/pixi7";

export interface RingGeometryOptions {
  /** The radius of the outside of the circle. Default is 1. */
  outerRadius?: number;
  /** The radius of the inside of the circle. Default is 0.5. */
  innerRadius?: number;
  /** The number of segmented faces around the circumference of the cylinder. A higher number means the ring will be more round. Default is 32. */
  thetaSegments?: number;
  /** Default is 1. */
  phiSegments?: number;
  /** Start angle for first segment, default = 0 (three o'clock position). */
  thetaStart?: number;
  /** The central angle, often called theta, of the circular sector. The default is 2*Pi, which makes for a complete circle. */
  thetaLength?: number;
}

export class RingGeometry {
  static create(options: RingGeometryOptions = {}): MeshGeometry3D {
    // Based on https://github.com/mrdoob/three.js/blob/master/src/geometries/RingGeometry.js

    const outerRadius = options?.outerRadius ?? 1;
    const innerRadius = options?.innerRadius ?? 0.5;
    const thetaSegments = Math.max(3, Math.floor(options?.thetaSegments ?? 32));
    const phiSegments = Math.max(1, Math.floor(options?.phiSegments ?? 32));
    const thetaStart = options?.thetaStart ?? 0;
    const thetaLength = options?.thetaLength ?? Math.PI * 2;

    const indices = [];
    const positions = [];
    const normals = [];
    const uvs = [];

    const vertex = Vec3.create();
    const uv = Vec3.create();

    let radius = innerRadius;
    const radiusStep = (outerRadius - innerRadius) / phiSegments;

    for (let j = 0; j <= phiSegments; j += 1) {
      for (let i = 0; i <= thetaSegments; i += 1) {
        const segment = thetaStart + (i / thetaSegments) * thetaLength;
        vertex[0] = radius * Math.cos(segment);
        vertex[1] = radius * Math.sin(segment);
        positions.push(vertex[0], vertex[1], vertex[2]);
        normals.push(0, 0, 1);
        uv[0] = (vertex[0] / outerRadius + 1) / 2;
        uv[1] = (vertex[1] / outerRadius + 1) / 2;
        uvs.push(uv[0], uv[1]);
      }
      radius += radiusStep;
    }

    for (let j = 0; j < phiSegments; j += 1) {
      const thetaSegmentLevel = j * (thetaSegments + 1);
      for (let i = 0; i < thetaSegments; i += 1) {
        const segment = i + thetaSegmentLevel;
        const a = segment;
        const b = segment + thetaSegments + 1;
        const c = segment + thetaSegments + 2;
        const d = segment + 1;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
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
      tangents: {
        buffer: new Float32Array([]),
      },
    });
  }
}
