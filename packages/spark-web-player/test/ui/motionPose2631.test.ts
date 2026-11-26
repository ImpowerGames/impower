import { describe, expect, test } from "vitest";
import { motionPose, type MotionStyle } from "../../src/app/morph/motionPose";

const BOX = { width: 200, height: 300 };

const style = (values: Partial<MotionStyle>): MotionStyle => ({
  translate: "none",
  rotate: "none",
  scale: "none",
  transform: "none",
  transformOrigin: "100px 150px",
  opacity: "1",
  ...values,
});

const apply = (matrix: readonly number[], x: number, y: number) => [
  matrix[0]! * x + matrix[2]! * y + matrix[4]!,
  matrix[1]! * x + matrix[3]! * y + matrix[5]!,
];

const close = (actual: number[], expected: number[]) => actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 6));

describe("a pose read from a stand-in's computed movement (#2631)", () => {
  test("a translate in px moves by the picture's own pixels, and a percentage by the picture's rectangle", () => {
    close(apply(motionPose(style({ translate: "0px 8px" }), BOX)!.matrix, 0, 0), [0, 8]);
    close(apply(motionPose(style({ translate: "10% 50%" }), BOX)!.matrix, 0, 0), [20, 150]);
    close(apply(motionPose(style({ translate: "calc(10% + 4px) calc(-2px + 0%)" }), BOX)!.matrix, 0, 0), [24, -2]);
    close(apply(motionPose(style({ translate: "6px" }), BOX)!.matrix, 0, 0), [6, 0]);
  });

  test("rotate and scale turn and grow about the origin", () => {
    const turned = motionPose(style({ rotate: "90deg", transformOrigin: "20px 30px" }), BOX)!.matrix;
    close(apply(turned, 20, 30), [20, 30]);
    close(apply(turned, 30, 30), [20, 40]);
    close(apply(motionPose(style({ rotate: "0 0 1 0.25turn", transformOrigin: "20px 30px" }), BOX)!.matrix, 30, 30), [20, 40]);
    close(apply(motionPose(style({ rotate: "z 90deg", transformOrigin: "20px 30px" }), BOX)!.matrix, 30, 30), [20, 40]);
    close(apply(motionPose(style({ scale: "2" }), BOX)!.matrix, 0, 0), [-100, -150]);
    close(apply(motionPose(style({ scale: "150% 1" }), BOX)!.matrix, 0, 0), [-50, 0]);
  });

  test("translate, rotate, scale and transform compose in that order about the origin", () => {
    const pose = motionPose(
      style({ translate: "10px 0px", rotate: "90deg", scale: "2", transform: "matrix(1, 0, 0, 1, 5, 0)", transformOrigin: "0px 0px" }),
      BOX,
    )!;
    close(apply(pose.matrix, 0, 0), [10, 10]);
    close(apply(pose.matrix, 1, 0), [10, 12]);
  });

  test("a transform list written as functions is read too", () => {
    close(apply(motionPose(style({ transform: "translate(10%, 4px) rotate(90deg)", transformOrigin: "0px 0px" }), BOX)!.matrix, 1, 0), [20, 5]);
    close(apply(motionPose(style({ transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 9, 0, 1)" }), BOX)!.matrix, 0, 0), [7, 9]);
  });

  test("keyword origins, the opacity and an unreadable value", () => {
    close(apply(motionPose(style({ scale: "2", transformOrigin: "left top" }), BOX)!.matrix, 1, 1), [2, 2]);
    expect(motionPose(style({ opacity: "0.25" }), BOX)!.opacity).toBe(0.25);
    expect(motionPose(style({ translate: "1em 0px" }), BOX)).toBeUndefined();
    expect(motionPose(style({ rotate: "1 0 0 5deg" }), BOX)).toBeUndefined();
  });
});
