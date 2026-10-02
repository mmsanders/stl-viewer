/** Mesh colors — distinct on the dark stage, not UI chrome. */
export const PALETTE = [
  "#c4b8a5",
  "#9eb4c4",
  "#b7c4a8",
  "#d2b49a",
  "#c3b4be",
  "#aeb6bf",
] as const;

export const STAGE = {
  background: 0x0c0e11,
  gridCenter: 0x5a6772,
  gridLine: 0x2c333b,
  hemiSky: 0xd7dee6,
  hemiGround: 0x1a1d21,
  key: 0xfff6ee,
  rim: 0x9eb4c4,
  fill: 0xc4b8a5,
} as const;
