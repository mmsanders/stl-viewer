import { openLibrary, type Library, type StoredModel } from "@/viewer/db";
import { cleanName, uid } from "@/viewer/format";
import { PALETTE } from "@/viewer/palette";
import { parseStl, triangleCount } from "@/viewer/parse-stl";
import type { ControlsProbe } from "@/viewer/probe";
import { makeSampleStl } from "@/viewer/sample-stl";
import { createStage, type Stage } from "@/viewer/stage";
import {
  DEFAULT_VIEW,
  SAMPLE_ID,
  type CameraMode,
  type ModelView,
  type SceneStats,
  type StatusNote,
  type UpAxis,
  type ViewOptions,
} from "@/viewer/types";

const VIEW_KEY = "plinth-view";
const HIDE_SAMPLE_KEY = "plinth-hide-sample";
const MAX_BYTES = 100 * 1024 * 1024;

export type SessionHooks = {
  onModels: (models: ModelView[]) => void;
  onStats: (stats: SceneStats) => void;
  onView: (view: ViewOptions) => void;
  onStatus: (status: StatusNote) => void;
  onReady: () => void;
};

export type Session = {
  loadFiles: (files: File[]) => Promise<void>;
  loadSample: () => Promise<void>;
  keepSample: () => Promise<void>;
  dismissSample: () => void;
  toggleVisible: (id: string) => Promise<void>;
  setAllVisible: (visible: boolean) => Promise<void>;
  solo: (id: string) => Promise<void>;
  cycleColor: (id: string) => Promise<void>;
  setUpAxis: (id: string, axis: UpAxis) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  frame: (id: string) => Promise<void>;
  fit: () => void;
  setMode: (mode: CameraMode) => void;
  setGrid: (on: boolean) => void;
  setWireframe: (on: boolean) => void;
  setSmooth: (on: boolean) => void;
  setStick: (x: number, y: number) => void;
  setLift: (v: number) => void;
  clearStatus: () => void;
  dispose: () => void;
};

type Signal = { dead: boolean };

function loadView(): ViewOptions {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return { ...DEFAULT_VIEW };
    const parsed = JSON.parse(raw) as Partial<ViewOptions>;
    return {
      grid: parsed.grid !== false,
      wireframe: Boolean(parsed.wireframe),
      smooth: Boolean(parsed.smooth),
      mode: parsed.mode === "fly" ? "fly" : "orbit",
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Could not read that file."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsArrayBuffer(file);
  });
}

function yieldFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(null));
  });
}

export async function startSession(
  host: HTMLElement,
  hooks: SessionHooks,
  signal: Signal,
): Promise<Session> {
  const stage = createStage(host);
  let disposed = false;
  let models: ModelView[] = [];
  let sampleBuffer: ArrayBuffer | null = null;
  let library: Library | null = null;
  const view = loadView();
  let readyPromise: Promise<void> = Promise.resolve();
  let markReady = () => {};
  readyPromise = new Promise((resolve) => {
    markReady = resolve;
  });

  const publish = () => {
    if (signal.dead || disposed) return;
    hooks.onModels(models.map((model) => ({ ...model })));
    hooks.onStats(stage.getStats());
  };

  const persistView = () => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* private mode can reject; the session still works */
    }
  };

  const toView = (
    record: Pick<
      StoredModel,
      "id" | "name" | "visible" | "colorIndex" | "upAxis" | "createdAt" | "byteLength"
    >,
    triangles: number,
    ephemeral: boolean,
  ): ModelView => ({
    id: record.id,
    name: record.name,
    visible: record.visible,
    colorIndex: record.colorIndex,
    color: PALETTE[record.colorIndex % PALETTE.length] ?? PALETTE[0],
    upAxis: record.upAxis,
    triangles,
    byteLength: record.byteLength,
    ephemeral,
    createdAt: record.createdAt,
  });

  async function writeStored(model: ModelView) {
    if (!library || model.ephemeral) return;
    const existing = await library.get(model.id);
    if (!existing) return;
    await library.put({
      ...existing,
      name: model.name,
      visible: model.visible,
      colorIndex: model.colorIndex,
      upAxis: model.upAxis,
    });
  }

  function dropEphemeral() {
    if (!models.some((model) => model.ephemeral)) return;
    stage.remove(SAMPLE_ID);
    models = models.filter((model) => !model.ephemeral);
    sampleBuffer = null;
  }

  async function addBuffer(
    id: string,
    name: string,
    data: ArrayBuffer,
    ephemeral: boolean,
    fitAfter: boolean,
  ) {
    const geometry = parseStl(data);
    const colorIndex = models.length % PALETTE.length;
    const record: StoredModel = {
      id,
      name,
      visible: true,
      colorIndex,
      upAxis: "y",
      createdAt: Date.now(),
      byteLength: data.byteLength,
      data,
    };
    if (!ephemeral && library) await library.put(record);
    if (ephemeral) sampleBuffer = data;
    stage.add({
      id,
      geometry,
      color: PALETTE[colorIndex] ?? PALETTE[0],
      visible: true,
      upAxis: "y",
    });
    models = [toView(record, triangleCount(geometry), ephemeral), ...models];
    if (fitAfter) stage.fit(id);
    publish();
  }

  async function showSample(ephemeral: boolean) {
    if (models.some((model) => model.id === SAMPLE_ID || model.ephemeral)) {
      stage.fit(SAMPLE_ID);
      return;
    }
    const data = makeSampleStl();
    await addBuffer(ephemeral ? SAMPLE_ID : uid(), "Sample bracket", data, ephemeral, true);
  }

  const session: Session = {
    async loadFiles(files) {
      if (!library) return;
      dropEphemeral();
      const shelfWasEmpty = models.length === 0;
      const errors: string[] = [];
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        if (signal.dead) return;
        hooks.onStatus({
          tone: "info",
          text: files.length > 1 ? `Reading ${i + 1} of ${files.length}` : `Reading ${cleanName(file.name)}`,
        });
        if (file.size > MAX_BYTES) {
          errors.push(`${cleanName(file.name)} is over 100 MB`);
          continue;
        }
        try {
          const data = await readFile(file);
          await addBuffer(uid(), cleanName(file.name), data, false, false);
          added += 1;
          await yieldFrame();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not read that file.";
          errors.push(`${cleanName(file.name)}: ${message}`);
        }
      }
      if (added > 0 && shelfWasEmpty) stage.fit();
      publish();
      if (errors.length) {
        hooks.onStatus({ tone: "error", text: errors.join(" · ") });
      } else if (added > 0) {
        hooks.onStatus(null);
      } else {
        hooks.onStatus({ tone: "error", text: "Nothing was added." });
      }
    },
    async loadSample() {
      try {
        localStorage.removeItem(HIDE_SAMPLE_KEY);
      } catch {
        /* ignore */
      }
      await showSample(true);
      hooks.onStatus(null);
    },
    async keepSample() {
      const sample = models.find((model) => model.ephemeral);
      if (!sample || !sampleBuffer || !library) return;
      const id = uid();
      const data = sampleBuffer.slice(0);
      const geometry = parseStl(data);
      const record: StoredModel = {
        id,
        name: sample.name,
        visible: sample.visible,
        colorIndex: sample.colorIndex,
        upAxis: sample.upAxis,
        createdAt: Date.now(),
        byteLength: data.byteLength,
        data,
      };
      await library.put(record);
      stage.remove(SAMPLE_ID);
      stage.add({
        id,
        geometry,
        color: sample.color,
        visible: sample.visible,
        upAxis: sample.upAxis,
      });
      models = models.map((model) =>
        model.ephemeral ? toView(record, triangleCount(geometry), false) : model,
      );
      sampleBuffer = null;
      publish();
      hooks.onStatus({ tone: "info", text: "Sample saved on this phone." });
    },
    dismissSample() {
      try {
        localStorage.setItem(HIDE_SAMPLE_KEY, "1");
      } catch {
        /* ignore */
      }
      dropEphemeral();
      publish();
    },
    async toggleVisible(id) {
      const model = models.find((item) => item.id === id);
      if (!model) return;
      model.visible = !model.visible;
      stage.update(id, { visible: model.visible });
      await writeStored(model);
      publish();
    },
    async setAllVisible(visible) {
      for (const model of models) {
        model.visible = visible;
        stage.update(model.id, { visible });
        await writeStored(model);
      }
      publish();
    },
    async solo(id) {
      const target = models.find((model) => model.id === id);
      if (!target) return;
      const already = target.visible && models.every((model) => model.id === id || !model.visible);
      for (const model of models) {
        model.visible = already ? true : model.id === id;
        stage.update(model.id, { visible: model.visible });
        await writeStored(model);
      }
      if (!already) stage.fit(id);
      publish();
    },
    async cycleColor(id) {
      const model = models.find((item) => item.id === id);
      if (!model) return;
      model.colorIndex = (model.colorIndex + 1) % PALETTE.length;
      model.color = PALETTE[model.colorIndex] ?? PALETTE[0];
      stage.update(id, { color: model.color });
      await writeStored(model);
      publish();
    },
    async setUpAxis(id, axis) {
      const model = models.find((item) => item.id === id);
      if (!model || model.upAxis === axis) return;
      model.upAxis = axis;
      stage.update(id, { upAxis: axis });
      await writeStored(model);
      publish();
    },
    async rename(id, name) {
      const next = name.trim();
      if (!next) return;
      const model = models.find((item) => item.id === id);
      if (!model || model.name === next) return;
      model.name = next;
      await writeStored(model);
      publish();
    },
    async remove(id) {
      const model = models.find((item) => item.id === id);
      if (!model) return;
      if (model.ephemeral) {
        session.dismissSample();
        return;
      }
      stage.remove(id);
      models = models.filter((item) => item.id !== id);
      await library?.delete(id);
      publish();
    },
    async frame(id) {
      const model = models.find((item) => item.id === id);
      if (!model) return;
      if (!model.visible) {
        model.visible = true;
        stage.update(id, { visible: true });
        await writeStored(model);
      }
      stage.fit(id);
      publish();
    },
    fit() {
      stage.fit();
      publish();
    },
    setMode(mode) {
      view.mode = mode;
      stage.setMode(mode);
      persistView();
      hooks.onView({ ...view });
    },
    setGrid(on) {
      view.grid = on;
      stage.setGrid(on);
      persistView();
      hooks.onView({ ...view });
    },
    setWireframe(on) {
      view.wireframe = on;
      stage.setWireframe(on);
      persistView();
      hooks.onView({ ...view });
    },
    setSmooth(on) {
      const ok = stage.setSmooth(on);
      if (!ok) {
        view.smooth = false;
        hooks.onStatus({
          tone: "error",
          text: "That mesh is too dense to smooth on this phone. It stays faceted.",
        });
      } else {
        view.smooth = on;
        hooks.onStatus(null);
      }
      persistView();
      hooks.onView({ ...view });
    },
    setStick(x, y) {
      stage.setStick(x, y);
    },
    setLift(v) {
      stage.setLift(v);
    },
    clearStatus() {
      hooks.onStatus(null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (window.__controlsTest === probe) delete window.__controlsTest;
      stage.dispose();
    },
  };

  const probe: ControlsProbe = {
    setKeys: (codes) => stage.setKeys(codes),
    setMode: (mode) => session.setMode(mode),
    getMode: () => stage.getMode(),
    getYaw: () => stage.getYaw(),
    getPosition: () => stage.getPosition(),
    placeForTest: () => stage.placeForTest(),
    loadSample: () => {
      void session.loadSample();
    },
    getTriangleCount: () => stage.getStats().triangles,
    whenReady: () => readyPromise,
  };
  window.__controlsTest = probe;

  stage.setGrid(view.grid);
  stage.setWireframe(view.wireframe);
  stage.setMode(view.mode);
  hooks.onView({ ...view });

  try {
    library = await openLibrary();
    if (signal.dead) {
      session.dispose();
      markReady();
      return session;
    }
    if (!library.persistent) {
      hooks.onStatus({
        tone: "error",
        text: "This browser won't keep files after you leave. They stay until the tab closes.",
      });
    }
    let failed = false;
    const records = await library.list();
    records.sort((a, b) => b.createdAt - a.createdAt);
    for (let i = 0; i < records.length; i++) {
      if (signal.dead) break;
      const record = records[i]!;
      hooks.onStatus({
        tone: "info",
        text: records.length > 1 ? `Opening ${i + 1} of ${records.length}` : "Opening shelf",
      });
      try {
        const geometry = parseStl(record.data);
        stage.add({
          id: record.id,
          geometry,
          color: PALETTE[record.colorIndex % PALETTE.length] ?? PALETTE[0],
          visible: record.visible,
          upAxis: record.upAxis,
        });
        models.push(toView(record, triangleCount(geometry), false));
      } catch {
        failed = true;
        hooks.onStatus({ tone: "error", text: `Couldn't read ${record.name}.` });
      }
      await yieldFrame();
    }
    if (view.smooth && !stage.setSmooth(true)) view.smooth = false;
    let hideSample = false;
    try {
      hideSample = localStorage.getItem(HIDE_SAMPLE_KEY) === "1";
    } catch {
      hideSample = false;
    }
    if (!signal.dead && models.length === 0 && !hideSample) {
      await showSample(true);
    } else if (models.some((model) => model.visible)) {
      stage.fit();
    }
    publish();
    if (!signal.dead && library.persistent && !failed) hooks.onStatus(null);
  } catch {
    hooks.onStatus({ tone: "error", text: "Couldn't open the shelf." });
  } finally {
    if (!signal.dead) hooks.onReady();
    markReady();
  }

  return session;
}
