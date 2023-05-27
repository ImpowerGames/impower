/**
 * Port from https://github.com/mrdoob/three.js/blob/master/src/extras/Earcut.js
 */

class Node {
  /** vertex index in coordinates array */
  i: number;

  /** x coordinate */
  x: number;

  /** y coordinate */
  y: number;

  /** previous vertex nodes in a polygon ring */
  prev: Node = null;

  /** next vertex nodes in a polygon ring */
  next: Node = null;

  /** z-order curve value */
  z = 0;

  /** previous nodes in z-order */
  prevZ: Node = null;

  /** next nodes in z-order */
  nextZ: Node = null;

  /** indicates whether this is a steiner point */
  steiner = false;

  constructor(i: number, x: number, y: number) {
    this.i = i;
    this.x = x;
    this.y = y;
  }
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
const splitPolygon = (a: Node, b: Node): Node => {
  const a2 = new Node(a.i, a.x, a.y);
  const b2 = new Node(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;

  a.next = b;
  b.prev = a;

  a2.next = an;
  an.prev = a2;

  b2.next = a2;
  a2.prev = b2;

  bp.next = b2;
  b2.prev = bp;

  return b2;
};

// create a node and optionally link it with previous one (in a circular doubly linked list)
const insertNode = (i: number, x: number, y: number, last: Node): Node => {
  const p = new Node(i, x, y);

  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }

  return p;
};

const removeNode = (p: Node): void => {
  p.next.prev = p.prev;
  p.prev.next = p.next;

  if (p.prevZ) {
    p.prevZ.nextZ = p.nextZ;
  }
  if (p.nextZ) {
    p.nextZ.prevZ = p.prevZ;
  }
};

const signedArea = (
  data: number[],
  start: number,
  end: number,
  dim: number
): number => {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }

  return sum;
};

// find the leftmost node of a polygon ring
const getLeftmost = (start: Node): Node => {
  let p = start;
  let leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
      leftmost = p;
    }
    p = p.next;
  } while (p !== start);

  return leftmost;
};

// check if a point lies within a convex triangle
const pointInTriangle = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  px: number,
  py: number
): boolean => {
  return (
    (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
    (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
    (bx - px) * (cy - py) >= (cx - px) * (by - py)
  );
};

// signed area of a triangle
const area = (p: Node, q: Node, r: Node): number => {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
};

// check if two points are equal
const equals = (p1: Node, p2: Node): boolean => {
  return p1.x === p2.x && p1.y === p2.y;
};

const sign = (num: number): number => {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
};

// for collinear points p, q, r, check if point q lies on segment pr
const onSegment = (p: Node, q: Node, r: Node): boolean => {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
};

// check if two segments intersect
const intersects = (p1: Node, q1: Node, p2: Node, q2: Node): boolean => {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));

  if (o1 !== o2 && o3 !== o4) {
    return true; // general case
  }
  if (o1 === 0 && onSegment(p1, p2, q1)) {
    return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
  }
  if (o2 === 0 && onSegment(p1, q2, q1)) {
    return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
  }
  if (o3 === 0 && onSegment(p2, p1, q2)) {
    return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
  }
  if (o4 === 0 && onSegment(p2, q1, q2)) {
    return true; // p2, q2 and q1 are collinear and q1 lies on p2q2
  }

  return false;
};

// check if a polygon diagonal intersects any polygon segments
const intersectsPolygon = (a: Node, b: Node): boolean => {
  let p = a;
  do {
    if (
      p.i !== a.i &&
      p.next.i !== a.i &&
      p.i !== b.i &&
      p.next.i !== b.i &&
      intersects(p, p.next, a, b)
    ) {
      return true;
    }
    p = p.next;
  } while (p !== a);

  return false;
};

// check if a polygon diagonal is locally inside the polygon
const locallyInside = (a: Node, b: Node): boolean => {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
};

// check if the middle point of a polygon diagonal is inside the polygon
const middleInside = (a: Node, b: Node): boolean => {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if (
      p.y > py !== p.next.y > py &&
      p.next.y !== p.y &&
      px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x
    ) {
      inside = !inside;
    }
    p = p.next;
  } while (p !== a);

  return inside;
};

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
const isValidDiagonal = (a: Node, b: Node): boolean => {
  return Boolean(
    a.next.i !== b.i &&
      a.prev.i !== b.i &&
      !intersectsPolygon(a, b) && // dones't intersect other edges
      ((locallyInside(a, b) &&
        locallyInside(b, a) &&
        middleInside(a, b) && // locally visible
        (area(a.prev, a, b.prev) || area(a, b.prev, b))) || // does not create opposite-facing sectors
        (equals(a, b) &&
          area(a.prev, a, a.next) > 0 &&
          area(b.prev, b, b.next) > 0))
  ); // special zero-length case
};

// eliminate colinear or duplicate points
const filterPoints = (start: Node, end?: Node): Node => {
  if (!start) {
    return start;
  }
  if (!end) {
    end = start;
  }

  let p = start;
  let again;
  do {
    again = false;

    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = p.prev;
      end = p.prev;
      if (p === p.next) {
        break;
      }
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);

  return end;
};

// z-order of a point given coords and inverse of the longer side of data bbox
const zOrder = (
  x: number,
  y: number,
  minX: number,
  minY: number,
  invSize: number
): number => {
  // coords are transformed into non-negative 15-bit integer range
  x = ((x - minX) * invSize) | 0;
  y = ((y - minY) * invSize) | 0;

  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;

  y = (y | (y << 8)) & 0x00ff00ff;
  y = (y | (y << 4)) & 0x0f0f0f0f;
  y = (y | (y << 2)) & 0x33333333;
  y = (y | (y << 1)) & 0x55555555;

  return x | (y << 1);
};

// check whether a polygon node forms a valid ear with adjacent nodes
const isEar = (ear: Node): boolean => {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) {
    return false; // reflex, can't be an ear
  }

  // now make sure we don't have other points inside the potential ear
  const ax = a.x;
  const bx = b.x;
  const cx = c.x;
  const ay = a.y;
  const by = b.y;
  const cy = c.y;

  // triangle bbox; min & max are calculated like this for speed
  const x0 = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
  const y0 = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
  const x1 = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
  const y1 = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;

  let p = c.next;
  while (p !== a) {
    if (
      p.x >= x0 &&
      p.x <= x1 &&
      p.y >= y0 &&
      p.y <= y1 &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) {
      return false;
    }
    p = p.next;
  }

  return true;
};

const isEarHashed = (
  ear: Node,
  minX: number,
  minY: number,
  invSize: number
): boolean => {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) {
    return false; // reflex, can't be an ear
  }

  const ax = a.x;
  const bx = b.x;
  const cx = c.x;
  const ay = a.y;
  const by = b.y;
  const cy = c.y;

  // triangle bbox; min & max are calculated like this for speed
  const x0 = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
  const y0 = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
  const x1 = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
  const y1 = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;

  // z-order range for the current triangle bbox;
  const minZ = zOrder(x0, y0, minX, minY, invSize);
  const maxZ = zOrder(x1, y1, minX, minY, invSize);

  let p = ear.prevZ;
  let n = ear.nextZ;

  // look for points inside the triangle in both directions
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (
      p.x >= x0 &&
      p.x <= x1 &&
      p.y >= y0 &&
      p.y <= y1 &&
      p !== a &&
      p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) {
      return false;
    }
    p = p.prevZ;

    if (
      n.x >= x0 &&
      n.x <= x1 &&
      n.y >= y0 &&
      n.y <= y1 &&
      n !== a &&
      n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) {
      return false;
    }
    n = n.nextZ;
  }

  // look for remaining points in decreasing z-order
  while (p && p.z >= minZ) {
    if (
      p.x >= x0 &&
      p.x <= x1 &&
      p.y >= y0 &&
      p.y <= y1 &&
      p !== a &&
      p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0
    ) {
      return false;
    }
    p = p.prevZ;
  }

  // look for remaining points in increasing z-order
  while (n && n.z <= maxZ) {
    if (
      n.x >= x0 &&
      n.x <= x1 &&
      n.y >= y0 &&
      n.y <= y1 &&
      n !== a &&
      n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) &&
      area(n.prev, n, n.next) >= 0
    ) {
      return false;
    }
    n = n.nextZ;
  }

  return true;
};

// go through all polygon nodes and cure small local self-intersections
const cureLocalIntersections = (
  start: Node,
  triangles: number[],
  dim: number
): Node => {
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;

    if (
      !equals(a, b) &&
      intersects(a, p, p.next, b) &&
      locallyInside(a, b) &&
      locallyInside(b, a)
    ) {
      triangles.push((a.i / dim) | 0);
      triangles.push((p.i / dim) | 0);
      triangles.push((b.i / dim) | 0);

      // remove two nodes involved
      removeNode(p);
      removeNode(p.next);

      p = b;
      start = b;
    }

    p = p.next;
  } while (p !== start);

  return filterPoints(p);
};

const compareX = (a: Node, b: Node): number => {
  return a.x - b.x;
};

// whether sector in vertex m contains sector in vertex p in the same coordinates
const sectorContainsSector = (m: Node, p: Node): boolean => {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
};

// David Eberly's algorithm for finding a bridge between hole and outer polygon
const findHoleBridge = (hole: Node, outerNode: Node): Node => {
  let p = outerNode;
  let qx = -Infinity;
  let m;

  const hx = hole.x;
  const hy = hole.y;

  // find a segment intersected by a ray from the hole's leftmost point to the left;
  // segment's endpoint with lesser x will be potential connection point
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) {
          return m; // hole touches outer segment; pick leftmost endpoint
        }
      }
    }

    p = p.next;
  } while (p !== outerNode);

  if (!m) {
    return null;
  }

  // look for points inside the triangle of hole point, segment intersection and endpoint;
  // if there are no points found, we have a valid connection;
  // otherwise choose the point of the minimum angle with the ray as connection point

  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;
  let tan;

  p = m;

  do {
    if (
      hx >= p.x &&
      p.x >= mx &&
      hx !== p.x &&
      pointInTriangle(
        hy < my ? hx : qx,
        hy,
        mx,
        my,
        hy < my ? qx : hx,
        hy,
        p.x,
        p.y
      )
    ) {
      tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

      if (
        locallyInside(p, hole) &&
        (tan < tanMin ||
          (tan === tanMin &&
            (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))
      ) {
        m = p;
        tanMin = tan;
      }
    }

    p = p.next;
  } while (p !== stop);

  return m;
};

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
const sortLinked = (list: Node): Node => {
  let i;
  let p;
  let q;
  let e;
  let tail;
  let numMerges;
  let pSize;
  let qSize;
  let inSize = 1;

  do {
    p = list;
    list = null;
    tail = null;
    numMerges = 0;

    while (p) {
      numMerges += 1;
      q = p;
      pSize = 0;
      for (i = 0; i < inSize; i += 1) {
        pSize += 1;
        q = q.nextZ;
        if (!q) {
          break;
        }
      }

      qSize = inSize;

      while (pSize > 0 || (qSize > 0 && q)) {
        if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
          e = p;
          p = p.nextZ;
          pSize -= 1;
        } else {
          e = q;
          q = q.nextZ;
          qSize -= 1;
        }

        if (tail) {
          tail.nextZ = e;
        } else {
          list = e;
        }

        e.prevZ = tail;
        tail = e;
      }

      p = q;
    }

    tail.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);

  return list;
};

// interlink polygon nodes in z-order
const indexCurve = (
  start: Node,
  minX: number,
  minY: number,
  invSize: number
): void => {
  let p = start;
  do {
    if (p.z === 0) {
      p.z = zOrder(p.x, p.y, minX, minY, invSize);
    }
    p.prevZ = p.prev;
    p.nextZ = p.next;
    p = p.next;
  } while (p !== start);

  p.prevZ.nextZ = null;
  p.prevZ = null;

  sortLinked(p);
};

// create a circular doubly linked list from polygon points in the specified winding order
const linkedList = (
  data: number[],
  start: number,
  end: number,
  dim: number,
  clockwise: boolean
): Node => {
  let i;
  let last;

  if (clockwise === signedArea(data, start, end, dim) > 0) {
    for (i = start; i < end; i += dim) {
      last = insertNode(i, data[i], data[i + 1], last);
    }
  } else {
    for (i = end - dim; i >= start; i -= dim) {
      last = insertNode(i, data[i], data[i + 1], last);
    }
  }

  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }

  return last;
};

// find a bridge between vertices that connects hole with an outer ring and link it
const eliminateHole = (hole: Node, outerNode: Node): Node => {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) {
    return outerNode;
  }

  const bridgeReverse = splitPolygon(bridge, hole);

  // filter collinear points around the cuts
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
};

// link every hole into the outer loop, producing a single-ring polygon without holes
const eliminateHoles = (
  data: number[],
  holeIndices: number[],
  outerNode: Node,
  dim: number
): Node => {
  const queue = [];
  let i;
  let len;
  let start;
  let end;
  let list;

  for (i = 0, len = holeIndices.length; i < len; i += 1) {
    start = holeIndices[i] * dim;
    end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    list = linkedList(data, start, end, dim, false);
    if (list === list.next) {
      list.steiner = true;
    }
    queue.push(getLeftmost(list));
  }

  queue.sort(compareX);

  // process holes from left to right
  for (i = 0; i < queue.length; i += 1) {
    outerNode = eliminateHole(queue[i], outerNode);
  }

  return outerNode;
};

// main ear slicing loop which triangulates a polygon (given as a linked list)
const earcutLinked = (
  ear: Node,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
  pass: number
): void => {
  // try splitting polygon into two and triangulate them independently
  const splitEarcut = (
    start: Node,
    triangles: number[],
    dim: number,
    minX: number,
    minY: number,
    invSize: number
  ): void => {
    // look for a valid diagonal that divides the polygon into two
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) {
          // split the polygon in two by the diagonal
          let c = splitPolygon(a, b);

          // filter colinear points around the cuts
          a = filterPoints(a, a.next);
          c = filterPoints(c, c.next);

          // run earcut on each half
          earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
          earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
          return;
        }

        b = b.next;
      }

      a = a.next;
    } while (a !== start);
  };

  if (!ear) {
    return;
  }

  // interlink polygon nodes in z-order
  if (!pass && invSize) {
    indexCurve(ear, minX, minY, invSize);
  }

  let stop = ear;
  let prev;
  let next;

  // iterate through ears, slicing them one by one
  while (ear.prev !== ear.next) {
    prev = ear.prev;
    next = ear.next;

    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      // cut off the triangle
      triangles.push((prev.i / dim) | 0);
      triangles.push((ear.i / dim) | 0);
      triangles.push((next.i / dim) | 0);

      removeNode(ear);

      // skipping the next vertex leads to less sliver triangles
      ear = next.next;
      stop = next.next;

      continue;
    }

    ear = next;

    // if we looped through the whole remaining polygon and can't find any more ears
    if (ear === stop) {
      // try filtering points and slicing again
      if (!pass) {
        earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

        // if this didn't work, try curing all small self-intersections locally
      } else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
        earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

        // as a last resort, try splitting the remaining polygon into two
      } else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize);
      }

      break;
    }
  }
};

export const triangulate = (
  data: number[],
  holeIndices?: number[],
  dim = 2
): number[] => {
  const hasHoles = holeIndices && holeIndices.length;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles: number[] = [];

  if (!outerNode || outerNode.next === outerNode.prev) {
    return triangles;
  }

  let minX;
  let minY;
  let maxX;
  let maxY;
  let x;
  let y;
  let invSize;

  if (hasHoles) {
    outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
  }

  // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
  if (data.length > 80 * dim) {
    minX = data[0];
    maxX = data[0];
    minY = data[1];
    maxY = data[1];

    for (let i = dim; i < outerLen; i += dim) {
      x = data[i];
      y = data[i + 1];
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }

    // minX, minY and invSize are later used to transform coords into integers for z-order calculation
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }

  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);

  return triangles;
};
