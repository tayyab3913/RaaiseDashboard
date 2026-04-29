'use client'

import { useState } from 'react'
import { Text } from '@react-three/drei'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

type Kind = 'room' | 'corridor' | 'door'

type LabelDef = {
  id: string
  x: number
  y: number
  kind: Kind
}

// Match the original layout_map's color convention:
//   rooms     -> dark gray   (matches the "A##" labels printed on the map)
//   corridors -> teal/blue   (matches the "C##" labels)
//   doors     -> magenta     (matches the "P##" labels)
const PALETTE: Record<Kind, { base: string; hover: string }> = {
  room: { base: '#374151', hover: '#f59e0b' },
  corridor: { base: '#3b82f6', hover: '#f59e0b' },
  door: { base: '#a855f7', hover: '#f59e0b' },
}

// Slightly different default sizes per kind so room labels read as primary
// and door labels stay quiet — same hierarchy as the printed floorplan.
const FONT_SIZE: Record<Kind, number> = {
  room: 0.22,
  corridor: 0.18,
  door: 0.14,
}

const LABEL_Y = 0.04   // millimetric lift to avoid z-fighting with the ground
const HOVER_SCALE = 1.35

function FloorLabel({ id, x, y, kind }: LabelDef) {
  const [hovered, setHovered] = useState(false)
  const [worldX, worldZ] = pctToWorld(x, y)
  const palette = PALETTE[kind]
  const size = FONT_SIZE[kind]

  return (
    <Text
      position={[worldX, LABEL_Y, worldZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={size}
      color={hovered ? palette.hover : palette.base}
      anchorX="center"
      anchorY="middle"
      outlineWidth={hovered ? 0.012 : 0}
      outlineColor="#1f2937"
      scale={hovered ? HOVER_SCALE : 1}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {id}
    </Text>
  )
}

export function Labels() {
  const labels = (layout as { labels?: LabelDef[] }).labels ?? []
  return (
    <>
      {labels.map((l) => (
        <FloorLabel key={l.id} {...l} />
      ))}
    </>
  )
}
