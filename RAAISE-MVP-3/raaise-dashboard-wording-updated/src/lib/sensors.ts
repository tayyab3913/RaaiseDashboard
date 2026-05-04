// Shared sensor data + visual helpers. Used by both the 3D scene (to render
// physical sensor pylons) and any 2D fallback / sidebar UI. Keeping these
// constants in one place avoids the position table drifting between the
// 2D overlay and the 3D markers.

export type SensorStatus = 'Active' | 'Inactive' | 'Offline'

export type Sensor = {
  SENSORID: string
  TIMESTAMP: string
  LOCATION: string
  CONTROL_ACCESS: string
  CAN_AUTHENTICATE: string
  ENTRY_AND_EXIT: string
  SECURITY_LEVEL: string | null
}

export type SensorWithStatus = Sensor & {
  status: SensorStatus
}

// Percentage positions over layout_map.png (0,0 = top-left, 100,100 = bottom-
// right). Same convention as pctToWorld(), so plugging these straight into
// pctToWorld(...) gives world coordinates the 3D scene can use. Originally
// hand-tuned in the legacy 2D overlay; preserved verbatim so the 3D pylons
// land in the exact same spots the 2D markers did.
export const SENSOR_POSITIONS: Record<string, { x: number; y: number }> = {
  A:   { x: 81,   y: 58 },
  A01: { x: 5,    y: 58 },
  A02: { x: 39,   y: 71 },
  A03: { x: 42,   y: 93 },
  A04: { x: 53.5, y: 82 },
  A05: { x: 71,   y: 86 },
  A06: { x: 76.5, y: 75 },
  A07: { x: 81,   y: 58 },
  A08: { x: 92,   y: 30 },
  A09: { x: 92,   y: 10 },
  A10: { x: 43,   y: 42 },
  A11: { x: 66.5, y: 58 },
  A12: { x: 80,   y: 55 },
  A13: { x: 67,   y: 17 },
  A14: { x: 59,   y: 17 },
  A15: { x: 51,   y: 17 },
  A16: { x: 43,   y: 17 },
  A17: { x: 26,   y: 22 },
  P01: { x: 12,   y: 65 },
  P15: { x: 62.5, y: 62.5 },
  P24: { x: 78.5, y: 54 },
  P33: { x: 73,   y: 11 },
  P43: { x: 64.5, y: 11 },
  P45: { x: 60,   y: 73 },
  P53: { x: 56.5, y: 11 },
  P56: { x: 65.5, y: 94 },
  P63: { x: 49,   y: 11 },
  P64: { x: 81,   y: 68 },
  P74: { x: 81,   y: 63 },
  P84: { x: 80,   y: 42 },
  P94: { x: 80,   y: 15 },
  C01: { x: 18.5, y: 8 },
  C02: { x: 28,   y: 8 },
  C03: { x: 82,   y: 10 },
  C04: { x: 84,   y: 10 },
  C05: { x: 78,   y: 73 },
  C06: { x: 63,   y: 90 },
}

export function getSensorPosition(location: string): { x: number; y: number } {
  return SENSOR_POSITIONS[location] ?? { x: 2, y: 30 }
}

// Two-letter prefix on the SENSORID encodes the type. Used to pick both the
// colour and the head-shape in the 3D pylon.
//   NF → near-field access control reader
//   RF → RFID track-and-trace antenna
//   FP → fingerprint access control reader
//   PS → motion / presence detector
//   CC → CCTV camera
//   WP → WiFi positioning puck
export type SensorType = 'NF' | 'RF' | 'FP' | 'PS' | 'CC' | 'WP'

export function sensorTypeOf(sensorId: string): SensorType {
  const code = sensorId.slice(0, 2).toUpperCase() as SensorType
  return code
}

export type SensorVisual = {
  /** Diffuse colour for the sensor head. */
  base: string
  /** Emissive colour — same hue, slightly brighter; reads as "powered on". */
  emissive: string
  /** 0 = no glow (Inactive/Offline), ~0.55 when Active. */
  emissiveIntensity: number
}

// Active state — saturated tone + emissive glow.
const ACTIVE_VISUAL: Record<SensorType, SensorVisual> = {
  NF: { base: '#84cc16', emissive: '#a3e635', emissiveIntensity: 0.55 },
  RF: { base: '#06b6d4', emissive: '#22d3ee', emissiveIntensity: 0.55 },
  FP: { base: '#f97316', emissive: '#fb923c', emissiveIntensity: 0.55 },
  PS: { base: '#ec4899', emissive: '#f472b6', emissiveIntensity: 0.55 },
  CC: { base: '#eab308', emissive: '#facc15', emissiveIntensity: 0.55 },
  WP: { base: '#6b7280', emissive: '#9ca3af', emissiveIntensity: 0.30 },
}

// Inactive state — pastel tone, no emissive (matches the legacy "300" shade).
const INACTIVE_VISUAL: Record<SensorType, SensorVisual> = {
  NF: { base: '#bef264', emissive: '#000000', emissiveIntensity: 0 },
  RF: { base: '#67e8f9', emissive: '#000000', emissiveIntensity: 0 },
  FP: { base: '#fdba74', emissive: '#000000', emissiveIntensity: 0 },
  PS: { base: '#f9a8d4', emissive: '#000000', emissiveIntensity: 0 },
  CC: { base: '#fde047', emissive: '#000000', emissiveIntensity: 0 },
  WP: { base: '#d1d5db', emissive: '#000000', emissiveIntensity: 0 },
}

const OFFLINE_VISUAL: SensorVisual = {
  base: '#9ca3af',
  emissive: '#000000',
  emissiveIntensity: 0,
}

export function sensorVisual(type: SensorType, status: SensorStatus): SensorVisual {
  if (status === 'Offline') return OFFLINE_VISUAL
  if (status === 'Active') return ACTIVE_VISUAL[type] ?? OFFLINE_VISUAL
  return INACTIVE_VISUAL[type] ?? OFFLINE_VISUAL
}
