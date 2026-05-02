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
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

// Eight compass directions the camera can orbit to. Y stays at the layout's
// configured camera height; only the azimuth around the scene origin changes.
// `S` is the default (matches the initial layout config) — viewer looks at
// the floorplan from the south, with the map's "top" oriented away from them.
export type CameraDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

type Cell = {
  dir: CameraDirection | null
  Icon: ComponentType<SVGProps<SVGSVGElement>> | null
  label: string
}

// Layout in screen-space sense: top row of the picker = views from "up" /
// north; bottom row = views from "down" / south; etc. So the visible arrow
// points where the camera will be after clicking.
const CELLS: Cell[] = [
  { dir: 'NW', Icon: ArrowUpLeft, label: 'View from northwest' },
  { dir: 'N', Icon: ArrowUp, label: 'View from north' },
  { dir: 'NE', Icon: ArrowUpRight, label: 'View from northeast' },
  { dir: 'W', Icon: ArrowLeft, label: 'View from west' },
  { dir: null, Icon: null, label: '' },
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
        {CELLS.map((cell, i) => {
          if (!cell.dir || !cell.Icon) {
            // Center cell is intentionally empty so the picker reads as a
            // little compass / view-cube indicator.
            return (
              <div
                key={`empty-${i}`}
                className="flex h-8 w-8 items-center justify-center text-gray-400"
                aria-hidden="true"
              >
                <span className="block h-1.5 w-1.5 rounded-full bg-gray-300" />
              </div>
            )
          }
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
              onClick={() => onChange(cell.dir as CameraDirection)}
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
