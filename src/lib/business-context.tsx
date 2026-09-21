'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface BusinessItem {
  id: string
  name: string
  industry: string | null
  address?: string | null
  phone?: string | null
  timezone?: string | null
  slug?: string | null
  avgRating: number
  reviewCount: number
}

interface BusinessContextType {
  businesses: BusinessItem[]
  activeBusiness: BusinessItem | null
  activeBusinessId: string | null
  setActiveBusinessId: (id: string) => void
  loading: boolean
  refreshBusinesses: () => Promise<void>
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

const STORAGE_KEY = 'rr_active_business_id'

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<BusinessItem[]>([])
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshBusinesses = useCallback(async function doRefresh(isRetry = false): Promise<void> {
    try {
      const res = await fetch('/api/dashboard')
      if (res.ok) {
        const data = await res.json()
        const fetched: BusinessItem[] = data.businesses || []
        setBusinesses(fetched)

        if (fetched.length > 0) {
          const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
          const exists = fetched.some(b => b.id === stored)
          if (stored && exists) {
            setActiveBusinessIdState(stored)
          } else {
            setActiveBusinessIdState(fetched[0].id)
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_KEY, fetched[0].id)
            }
          }
        } else {
          setActiveBusinessIdState(null)
        }
      } else if (res.status === 503 && !isRetry) {
        // Database pool saturation transient retry after 400ms delay
        await new Promise((resolve) => setTimeout(resolve, 400))
        await doRefresh(true)
      }
    } catch (err) {
      console.error('[BUSINESS-CONTEXT] Failed to refresh tenant businesses:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    async function loadBusinesses(isRetry = false) {
      try {
        const res = await fetch('/api/dashboard')
        if (res.ok && !ignore) {
          const data = await res.json()
          const fetched: BusinessItem[] = data.businesses || []
          setBusinesses(fetched)

          if (fetched.length > 0) {
            const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
            const exists = fetched.some(b => b.id === stored)
            if (stored && exists) {
              setActiveBusinessIdState(stored)
            } else {
              setActiveBusinessIdState(fetched[0].id)
              if (typeof window !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, fetched[0].id)
              }
            }
          } else {
            setActiveBusinessIdState(null)
          }
        } else if (res.status === 503 && !isRetry) {
          // Database pool saturation transient retry after 400ms delay
          await new Promise((resolve) => setTimeout(resolve, 400))
          if (!ignore) {
            await loadBusinesses(true)
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error('[BUSINESS-CONTEXT] Failed to load tenant businesses:', err)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadBusinesses()
    return () => {
      ignore = true
    }
  }, [])



  const setActiveBusinessId = useCallback((id: string) => {
    // Client-side guard: ID must belong to the tenant's loaded businesses
    setBusinesses(current => {
      const valid = current.some(b => b.id === id)
      if (valid) {
        setActiveBusinessIdState(id)
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, id)
        }
      }
      return current
    })
  }, [])

  const activeBusiness = businesses.find(b => b.id === activeBusinessId) || businesses[0] || null

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        activeBusiness,
        activeBusinessId: activeBusiness?.id || null,
        setActiveBusinessId,
        loading,
        refreshBusinesses,
      }}
    >
      {children}
    </BusinessContext.Provider>
  )
}

export function useActiveBusiness() {
  const ctx = useContext(BusinessContext)
  if (!ctx) {
    throw new Error('useActiveBusiness must be used within a BusinessProvider')
  }
  return ctx
}
