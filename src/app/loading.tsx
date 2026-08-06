export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] flex items-center justify-center animate-pulse">
          <div className="w-4 h-4 rounded-full bg-white/30" />
        </div>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-[var(--brass)] animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-[var(--brass)] animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-[var(--brass)] animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-xs text-muted-foreground font-mono">Loading...</p>
      </div>
    </div>
  )
}
