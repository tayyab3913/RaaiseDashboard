'use client'

import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Crosshair,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

// Eight compass directions + a top-down view. The compass directions orbit
// the camera around the scene at a fixed height; `TOP` lifts the camera
// straight overhead and points it down for a true plan view (matches the
// original 2D layout image orientation, north up). `S` is the default —
// viewer looks at the floorplan from the south, map's "top" oriented away.
export type CameraDirection =
  | 'N'
  | 'NE'
  | 'E'
  | 'SE'
  | 'S'
  | 'SW'
  | 'W'
  | 'NW'
  | 'TOP'

type Cell = {
  dir: CameraDirection
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
}

// Layout in screen-space sense: top row of the picker = views from "up" /
// north; bottom row = views from "down" / south; etc. So the visible arrow
// points where the camera will be after clicking. The centre cell is the
// top-down ("from above") view.
const CELLS: Cell[] = [
  { dir: 'NW', Icon: ArrowUpLeft, label: 'View from northwest' },
  { dir: 'N', Icon: ArrowUp, label: 'View from north' },
  { dir: 'NE', Icon: ArrowUpRight, label: 'View from northeast' },
  { dir: 'W', Icon: ArrowLeft, label: 'View from west' },
  { dir: 'TOP', Icon: Crosshair, label: 'Top-down view' },
  { dir: 'E', Icon: ArrowRight, label: 'View from east' },
  { dir: 'SW', Icon: ArrowDownLeft, label: 'View from southwest' },
  { dir: 'S', Icon: ArrowDown, label: 'View from south (default)' },
  { dir: 'SE', Icon: ArrowDownRight, label: 'View from southeast' },
]

type Props = {
  value: CameraDirection
  onChange: (d: CameraDirection) => void
}

export function CameraDirectionPicker({ value, onChange }: Props) {
  return (
    <div
      className="absolute top-3 right-3 z-20 select-none rounded-md border border-gray-300 bg-white/95 p-1.5 shadow-md backdrop-blur-sm"
      title="Camera angle"
    >
      <div className="grid grid-cols-3 gap-1">
        {CELLS.map((cell) => {
          const Icon = cell.Icon
          const active = cell.dir === value
          return (
            <button
              key={cell.dir}
              type="button"
              title={cell.label}
              aria-label={cell.label}
              aria-pressed={active}
              disabled={active}
              onClick={() => onChange(cell.dir)}
              className={
                active
                  ? 'flex h-8 w-8 cursor-not-allowed items-center justify-center rounded bg-amber-400 text-gray-900 shadow-inner ring-1 ring-amber-500'
                  : 'flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-gray-700 transition-colors hover:bg-amber-200 hover:text-gray-900'
              }
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
