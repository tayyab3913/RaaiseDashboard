'use client'

import { useState, useEffect } from 'react'
import { Activity, Radio } from 'lucide-react'

type Sensor = {
  SENSORID: string
  TIMESTAMP: string
}

type SensorStatus = 'Active' | 'Inactive' | 'Offline'

type SensorWithStatus = Sensor & {
  status: SensorStatus
}

// ---------------------------------------------------------------------------
// Static legend data. Driven from a list (instead of repeated inline JSX) so
// the legend stays consistent and easy to extend.
// ---------------------------------------------------------------------------
const AMBIENT_SYSTEMS: { label: string; swatchClass: string }[] = [
  { label: 'NFC AC (NFxx)', swatchClass: 'bg-lime-500' },
  { label: 'RFID T&T (RFxx)', swatchClass: 'bg-cyan-500' },
  { label: 'FP AC (FPxx)', swatchClass: 'bg-orange-500' },
  { label: 'PIR MD (PSxx)', swatchClass: 'bg-pink-500' },
  { label: 'CCTV T&T (CCxx)', swatchClass: 'bg-yellow-500' },
  { label: 'WiFi PS (WPxx)', swatchClass: 'bg-gray-500' },
]

const USER_TYPES: {
  label: string
  ringClass: string
  dotClass: string
}[] = [
  { label: 'Authorized User', ringClass: 'bg-blue-200', dotClass: 'bg-blue-500' },
  { label: 'Unauthorized User', ringClass: 'bg-pink-200', dotClass: 'bg-pink-500' },
  { label: 'Intruder', ringClass: 'bg-teal-200', dotClass: 'bg-teal-500' },
  { label: 'Unknown', ringClass: 'bg-gray-200', dotClass: 'bg-gray-500' },
]

// ---------------------------------------------------------------------------
// Status pill for the reed point list. Soft tinted background + matching
// text colour reads like a chip rather than competing with the SENSORID.
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<SensorStatus, string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  Inactive: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Offline: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

function StatusPill({ status }: { status: SensorStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      {status === 'Active' && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section card — shared chrome (header + body) so legend and sensor list
// share the same visual weight inside the sidebar.
// ---------------------------------------------------------------------------
function SectionCard({
  title,
  icon,
  children,
  bodyClassName = 'p-3',
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  bodyClassName?: string
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        {icon && <span className="text-slate-500">{icon}</span>}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
          {title}
        </h3>
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export default function SensorList({ sensors }: { sensors: Sensor[] }) {
  const [sensorsWithStatus, setSensorsWithStatus] = useState<SensorWithStatus[]>([])

  useEffect(() => {
    const updateStatus = () => {
      const currentTime = new Date().getTime()
      const updatedSensors = sensors.map(sensor => {
        const sensorTime = new Date(sensor.TIMESTAMP).getTime()
        const timeDifference = currentTime - sensorTime

        let status: SensorStatus
        if (timeDifference <= 15000) {
          status = 'Active'
        } else if (timeDifference <= 20000) {
          status = 'Inactive'
        } else {
          status = 'Offline'
        }

        return { ...sensor, status }
      })
      setSensorsWithStatus(updatedSensors)
    }

    updateStatus()
    const intervalId = setInterval(updateStatus, 1000)

    return () => clearInterval(intervalId)
  }, [sensors])

  // Active count for the reed-points header — small but useful "live" signal.
  const activeCount = sensorsWithStatus.filter((s) => s.status === 'Active').length

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Sidebar header — sets a consistent visual anchor and matches the
          dark header bar above by leaning into a clean monochrome palette. */}
      <div className="border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Dashboard
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-slate-900">
          Legend & Sensors
        </h2>
      </div>

      {/* Scrollable body — flex-1 + min-h-0 is the canonical recipe for
          letting an inner scroller shrink correctly inside a flex column. */}
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3">
        <SectionCard title="Ambient Systems">
          <ul className="space-y-1.5">
            {AMBIENT_SYSTEMS.map(({ label, swatchClass }) => (
              <li key={label} className="flex items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-sm shadow-sm ${swatchClass}`}
                />
                <span className="text-xs text-slate-700">{label}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Users">
          <ul className="space-y-1.5">
            {USER_TYPES.map(({ label, ringClass, dotClass }) => (
              <li key={label} className="flex items-center gap-2.5">
                <span
                  className={`flex-shrink-0 rounded-full p-1 ${ringClass}`}
                >
                  <span className={`block h-1.5 w-1.5 rounded-full ${dotClass}`} />
                </span>
                <span className="text-xs text-slate-700">{label}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Reed Points"
          icon={<Radio className="h-3.5 w-3.5" />}
          bodyClassName=""
        >
          {/* Live count strip just under the header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
            <span>{sensorsWithStatus.length} total</span>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <Activity className="h-3 w-3" />
              {activeCount} active
            </span>
          </div>

          {sensorsWithStatus.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">No sensors loaded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sensorsWithStatus.map((sensor) => (
                <li
                  key={sensor.SENSORID}
                  className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-slate-50"
                >
                  <span className="font-mono text-xs font-semibold text-slate-800">
                    {sensor.SENSORID}
                  </span>
                  <StatusPill status={sensor.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
