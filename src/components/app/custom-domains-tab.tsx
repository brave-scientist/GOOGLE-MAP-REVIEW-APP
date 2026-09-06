'use client'

import { useEffect, useState } from 'react'
import { Globe, Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle, Info, Clock, ExternalLink } from 'lucide-react'

interface CustomDomainItem {
  id: string
  domain: string
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'FAILED' | 'REVOKED'
  verificationToken: string
  cnameTarget: string
  verifiedAt: string | null
  lastCheckedAt: string | null
  sslStatus: 'PENDING' | 'ACTIVE' | 'FAILED'
  createdAt: string
}

export function CustomDomainsTab() {
  const [domains, setDomains] = useState<CustomDomainItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/agency/domains')
      const json = await res.json()
      if (res.ok && json.domains) {
        setDomains(json.domains)
      }
    } catch {
      setError('Failed to load custom domains')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        const res = await fetch('/api/agency/domains')
        const json = await res.json()
        if (ignore) return
        if (res.ok && json.domains) {
          setDomains(json.domains)
        }
      } catch {
        if (!ignore) setError('Failed to load custom domains')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDomain.trim()) return

    setAdding(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/agency/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim() }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to add custom domain')
      } else {
        setSuccess(`Custom domain ${json.domain.domain} registered! Set up CNAME record below.`)
        setNewDomain('')
        fetchDomains()
      }
    } catch {
      setError('An unexpected error occurred while adding domain.')
    } finally {
      setAdding(false)
    }
  }

  const handleVerify = async (id: string) => {
    setVerifyingId(id)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/agency/domains/${id}/verify`, { method: 'POST' })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to verify domain')
      } else {
        setSuccess(json.message)
        fetchDomains()
      }
    } catch {
      setError('An error occurred while verifying domain DNS.')
    } finally {
      setVerifyingId(null)
    }
  }

  const handleDelete = async (id: string, domainName: string) => {
    if (!confirm(`Are you sure you want to remove domain ${domainName}?`)) return

    try {
      const res = await fetch(`/api/agency/domains/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSuccess(`Domain ${domainName} removed.`)
        fetchDomains()
      } else {
        const json = await res.json()
        setError(json.error || 'Failed to delete domain')
      }
    } catch {
      setError('An error occurred while deleting domain.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" /> Agency Custom Domains
          </h2>
          <p className="text-slate-500 text-sm">
            Serve white-label client portals and review pages under your agency's domain (e.g. <code className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-mono">reviews.youragency.com</code>).
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-xl text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Add Domain Form */}
      <form onSubmit={handleAddDomain} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Register Custom Domain</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="reviews.youragency.com"
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={adding}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {adding ? 'Adding...' : 'Add Domain'}
          </button>
        </div>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" /> Enter a valid subdomain pointing to your DNS management console.
        </p>
      </form>

      {/* Domain List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Registered Domains</h3>
          <span className="text-xs text-slate-500 font-medium">{domains.length} Domain(s)</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading custom domains...</div>
        ) : domains.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm space-y-2">
            <p>No custom domains registered yet.</p>
            <p className="text-xs text-slate-400">Add a custom subdomain above to get started with white-label hosting.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {domains.map((dom) => (
              <div key={dom.id} className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-base text-slate-900 font-mono">{dom.domain}</span>
                      {dom.status === 'VERIFIED' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                        </span>
                      )}
                      {dom.status === 'PENDING_VERIFICATION' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3.5 h-3.5" /> Pending DNS
                        </span>
                      )}
                      {dom.status === 'FAILED' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      SSL: <span className="font-medium text-slate-700">{dom.sslStatus}</span> • Added {new Date(dom.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleVerify(dom.id)}
                      disabled={verifyingId === dom.id}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${verifyingId === dom.id ? 'animate-spin' : ''}`} />
                      Check DNS
                    </button>
                    <button
                      onClick={() => handleDelete(dom.id, dom.domain)}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                      title="Delete domain"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* CNAME Instructions Card */}
                {dom.status !== 'VERIFIED' && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                    <div className="font-semibold text-slate-800 uppercase tracking-wider">DNS CNAME Setup Instructions:</div>
                    <p className="text-slate-600">
                      Log in to your domain registrar (GoDaddy, Namecheap, Cloudflare) and add the following record:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-3 rounded border border-slate-200 font-mono">
                      <div><span className="text-slate-400 block text-[10px]">TYPE</span> CNAME</div>
                      <div><span className="text-slate-400 block text-[10px]">HOST / NAME</span> {dom.domain.split('.')[0]}</div>
                      <div><span className="text-slate-400 block text-[10px]">VALUE / TARGET</span> {dom.cnameTarget}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
