'use client'

import { useEffect, useState } from 'react'
import { Save, Palette, Eye, AlertCircle, CheckCircle2, Building, Mail, Shield } from 'lucide-react'

interface BrandingData {
  brandName: string
  logoUrl: string
  faviconUrl: string
  primaryColor: string
  accentColor: string
  supportEmail: string
  portalTitle: string
  hideReviewReplyBadge: boolean
  emailSenderName: string
  replyToEmail: string
}

export function AgencyBrandingTab() {
  const [formData, setFormData] = useState<BrandingData>({
    brandName: '',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#1E40AF',
    accentColor: '#3B82F6',
    supportEmail: '',
    portalTitle: '',
    hideReviewReplyBadge: false,
    emailSenderName: '',
    replyToEmail: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let ignore = false
    const load = async () => {
      try {
        const res = await fetch('/api/agency/branding')
        const json = await res.json()
        if (ignore) return
        if (res.ok && json.branding) {
          setFormData({
            brandName: json.branding.brandName || '',
            logoUrl: json.branding.logoUrl || '',
            faviconUrl: json.branding.faviconUrl || '',
            primaryColor: json.branding.primaryColor || '#1E40AF',
            accentColor: json.branding.accentColor || '#3B82F6',
            supportEmail: json.branding.supportEmail || '',
            portalTitle: json.branding.portalTitle || '',
            hideReviewReplyBadge: Boolean(json.branding.hideReviewReplyBadge),
            emailSenderName: json.branding.emailSenderName || '',
            replyToEmail: json.branding.replyToEmail || '',
          })
        }
      } catch {
        if (!ignore) setMessage({ type: 'error', text: 'Failed to load agency branding settings' })
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/agency/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const json = await res.json()

      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Failed to save branding' })
      } else {
        setMessage({ type: 'success', text: 'Agency branding settings saved successfully!' })
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Loading branding configuration...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Palette className="w-5 h-5 text-blue-600" /> Agency White-Label Branding
          </h2>
          <p className="text-slate-500 text-sm">
            Customize branding, themes, logos, and sender identities across client portals and reports.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Controls */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
              <Building className="w-4 h-4 text-slate-500" /> Brand Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Agency Brand Name</label>
                <input
                  type="text"
                  value={formData.brandName}
                  onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                  placeholder="Apex Marketing Agency"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client Portal Title</label>
                <input
                  type="text"
                  value={formData.portalTitle}
                  onChange={(e) => setFormData({ ...formData, portalTitle: e.target.value })}
                  placeholder="Apex Client Portal"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                  placeholder="https://cdn.example.com/logo.png"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Support Email</label>
                <input
                  type="email"
                  value={formData.supportEmail}
                  onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                  placeholder="support@apexagency.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
              <Palette className="w-4 h-4 text-slate-500" /> Color Theme
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Primary Header Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded border border-slate-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Accent Highlight Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.accentColor}
                    onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                    className="w-10 h-10 rounded border border-slate-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={formData.accentColor}
                    onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
              <Mail className="w-4 h-4 text-slate-500" /> Email Sender Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Sender Name</label>
                <input
                  type="text"
                  value={formData.emailSenderName}
                  onChange={(e) => setFormData({ ...formData, emailSenderName: e.target.value })}
                  placeholder="Apex Review Team"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reply-To Email</label>
                <input
                  type="email"
                  value={formData.replyToEmail}
                  onChange={(e) => setFormData({ ...formData, replyToEmail: e.target.value })}
                  placeholder="reviews@apexagency.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hideReviewReplyBadge}
                  onChange={(e) => setFormData({ ...formData, hideReviewReplyBadge: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-slate-700">Hide "Powered by ReviewReply" footer badge (White-Label)</span>
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Branding Settings'}
            </button>
          </div>
        </form>

        {/* Live Preview Column */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" /> Live Header Preview
          </h3>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div
              className="p-4 text-white transition-colors"
              style={{ backgroundColor: formData.primaryColor || '#1E40AF' }}
            >
              <div className="flex items-center gap-3">
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" className="h-8 object-contain" />
                ) : (
                  <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center font-bold text-sm">
                    {formData.brandName?.[0] || 'A'}
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">{formData.portalTitle || 'Client Portal Preview'}</div>
                  <div className="text-[10px] text-white/80">{formData.brandName ? `Managed by ${formData.brandName}` : 'Sample Location'}</div>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-2 text-xs text-slate-600">
              <div className="flex items-center justify-between font-medium">
                <span>Sample Accent Highlight:</span>
                <span
                  className="px-2 py-0.5 text-white rounded text-[10px] font-bold"
                  style={{ backgroundColor: formData.accentColor || '#3B82F6' }}
                >
                  Active Theme
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Sender Name: {formData.emailSenderName || 'Default Team'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
