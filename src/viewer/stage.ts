import {
  ACESFilmicToneMapping,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  MOUSE,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TOUCH,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { weldForSmooth, triangleCount } from "@/viewer/parse-stl";
import { STAGE } from "@/viewer/palette";
import type { CameraMode, SceneStats, UpAxis } from "@/viewer/types";

export type MeshInput = {
  id: string;
  geometry: BufferGeometry;
  color: string;
  visible: boolean;
  upAxis: UpAxis;
};

type Entry = {
  id: string;
  group: Group;
  mesh: Mesh;
  material: MeshStandardMaterial;
  base: BufferGeometry;
  smooth: BufferGeometry | null;
  triangles: number;
};

const FLY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
]);

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

export type Stage = {
  add(input: MeshInput): void;
  update(id: string, patch: Partial<Pick<MeshInput, "color" | "visible" | "upAxis">>): void;
  remove(id: string): void;
  fit(id?: string): void;
  setMode(mode: CameraMode): void;
  getMode(): CameraMode;
  setGrid(on: boolean): void;
  setWireframe(on: boolean): void;
  /** Returns false when the mesh is too dense to smooth. */
  setSmooth(on: boolean): boolean;
  setStick(x: number, y: number): void;
  setLift(v: number): void;
  setKeys(codes: string[]): void;
  getYaw(): number;
  getPosition(): { x: number; y: number; z: number };
  placeForTest(): void;
  getStats(): SceneStats;
  dispose(): void;
};

export function createStage(host: HTMLElement): Stage {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  canvas.setAttribute("aria-label", "STL viewport");
  host.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
  if (!renderer.getContext()) {
    canvas.remove();
    throw new Error("Couldn't start 3D graphics on this device.");
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(STAGE.background, 1);

  const scene = new Scene();
  scene.background = new Color(STAGE.background);

  const camera = new PerspectiveCamera(45, 1, 0.05, 5000);
  camera.position.set(70, 48, -90);

  const hemi = new HemisphereLight(STAGE.hemiSky, STAGE.hemiGround, 1.4);
  scene.add(hemi);
  const key = new DirectionalLight(STAGE.key, 2.4);
  key.position.set(5, 9, 4);
  scene.add(key);
  const rim = new DirectionalLight(STAGE.rim, 1.35);
  rim.position.set(-7, 4, -5);
  scene.add(rim);
  const fill = new DirectionalLight(STAGE.fill, 0.55);
  fill.position.set(-2, 2, 6);
  scene.add(fill);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = window.matchMedia("(pointer: coarse)").matches ? 0.72 : 0.95;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.8;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.mouseButtons = {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.PAN,
  };
  controls.touches = {
    ONE: TOUCH.ROTATE,
    TWO: TOUCH.DOLLY_PAN,
  };
  controls.target.set(40, 16, 20);
  controls.update();

  const entries = new Map<string, Entry>();
  const box = new Box3();
  const size = new Vector3();
  const center = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const desired = new Vector3();
  const velocity = new Vector3();
  const fitDir = new Vector3(-0.42, 0.5, -0.76).normalize();
  const euler = new Euler(0, 0, 0, "YXZ");

  let mode: CameraMode = "orbit";
  let gridOn = true;
  let wireframe = false;
  let smooth = false;
  let grid: GridHelper | null = null;
  let disposed = false;
  let yaw = 0;
  let pitch = 0;
  let stickX = 0;
  let stickY = 0;
  let lift = 0;
  let lookDx = 0;
  let lookDy = 0;
  let lookPointer: number | null = null;
  let cruise = 20;
  let boundsRadius = 40;
  let poseLocked = false;
  const keys = new Set<string>();
  let probe: Set<string> | null = null;
  let last = performance.now();

  function applyLook() {
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
  }

  function captureLook() {
    camera.updateMatrixWorld(true);
    euler.setFromQuaternion(camera.quaternion, "YXZ");
    pitch = clamp(euler.x, -1.45, 1.45);
    yaw = euler.y;
  }

  function releasePose() {
    if (!poseLocked) return;
    poseLocked = false;
    cruise = Math.max(boundsRadius * 0.85, 0.25);
  }

  function applyClip(radius: number) {
    camera.near = Math.max(radius / 2500, 0.01);
    camera.far = Math.max(radius * 400, 200);
    camera.updateProjectionMatrix();
  }

  function clearGrid() {
    if (!grid) return;
    scene.remove(grid);
    grid.geometry.dispose();
    disposeMaterial(grid.material);
    grid = null;
  }

  function rebuildGrid() {
    clearGrid();
    if (!gridOn) return;
    const stats = measureBox();
    const radius = stats.radius;
    const span = Math.max(radius * 4, 20);
    const next = new GridHelper(span, 12, STAGE.gridCenter, STAGE.gridLine);
    const materials = Array.isArray(next.material) ? next.material : [next.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.7;
    }
    if (stats.size) {
      next.position.set(stats.center.x, stats.minY - radius * 0.004, stats.center.z);
    } else {
      next.position.set(0, 0, 0);
    }
    scene.add(next);
    grid = next;
  }

  function measureBox() {
    box.makeEmpty();
    let triangles = 0;
    let visibleCount = 0;
    scene.updateMatrixWorld(true);
    for (const entry of entries.values()) {
      if (!entry.group.visible) continue;
      const was = entry.group.visible;
      entry.group.visible = true;
      box.expandByObject(entry.group);
      entry.group.visible = was;
      triangles += entry.triangles;
      visibleCount += 1;
    }
    if (visibleCount === 0 || box.isEmpty()) {
      return {
        triangles: 0,
        visibleCount: 0,
        size: null as [number, number, number] | null,
        radius: 40,
        center: center.set(0, 0, 0),
        minY: 0,
      };
    }
    box.getSize(size);
    box.getCenter(center);
    const radius = Math.max(size.length() * 0.5, 0.001);
    return {
      triangles,
      visibleCount,
      size: [size.x, size.y, size.z] as [number, number, number],
      radius,
      center,
      minY: box.min.y,
    };
  }

  function refreshBounds() {
    const stats = measureBox();
    boundsRadius = stats.radius;
    if (!poseLocked) cruise = Math.max(stats.radius * 0.85, 0.25);
    applyClip(stats.radius);
    controls.minDistance = Math.max(stats.radius * 0.02, 0.05);
    controls.maxDistance = Math.max(stats.radius * 40, 50);
    return stats;
  }

  function expandEntry(target: Box3, entry: Entry) {
    const was = entry.group.visible;
    entry.group.visible = true;
    entry.group.updateWorldMatrix(true, true);
    target.expandByObject(entry.group);
    entry.group.visible = was;
  }

  function applySmoothTo(entry: Entry): boolean {
    if (!smooth) {
      entry.mesh.geometry = entry.base;
      entry.material.flatShading = true;
      entry.material.needsUpdate = true;
      return true;
    }
    if (!entry.smooth) {
      const welded = weldForSmooth(entry.base);
      if (!welded) return false;
      entry.smooth = welded;
    }
    entry.mesh.geometry = entry.smooth;
    entry.material.flatShading = false;
    entry.material.needsUpdate = true;
    return true;
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || isTyping(event.target)) return;
    if (event.code === "KeyF") {
      event.preventDefault();
      api.fit();
      return;
    }
    if (mode !== "fly" || !FLY_CODES.has(event.code)) return;
    event.preventDefault();
    releasePose();
    keys.add(event.code);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };

  const onBlur = () => {
    keys.clear();
    stickX = 0;
    stickY = 0;
    lift = 0;
    lookPointer = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    canvas.dataset.lx = String(event.clientX);
    canvas.dataset.ly = String(event.clientY);
    if (mode !== "fly" || event.button !== 0) return;
    if (lookPointer !== null) return;
    releasePose();
    lookPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (mode !== "fly" || lookPointer !== event.pointerId) return;
    const lastX = Number(canvas.dataset.lx ?? event.clientX);
    const lastY = Number(canvas.dataset.ly ?? event.clientY);
    lookDx += event.clientX - lastX;
    lookDy += event.clientY - lastY;
    canvas.dataset.lx = String(event.clientX);
    canvas.dataset.ly = String(event.clientY);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (lookPointer !== event.pointerId) return;
    lookPointer = null;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 2 || height < 2) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function stepFly(dt: number) {
    const held = probe ?? keys;
    let forwardAmt = 0;
    let strafeAmt = 0;
    let liftAmt = lift;
    if (held.has("KeyW") || held.has("ArrowUp")) forwardAmt += 1;
    if (held.has("KeyS") || held.has("ArrowDown")) forwardAmt -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) strafeAmt += 1;
    if (held.has("KeyA") || held.has("ArrowLeft")) strafeAmt -= 1;
    if (held.has("KeyE")) liftAmt += 1;
    if (held.has("KeyQ")) liftAmt -= 1;
    // FPS signs: yaw 0 looks down −Z, camera +X is right.
    // A strafes −right (left on screen). D strafes +right. W follows the look, including pitch.
    forwardAmt = clamp(forwardAmt + stickY, -1, 1);
    strafeAmt = clamp(strafeAmt + stickX, -1, 1);
    liftAmt = clamp(liftAmt, -1, 1);

    if (lookDx !== 0 || lookDy !== 0) {
      yaw -= lookDx * 0.0045;
      pitch = clamp(pitch - lookDy * 0.0045, -1.45, 1.45);
      lookDx = 0;
      lookDy = 0;
    }
    applyLook();

    const moving = forwardAmt !== 0 || strafeAmt !== 0 || liftAmt !== 0;
    if (!moving && velocity.lengthSq() < 1e-8) {
      velocity.set(0, 0, 0);
      return;
    }

    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    desired.set(0, 0, 0);
    desired.addScaledVector(forward, forwardAmt);
    desired.addScaledVector(right, strafeAmt);
    desired.y += liftAmt;
    const length = desired.length();
    if (length > 1) desired.multiplyScalar(1 / length);
    const boost = held.has("ShiftLeft") || held.has("ShiftRight") ? 3 : 1;
    desired.multiplyScalar(cruise * boost);
    const gain = 1 - Math.exp(-12 * dt);
    velocity.lerp(desired, gain);
    camera.position.addScaledVector(velocity, dt);
  }

  const tick = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (mode === "fly") stepFly(dt);
    else controls.update();
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(tick);

  const onHide = () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else {
      last = performance.now();
      renderer.setAnimationLoop(tick);
    }
  };
  document.addEventListener("visibilitychange", onHide);

  const api: Stage = {
    add(input) {
      if (entries.has(input.id)) {
        const existing = entries.get(input.id)!;
        if (existing.base !== input.geometry) {
          existing.base.dispose();
          existing.smooth?.dispose();
          existing.smooth = null;
          existing.base = input.geometry;
          existing.triangles = triangleCount(input.geometry);
        }
        api.update(input.id, input);
        applySmoothTo(existing);
        refreshBounds();
        rebuildGrid();
        return;
      }
      const material = new MeshStandardMaterial({
        color: input.color,
        roughness: 0.62,
        metalness: 0.05,
        flatShading: !smooth,
        side: DoubleSide,
        wireframe,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: entries.size + 1,
      });
      const mesh = new Mesh(input.geometry, material);
      mesh.name = input.id;
      const group = new Group();
      group.add(mesh);
      group.visible = input.visible;
      group.rotation.x = input.upAxis === "z" ? -Math.PI / 2 : 0;
      scene.add(group);
      const entry: Entry = {
        id: input.id,
        group,
        mesh,
        material,
        base: input.geometry,
        smooth: null,
        triangles: triangleCount(input.geometry),
      };
      entries.set(input.id, entry);
      applySmoothTo(entry);
      refreshBounds();
      rebuildGrid();
    },
    update(id, patch) {
      const entry = entries.get(id);
      if (!entry) return;
      if (patch.color) entry.material.color.set(patch.color);
      if (patch.visible !== undefined) entry.group.visible = patch.visible;
      if (patch.upAxis) entry.group.rotation.x = patch.upAxis === "z" ? -Math.PI / 2 : 0;
      entry.group.updateMatrixWorld(true);
      refreshBounds();
      rebuildGrid();
    },
    remove(id) {
      const entry = entries.get(id);
      if (!entry) return;
      scene.remove(entry.group);
      entry.base.dispose();
      entry.smooth?.dispose();
      entry.material.dispose();
      entries.delete(id);
      refreshBounds();
      rebuildGrid();
    },
    fit(id) {
      const target = new Box3();
      if (id) {
        const entry = entries.get(id);
        if (!entry) return;
        expandEntry(target, entry);
      } else {
        for (const entry of entries.values()) {
          if (!entry.group.visible) continue;
          expandEntry(target, entry);
        }
      }
      if (target.isEmpty()) return;
      target.getCenter(center);
      target.getSize(size);
      const radius = Math.max(size.length() * 0.5, 0.001);
      boundsRadius = radius;
      if (!poseLocked) cruise = Math.max(radius * 0.85, 0.25);
      applyClip(radius);
      controls.minDistance = Math.max(radius * 0.02, 0.05);
      controls.maxDistance = Math.max(radius * 40, 50);
      const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.92;
      camera.up.set(0, 1, 0);
      camera.position.copy(center).addScaledVector(fitDir, dist);
      camera.lookAt(center);
      controls.target.copy(center);
      if (mode === "orbit") controls.update();
      else {
        captureLook();
        velocity.set(0, 0, 0);
      }
      rebuildGrid();
    },
    setMode(next) {
      if (next === mode) {
        controls.enabled = next === "orbit";
        return;
      }
      releasePose();
      if (next === "fly") {
        captureLook();
        controls.enabled = false;
        velocity.set(0, 0, 0);
      } else {
        camera.getWorldDirection(forward);
        const dist = Math.max(boundsRadius * 1.6, 0.5);
        controls.target.copy(camera.position).addScaledVector(forward, dist);
        controls.enabled = true;
        controls.update();
      }
      mode = next;
    },
    getMode: () => mode,
    setGrid(on) {
      gridOn = on;
      rebuildGrid();
    },
    setWireframe(on) {
      wireframe = on;
      for (const entry of entries.values()) entry.material.wireframe = on;
    },
    setSmooth(on) {
      if (!on) {
        smooth = false;
        for (const entry of entries.values()) applySmoothTo(entry);
        return true;
      }
      const welded = new Map<string, BufferGeometry>();
      for (const entry of entries.values()) {
        if (entry.smooth) continue;
        const next = weldForSmooth(entry.base);
        if (!next) {
          for (const geometry of welded.values()) geometry.dispose();
          return false;
        }
        welded.set(entry.id, next);
      }
      for (const [id, geometry] of welded) {
        const entry = entries.get(id);
        if (entry) entry.smooth = geometry;
      }
      smooth = true;
      for (const entry of entries.values()) applySmoothTo(entry);
      return true;
    },
    setStick(x, y) {
      if (x !== 0 || y !== 0) releasePose();
      stickX = x;
      stickY = y;
    },
    setLift(v) {
      if (v !== 0) releasePose();
      lift = v;
    },
    setKeys(codes) {
      probe = codes.length ? new Set(codes) : null;
      if (!probe) keys.clear();
    },
    getYaw() {
      euler.setFromQuaternion(camera.quaternion, "YXZ");
      return euler.y;
    },
    getPosition: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    placeForTest() {
      mode = "fly";
      controls.enabled = false;
      poseLocked = true;
      yaw = 0;
      pitch = 0;
      lookDx = 0;
      lookDy = 0;
      velocity.set(0, 0, 0);
      cruise = 20;
      camera.position.set(0, 0, 8);
      camera.up.set(0, 1, 0);
      applyLook();
    },
    getStats() {
      const stats = measureBox();
      return {
        triangles: stats.triangles,
        size: stats.size,
        visibleCount: stats.visibleCount,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      observer.disconnect();
      controls.dispose();
      for (const entry of entries.values()) {
        entry.base.dispose();
        entry.smooth?.dispose();
        entry.material.dispose();
      }
      entries.clear();
      clearGrid();
      renderer.dispose();
      canvas.remove();
    },
  };

  rebuildGrid();
  return api;
}
