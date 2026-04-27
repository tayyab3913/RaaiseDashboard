import layout from '@/config/layouts/default-layout.json'

const { width, height } = layout.plane
const locations = layout.locations as Record<string, { x: number; y: number }>
const FALLBACK = { x: 2, y: 30 }

export function pctToWorld(pctX: number, pctY: number): [number, number] {
  return [
    (pctX / 100) * width - width / 2,
    (pctY / 100) * height - height / 2,
  ]
}

export function locationToVector3(code: string): [number, number, number] {
  const loc = locations[code] ?? FALLBACK
  const worldX = (loc.x / 100) * width - width / 2
  const worldZ = (loc.y / 100) * height - height / 2
  return [worldX, 0, worldZ]
}

// Spreads multiple avatars at the same location in a circle to avoid overlap
export function spreadOffset(index: number, total: number, radius: number): [number, number] {
  if (total <= 1) return [0, 0]
  const angle = (index / total) * 2 * Math.PI
  return [radius * Math.cos(angle), radius * Math.sin(angle)]
}
