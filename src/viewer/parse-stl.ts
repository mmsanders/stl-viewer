import {
  BufferGeometry,
  Float32BufferAttribute,
  type BufferAttribute,
} from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const loader = new STLLoader();

export function triangleCount(geometry: BufferGeometry): number {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  if (geometry.index) return geometry.index.count / 3;
  return position.count / 3;
}

export function parseStl(data: ArrayBuffer): BufferGeometry {
  let geometry: BufferGeometry;
  try {
    geometry = loader.parse(data.slice(0));
  } catch {
    throw new Error("This file is not a readable STL.");
  }
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) {
    geometry.dispose();
    throw new Error("This STL has no triangles.");
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const SMOOTH_TRIANGLE_LIMIT = 350_000;

/** Weld duplicated STL corners so vertex normals can smooth the surface. */
export function weldForSmooth(geometry: BufferGeometry): BufferGeometry | null {
  const tris = triangleCount(geometry);
  if (tris > SMOOTH_TRIANGLE_LIMIT) return null;
  const src = geometry.getAttribute("position") as BufferAttribute | undefined;
  if (!src) return null;

  const tolerance = 1e-4;
  const buckets = new Map<number, number[]>();
  const unique: number[] = [];
  const index = new Array<number>(src.count);

  const quant = (v: number) => Math.round(v / tolerance);

  for (let i = 0; i < src.count; i++) {
    const x = src.getX(i);
    const y = src.getY(i);
    const z = src.getZ(i);
    const ix = quant(x);
    const iy = quant(y);
    const iz = quant(z);
    let h = Math.imul(ix | 0, 0x9e3779b1) ^ (iy | 0);
    h = (Math.imul(h, 0x85ebca77) ^ (iz | 0)) >>> 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket) {
      for (const id of bucket) {
        const dx = unique[id * 3]! - x;
        const dy = unique[id * 3 + 1]! - y;
        const dz = unique[id * 3 + 2]! - z;
        if (dx * dx + dy * dy + dz * dz <= tolerance * tolerance) {
          found = id;
          break;
        }
      }
    }
    if (found === -1) {
      found = unique.length / 3;
      unique.push(x, y, z);
      const list = bucket ?? [];
      list.push(found);
      if (!bucket) buckets.set(h, list);
    }
    index[i] = found;
  }

  const welded = new BufferGeometry();
  welded.setAttribute("position", new Float32BufferAttribute(unique, 3));
  welded.setIndex(index);
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  return welded;
}
