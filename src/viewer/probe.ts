import type { CameraMode } from "@/viewer/types";

export type ControlsProbe = {
  setKeys: (codes: string[]) => void;
  setMode: (mode: CameraMode) => void;
  getMode: () => CameraMode;
  getYaw: () => number;
  getPosition: () => { x: number; y: number; z: number };
  placeForTest: () => void;
  loadSample: () => void;
  getTriangleCount: () => number;
  whenReady: () => Promise<void>;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
