'use client'

type PathTestPanelProps = {
  locations: string[]
  exitLocations: string[]
  currentLocation: string
  signalLost: boolean
  onJump: (location: string) => void
  onLoseSignal: () => void
  onSimulateExit: () => void
  onClose: () => void
}

// Floating control panel for the Path Test debug mode. Drives a single
// synthetic avatar through the exact same code path real sensor data would
// (Map.tsx status aging + Avatar.tsx pathfinding/despawn), so what plays out
// here is what the deployed build will actually do — useful for previewing
// routes on floors nobody can walk in person.
export function PathTestPanel({
  locations,
  exitLocations,
  currentLocation,
  signalLost,
  onJump,
  onLoseSignal,
  onSimulateExit,
  onClose,
}: PathTestPanelProps) {
  const exitSet = new Set(exitLocations)

  return (
    <div
      className="absolute bottom-4 right-4 z-30 w-72 rounded-xl border border-amber-300 bg-white/95 shadow-lg backdrop-blur-sm"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 rounded-t-xl">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-900">
          Path Test
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close path test"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-800 transition-colors hover:bg-amber-300"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">Current</span>
          <span className="font-semibold text-slate-800">{currentLocation}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">Signal</span>
          <span className={`font-semibold ${signalLost ? 'text-rose-600' : 'text-emerald-600'}`}>
            {signalLost ? 'Lost — ageing…' : 'Live'}
          </span>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-500">Jump to location</span>
          <select
            value={currentLocation}
            onChange={(e) => onJump(e.target.value)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            {locations.map((code) => (
              <option key={code} value={code}>
                {code}
                {exitSet.has(code) ? ' (exit)' : ''}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[11px] leading-snug text-slate-500">
          Jumping computes a route through doors/pathways and walks it. Losing
          signal freezes the avatar in place — at an exit sensor it fades out
          after a few seconds; anywhere else it just stays frozen.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLoseSignal}
            disabled={signalLost}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Lose signal here
          </button>
          <button
            type="button"
            onClick={onSimulateExit}
            className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-100"
          >
            Simulate exit
          </button>
        </div>
      </div>
    </div>
  )
}
