'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { Star, ShieldCheck, ExternalLink, MessageSquare, AlertCircle, Building2 } from 'lucide-react'

interface PortalSummary {
  business: {
    id: string
    name: string
    industry?: string
    avgRating: number
    reviewCount: number
  }
  branding: {
    brandName?: string
    logoUrl?: string
    primaryColor?: string
    accentColor?: string
    supportEmail?: string
    portalTitle?: string
    hideReviewReplyBadge?: boolean
  }
  metrics: {
    avgRating: number
    totalReviews: number
    ratingCounts: Record<number, number>
  }
  reviews: Array<{
    id: string
    authorName: string
    authorAvatarUrl?: string
    rating: number
    text: string
    source: string
    draftStatus: string
    replyText?: string
    createdAt: string
  }>
}

export default function PublicClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const [data, setData] = useState<PortalSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [passcode, setPasscode] = useState('')
  const [passcodeRequired, setPasscodeRequired] = useState(false)

  const fetchSummary = useCallback(async (passcodeVal?: string) => {
    setError(null)
    try {
      let url = `/api/portal/${encodeURIComponent(token)}/summary`
      if (passcodeVal) {
        url += `?passcode=${encodeURIComponent(passcodeVal)}`
      }
      const res = await fetch(url)
      const json = await res.json()

      if (!res.ok) {
        if (json.code === 'PASSCODE_REQUIRED' || json.code === 'PASSCODE_INVALID') {
          setPasscodeRequired(true)
          if (json.code === 'PASSCODE_INVALID') {
            setError('Incorrect passcode. Please try again.')
          }
        } else {
          setError(json.error || 'Failed to load portal')
        }
        setLoading(false)
        return
      }

      setPasscodeRequired(false)
      setData(json)
    } catch {
      setError('An error occurred while connecting to portal.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        const res = await fetch(`/api/portal/${encodeURIComponent(token)}/summary`)
        const json = await res.json()
        if (ignore) return
        if (!res.ok) {
          if (json.code === 'PASSCODE_REQUIRED' || json.code === 'PASSCODE_INVALID') {
            setPasscodeRequired(true)
            if (json.code === 'PASSCODE_INVALID') {
              setError('Incorrect passcode. Please try again.')
            }
          } else {
            setError(json.error || 'Failed to load portal')
          }
          setLoading(false)
          return
        }
        setPasscodeRequired(false)
        setData(json)
      } catch {
        if (!ignore) setError('An error occurred while connecting to portal.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [token])

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (passcode.trim()) {
      fetchSummary(passcode.trim())
    }
  }

  const primaryColor = data?.branding?.primaryColor || '#1E40AF'
  const accentColor = data?.branding?.accentColor || '#3B82F6'

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 text-sm font-medium">Loading Client Portal...</p>
        </div>
      </div>
    )
  }

  if (passcodeRequired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Protected Client Portal</h1>
            <p className="text-slate-500 text-sm">Please enter the access passcode to view this report.</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Passcode
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Access Portal
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-slate-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Portal Link Unavailable</h1>
          <p className="text-slate-500 text-sm">{error || 'This portal link is invalid or has expired.'}</p>
        </div>
      </div>
    )
  }

  const { business, branding, metrics, reviews } = data

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Dynamic Header */}
      <header
        className="text-white shadow-md transition-colors"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.brandName || business.name} className="h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold text-lg">
                {branding.brandName?.[0] || business.name[0]}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold leading-tight">{branding.portalTitle || `${business.name} Review Performance`}</h1>
              <p className="text-xs text-white/80">{branding.brandName ? `Managed by ${branding.brandName}` : business.name}</p>
            </div>
          </div>
          {branding.supportEmail && (
            <a
              href={`mailto:${branding.supportEmail}`}
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 text-white"
            >
              Contact Support
            </a>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Business Overview Header Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-slate-500" />
              <h2 className="text-2xl font-bold text-slate-900">{business.name}</h2>
            </div>
            {business.industry && (
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{business.industry}</p>
            )}
          </div>

          <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-slate-900 flex items-center justify-center gap-1">
                {(metrics.avgRating || 0).toFixed(1)}
                <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
              </div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Average Rating</p>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-3xl font-extrabold text-slate-900">{metrics.totalReviews}</div>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Total Reviews</p>
            </div>
          </div>
        </div>

        {/* Rating Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4 md:col-span-1">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Rating Distribution</h3>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = metrics.ratingCounts?.[stars] || 0
                const percent = metrics.totalReviews ? Math.round((count / metrics.totalReviews) * 100) : 0
                return (
                  <div key={stars} className="flex items-center gap-3 text-xs">
                    <span className="w-8 font-medium text-slate-600 flex items-center gap-1">
                      {stars} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    </span>
                    <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percent}%`, backgroundColor: accentColor }}
                      />
                    </div>
                    <span className="w-8 text-right text-slate-500 font-mono">{percent}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-2 flex flex-col justify-center space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Reputation Overview</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              This client portal displays recent customer feedback, rating trends, and official response statuses for <span className="font-semibold text-slate-900">{business.name}</span>.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 font-medium">
                <ShieldCheck className="w-4 h-4" /> Live Aggregation Active
              </div>
            </div>
          </div>
        </div>

        {/* Recent Reviews Table/List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-500" /> Recent Customer Reviews
            </h3>
            <span className="text-xs text-slate-500 font-medium">Showing latest {reviews.length} reviews</span>
          </div>

          <div className="divide-y divide-slate-100">
            {reviews.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No reviews recorded yet for this location.</div>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="p-6 space-y-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                        {rev.authorName?.[0] || 'A'}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900">{rev.authorName}</div>
                        <div className="text-xs text-slate-400">{new Date(rev.createdAt).toLocaleDateString()} via {rev.source}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                        />
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed">{rev.text || <em className="text-slate-400">No review text provided.</em>}</p>

                  {rev.replyText && (
                    <div className="mt-3 p-3 bg-blue-50/60 border-l-4 border-blue-500 rounded-r-lg space-y-1">
                      <div className="text-xs font-semibold text-blue-900">Official Response:</div>
                      <p className="text-xs text-slate-700 leading-relaxed">{rev.replyText}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 bg-white text-center text-xs text-slate-500">
        {!branding.hideReviewReplyBadge ? (
          <p>Powered by <span className="font-semibold text-slate-700">ReviewReply Platform</span></p>
        ) : (
          <p>© {new Date().getFullYear()} {branding.brandName || business.name}. All rights reserved.</p>
        )}
      </footer>
    </div>
  )
}
