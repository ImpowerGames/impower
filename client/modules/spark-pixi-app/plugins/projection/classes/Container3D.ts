import { DEG_TO_RAD } from "@pixi/math";
import {
  Camera,
  Container3D as _Container3D,
  Plane,
  Point3D,
} from "pixi3d/pixi7";

export class Container3D extends _Container3D {
  isOffCamera(camera: Camera): boolean {
    return (
      this.position.z > camera.position.z + camera.near ||
      this.position.z < camera.position.z - camera.far
    );
  }

  planeFromPositionAndNormal(position: Point3D, normal: Point3D): Plane {
    return new Plane(normal, Point3D.dot(position, normal.normalize()));
  }

  isInCameraFrustum(camera: Camera): boolean {
    const center = this.position;
    const bounds = this.getBounds();
    const radius = Math.max(bounds.width, bounds.height);
    const aspect = camera.renderer.width / camera.renderer.height;
    const halfVSide =
      camera.far * Math.tan(camera.fieldOfView * 0.5 * DEG_TO_RAD);
    const halfHSide = halfVSide * aspect;

    const near = this.planeFromPositionAndNormal(
      Point3D.add(
        camera.worldTransform.position,
        Point3D.scale(camera.worldTransform.forward, camera.near)
      ),
      camera.worldTransform.forward
    );
    if (Point3D.dot(center, near.normal) - near.distance < 0) {
      return false;
    }

    const far = this.planeFromPositionAndNormal(
      Point3D.add(
        camera.worldTransform.position,
        Point3D.scale(camera.worldTransform.forward, camera.far)
      ),
      camera.worldTransform.backward
    );
    if (Point3D.dot(center, far.normal) - far.distance < 0) {
      return false;
    }

    const right = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        Point3D.subtract(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.right, halfHSide)
        ),
        camera.worldTransform.up
      )
    );
    if (Point3D.dot(center, right.normal) - right.distance < -radius) {
      return false;
    }

    const left = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        camera.worldTransform.up,
        Point3D.add(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.right, halfHSide)
        )
      )
    );
    if (Point3D.dot(center, left.normal) - left.distance < -radius) {
      return false;
    }

    const bottom = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        camera.worldTransform.right,
        Point3D.subtract(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.up, halfVSide)
        )
      )
    );
    if (Point3D.dot(center, bottom.normal) - bottom.distance < -radius) {
      return false;
    }

    const top = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        Point3D.add(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.up, halfVSide)
        ),
        camera.worldTransform.right
      )
    );
    if (Point3D.dot(center, top.normal) - top.distance < -radius) {
      return false;
    }

    return true;
  }
}
