'use client'
import { useEffect, useRef, useState } from 'react'

interface StatCounterProps {
  end: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
}

export default function StatCounter({
  end,
  duration = 1800,
  prefix = '',
  suffix = '',
  decimals = 0,
}: StatCounterProps) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && !started.current) {
          started.current = true
          const startTime = performance.now()
          const tick = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setCount(parseFloat((eased * end).toFixed(decimals)))
            if (progress < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [end, duration, decimals])

  return (
    <span ref={ref}>
      {prefix}{count.toFixed(decimals)}{suffix}
    </span>
  )
}