import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Star, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg px-4">
      <div className="absolute inset-0 grid-overlay opacity-30" />
      <div className="relative text-center max-w-md">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center shadow-md shadow-[var(--brass)]/30">
            <Star className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-display font-bold">ReviewReply</span>
        </Link>

        <div className="font-display text-8xl font-bold text-gradient-brass mb-4">404</div>
        <h1 className="font-display text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          The page you are looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Go home
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" className="glass-card w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
