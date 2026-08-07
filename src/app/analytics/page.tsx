'use client'

import { useState, useEffect } from 'react'
import { AppSidebar, AppTopbar, MobileNav } from '@/components/app/sidebar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart3, Clock, TrendingUp, MessageSquare, Star, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AnalyticsData {
  topicAnalysis: Array<{ topic: string; count: number; avgSentiment: number; avgRating: number }>
  sourceBreakdown: Array<{ source: string; count: number; avgRating: number }>
  sentimentDistribution: { positive: number; neutral: number; negative: number }
  avgResponseHours: number
  totalReviewsAnalyzed: number
  sentimentSource?: string
  aiSentimentCount?: number
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)

  const fetchData = () => {
    setLoading(true)
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error(e); setLoading(false) })
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleReanalyze = async () => {
    setReanalyzing(true)
    toast.info('Re-analyzing reviews with AI...', { description: 'This may take 30-60 seconds' })
    try {
      const res = await fetch('/api/analytics?reanalyze=true')
      const d = await res.json()
      if (res.ok) {
        setData(d)
        toast.success('AI analysis complete!', {
          description: `${d.totalReviewsAnalyzed} reviews analyzed with real LLM sentiment`
        })
      } else {
        toast.error('Re-analysis failed', { description: d.error })
      }
    } catch {
      toast.error('Network error')
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <AppTopbar
          title="Analytics"
          description="Sentiment, topics, and trends across all your reviews"
        />
        <div className="p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-5 glass-card">
                  <div className="h-4 w-32 bg-muted/40 rounded mb-4 animate-pulse" />
                  <div className="h-32 bg-muted/20 rounded animate-pulse" />
                </Card>
              ))}
            </div>
          ) : data ? (
            <>
              {/* AI sentiment banner */}
              <Card className="p-4 glass-card border-[var(--brass)]/30 bg-gradient-to-r from-[var(--brass)]/5 to-transparent">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--brass)]/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[var(--brass)]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">AI-Powered Sentiment Analysis</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {data.sentimentSource === 'ai-computed'
                          ? `Sentiment computed by GLM-4.6 · ${data.aiSentimentCount || 0} reviews analyzed by AI`
                          : `Click "Re-analyze" to compute real sentiment scores using GLM-4.6 AI`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] h-7 text-xs"
                    onClick={handleReanalyze}
                    disabled={reanalyzing}
                  >
                    {reanalyzing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    {reanalyzing ? 'Analyzing...' : 'Re-analyze with AI'}
                  </Button>
                </div>
              </Card>
              <AnalyticsContent data={data} />
            </>
          ) : null}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

function AnalyticsContent({ data }: { data: AnalyticsData }) {
  const total = data.sentimentDistribution.positive + data.sentimentDistribution.neutral + data.sentimentDistribution.negative

  return (
    <>
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Reviews Analyzed', value: data.totalReviewsAnalyzed.toString(), icon: MessageSquare, color: 'text-blue-500' },
          { label: 'Avg Response Time', value: `${data.avgResponseHours}h`, icon: Clock, color: 'text-[var(--brass)]' },
          { label: 'Positive Sentiment', value: `${total > 0 ? Math.round((data.sentimentDistribution.positive / total) * 100) : 0}%`, icon: TrendingUp, color: 'text-green-500' },
          { label: 'Topics Tracked', value: data.topicAnalysis.length.toString(), icon: BarChart3, color: 'text-purple-500' },
        ].map(stat => (
          <Card key={stat.label} className="p-4 glass-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{stat.label}</span>
              <stat.icon className={cn('w-3.5 h-3.5', stat.color)} />
            </div>
            <div className="font-display text-2xl font-bold">{stat.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Topic sentiment matrix */}
        <Card className="lg:col-span-2 p-5 glass-card">
          <h3 className="font-display font-bold mb-1">Topic Sentiment Matrix</h3>
          <p className="text-xs text-muted-foreground mb-5">Sentiment score by topic, -1.0 to +1.0</p>
          <div className="space-y-3">
            {data.topicAnalysis.map(t => (
              <div key={t.topic} className="flex items-center gap-3">
                <div className="w-24 flex-shrink-0">
                  <div className="text-sm font-medium capitalize">{t.topic}</div>
                  <div className="text-[10px] text-muted-foreground">{t.count} reviews · {t.avgRating.toFixed(1)}★</div>
                </div>
                <div className="flex-1 h-3 rounded-full bg-background/60 overflow-hidden relative">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
                  <div
                    className={cn('h-full rounded-full transition-all', t.avgSentiment >= 0 ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-gradient-to-r from-red-600 to-red-400')}
                    style={{
                      width: `${Math.abs(t.avgSentiment) * 50}%`,
                      marginLeft: t.avgSentiment >= 0 ? '50%' : `${50 - Math.abs(t.avgSentiment) * 50}%`,
                    }}
                  />
                </div>
                <span className={cn('text-xs font-mono w-12 text-right', t.avgSentiment >= 0 ? 'text-green-500' : 'text-red-500')}>
                  {t.avgSentiment > 0 ? '+' : ''}{t.avgSentiment.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Sentiment distribution */}
        <Card className="p-5 glass-card">
          <h3 className="font-display font-bold mb-1">Sentiment Distribution</h3>
          <p className="text-xs text-muted-foreground mb-5">All analyzed reviews</p>
          <div className="space-y-3">
            {[
              { label: 'Positive', count: data.sentimentDistribution.positive, color: 'bg-green-500' },
              { label: 'Neutral', count: data.sentimentDistribution.neutral, color: 'bg-amber-500' },
              { label: 'Negative', count: data.sentimentDistribution.negative, color: 'bg-red-500' },
            ].map(s => {
              const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm">{s.label}</span>
                    <span className="text-xs font-mono text-muted-foreground">{s.count} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-background/60 overflow-hidden">
                    <div className={cn('h-full rounded-full', s.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Source breakdown */}
      <Card className="p-5 glass-card">
        <h3 className="font-display font-bold mb-1">Source Breakdown</h3>
        <p className="text-xs text-muted-foreground mb-5">Reviews by source platform</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.sourceBreakdown.map(s => (
            <div key={s.source} className="p-4 rounded-lg bg-accent/20 border border-border/30">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="text-[10px] font-mono uppercase">{s.source}</Badge>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-[var(--brass)] fill-[var(--brass)]" />
                  <span className="text-xs font-bold">{s.avgRating.toFixed(1)}</span>
                </div>
              </div>
              <div className="font-display text-2xl font-bold">{s.count}</div>
              <div className="text-[10px] text-muted-foreground">total reviews</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
