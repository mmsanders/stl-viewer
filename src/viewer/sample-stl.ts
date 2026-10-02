type V = [number, number, number];

function tri(out: V[], a: V, b: V, c: V) {
  out.push(a, b, c);
}

function quad(out: V[], a: V, b: V, c: V, d: V) {
  tri(out, a, b, c);
  tri(out, a, c, d);
}

function box(out: V[], min: V, max: V) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const p = (x: number, y: number, z: number): V => [x, y, z];
  quad(out, p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0));
  quad(out, p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1));
  quad(out, p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1));
  quad(out, p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), p(x0, y0, z0));
  quad(out, p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1));
  quad(out, p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0));
}

function cylinderY(out: V[], cx: number, cy: number, cz: number, r: number, h: number, seg: number) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * r;
    const z0 = cz + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const z1 = cz + Math.sin(a1) * r;
    const y0 = cy;
    const y1 = cy + h;
    quad(out, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]);
    tri(out, [cx, y1, cz], [x0, y1, z0], [x1, y1, z1]);
    tri(out, [cx, y0, cz], [x1, y0, z1], [x0, y0, z0]);
  }
}

/** A small printable bracket, about 80 × 46 × 48 model units. */
export function makeSampleStl(): ArrayBuffer {
  const verts: V[] = [];
  box(verts, [0, 0, 0], [80, 8, 48]);
  box(verts, [0, 8, 36], [80, 46, 48]);
  box(verts, [36, 8, 10], [44, 34, 36]);
  cylinderY(verts, 20, 8, 18, 7, 12, 20);
  cylinderY(verts, 60, 8, 18, 4.5, 20, 16);

  const count = verts.length / 3;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  const header = "Plinth sample bracket";
  for (let i = 0; i < 80; i++) view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  view.setUint32(80, count, true);

  let offset = 84;
  for (let i = 0; i < verts.length; i += 3) {
    const [ax, ay, az] = verts[i]!;
    const [bx, by, bz] = verts[i + 1]!;
    const [cx, cy, cz] = verts[i + 2]!;
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const nums = [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz];
    for (let k = 0; k < 12; k++) view.setFloat32(offset + k * 4, nums[k]!, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return buffer;
}
