'use client'

import { useEffect, useState } from 'react'
import { Bell, ChevronDown, ChevronUp, Inbox } from 'lucide-react'

type Message = {
  id: number
  Message: string
  Counter: number
  Priority: number
  Timestamp: string
}

type MessageWithStatus = Message & {
  status: 'Active' | 'Expired'
}

const PRIORITY_STYLES: Record<number, string> = {
  4: 'border-l-4 border-l-red-500 bg-red-50/80 text-red-900 ring-1 ring-red-100',
  3: 'border-l-4 border-l-orange-500 bg-orange-50/80 text-orange-900 ring-1 ring-orange-100',
  2: 'border-l-4 border-l-amber-500 bg-amber-50/80 text-amber-900 ring-1 ring-amber-100',
  1: 'border-l-4 border-l-slate-700 bg-slate-50 text-slate-900 ring-1 ring-slate-200',
}

function priorityLabel(p: number): string {
  switch (p) {
    case 4:
      return 'Critical'
    case 3:
      return 'High'
    case 2:
      return 'Medium'
    case 1:
      return 'Low'
    default:
      return 'Info'
  }
}

export default function DashboardMessages({ messages, open = true, onToggle }: { messages: Message[]; open?: boolean; onToggle?: () => void }) {
  const [displayMessages, setDisplayMessages] = useState<MessageWithStatus[]>([])

  useEffect(() => {
    const updateMessageStatus = () => {
      const currentTime = new Date().getTime()
      const updatedMessages = messages.map((message) => {
        const messageTime = new Date(message.Timestamp).getTime()
        const elapsedTime = currentTime - messageTime
        const remainingTime = message.Counter * 1000 - elapsedTime
        const status: 'Active' | 'Expired' = remainingTime > 0 ? 'Active' : 'Expired'
        return { ...message, status }
      })
      const activeMessages = updatedMessages.filter((msg) => msg.status === 'Active')
      setDisplayMessages(activeMessages)
    }

    updateMessageStatus()
    const intervalId = setInterval(updateMessageStatus, 1000)

    return () => clearInterval(intervalId)
  }, [messages])

  return (
    <div className="w-full min-w-0 flex-shrink-0 border-t border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-3 py-2">
      <section className="mx-auto max-w-[1800px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 bg-slate-50/80 px-3 py-2 border-b border-slate-100">
          <Bell className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">
            Notifications / Alerts
          </h3>
          {displayMessages.length > 0 && (
            <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200">
              {displayMessages.length} active
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? 'Hide notifications' : 'Show notifications'}
            aria-pressed={open}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </header>

        {open && <div className="max-h-[min(12rem,30vh)] overflow-y-auto">
          {displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center sm:py-7">
              <Inbox className="h-8 w-8 text-slate-300 sm:h-9 sm:w-9" aria-hidden />
              <p className="text-sm font-medium text-slate-600">No active notifications</p>
              <p className="max-w-sm text-xs leading-snug text-slate-500">
                New alerts will appear here when they arrive from the system.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {displayMessages.map((msg) => {
                const rowStyle =
                  PRIORITY_STYLES[msg.Priority] ?? 'border-l-4 border-l-slate-400 bg-slate-50 text-slate-700 ring-1 ring-slate-100'
                return (
                  <li key={msg.id} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${rowStyle}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>{msg.Message}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {priorityLabel(msg.Priority)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>}
      </section>
    </div>
  )
}
