export type UpAxis = "y" | "z";
export type CameraMode = "orbit" | "fly";

export type ModelView = {
  id: string;
  name: string;
  visible: boolean;
  color: string;
  colorIndex: number;
  upAxis: UpAxis;
  triangles: number;
  byteLength: number;
  ephemeral: boolean;
  createdAt: number;
};

export type ViewOptions = {
  grid: boolean;
  wireframe: boolean;
  smooth: boolean;
  mode: CameraMode;
};

export type SceneStats = {
  triangles: number;
  size: [number, number, number] | null;
  visibleCount: number;
};

export type StatusNote = {
  tone: "info" | "error";
  text: string;
} | null;

export const SAMPLE_ID = "sample";

export const DEFAULT_VIEW: ViewOptions = {
  grid: true,
  wireframe: false,
  smooth: false,
  mode: "orbit",
};
