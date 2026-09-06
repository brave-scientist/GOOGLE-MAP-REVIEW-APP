'use client'

import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Star, Printer, Download, ExternalLink, Sparkles } from 'lucide-react'

interface PrintableQrKitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessName: string
  qrDataUrl: string | null
  targetUrl: string | null
  platforms: Array<{ name: string; iconUrl?: string | null }>
  headline?: string
}

export function PrintableQrKitModal({
  open,
  onOpenChange,
  businessName,
  qrDataUrl,
  targetUrl,
  platforms,
  headline,
}: PrintableQrKitModalProps) {
  const printContainerRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `review-qr-${businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="w-4 h-4 text-[var(--brass)]" />
            Printable Table-Tent & Countertop QR Kit
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Print this 4x6&quot; / 5x7&quot; countertop card and place it at checkout, dining tables, reception desks, or service counters.
          </DialogDescription>
        </DialogHeader>

        {/* The Printable Card Canvas */}
        <div className="flex justify-center p-2 bg-muted/40 rounded-xl border border-border/40 overflow-hidden">
          <div
            id="printable-countertop-card"
            ref={printContainerRef}
            className="w-full max-w-[360px] bg-card text-card-foreground border-2 border-[var(--brass)]/50 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden my-2"
            style={{
              fontFamily: 'inherit',
            }}
          >
            {/* Top decorative badge */}
            <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md mb-3">
              <Star className="w-6 h-6 text-white fill-white" />
            </div>

            <div className="text-xs uppercase tracking-widest text-[var(--brass)] font-semibold mb-1">
              We Value Your Feedback
            </div>

            <h3 className="text-lg font-bold tracking-tight text-foreground line-clamp-2 mb-1">
              {headline || 'How was your experience?'}
            </h3>

            <p className="text-xs text-muted-foreground mb-4">
              Review <span className="font-semibold text-foreground">{businessName}</span>
            </p>

            {/* QR Code Container */}
            <div className="p-3 bg-white rounded-xl inline-block shadow-md border border-border/60 mb-4">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Scan to Review Us"
                  className="w-48 h-48 mx-auto"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-muted-foreground">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="text-xs font-semibold text-foreground mb-1">
              Point your phone camera &amp; tap to review
            </div>
            <p className="text-[10px] text-muted-foreground mb-4">
              No app download required. Choose your favorite platform.
            </p>

            {/* Platform pill badges */}
            {platforms.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-3 border-t border-border/40 mb-3">
                {platforms.slice(0, 5).map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/60 text-foreground border border-border/40"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            )}

            <div className="text-[9px] text-muted-foreground/60">
              Powered by ReviewReply
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download PNG
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePrint}
              className="text-xs bg-[var(--brass)] hover:bg-[var(--brass-dark)] text-white"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print Table Tent
            </Button>
          </div>
        </div>

        {/* Scoped print stylesheet */}
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #printable-countertop-card,
            #printable-countertop-card * {
              visibility: visible !important;
            }
            #printable-countertop-card {
              position: fixed !important;
              left: 50% !important;
              top: 50% !important;
              transform: translate(-50%, -50%) !important;
              width: 4in !important;
              max-width: 4in !important;
              border: 2px solid #C4A484 !important;
              box-shadow: none !important;
              background-color: white !important;
              color: black !important;
              padding: 1.5rem !important;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}
