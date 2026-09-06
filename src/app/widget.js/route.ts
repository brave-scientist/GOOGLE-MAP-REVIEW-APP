// /widget.js — Embeddable ReviewReply widget
// This route serves a JavaScript file that renders a review widget on any website
// Usage: <script src="https://app.reviewreply.com/widget.js?business=Bamboo+Garden&type=carousel&theme=brass&minRating=4&limit=5" async></script>
//
// Supported params:
//   business  — business name to fetch reviews for (required, fuzzy match)
//   type      — widget layout: 'carousel' | 'grid' | 'badge' | 'slider' (default: 'carousel')
//   theme     — color theme: 'brass' | 'dark' | 'blue' | 'green' | 'purple' | 'rose' (default: 'brass')
//   minRating — minimum star rating to show (1-5, default: 1)
//   limit     — max reviews to fetch (1-50, default: 5)

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Color themes — must match the COLOR_THEMES array in src/app/widgets/page.tsx
const COLOR_THEMES: Record<string, { primary: string; bg: string; text: string; muted: string; border: string }> = {
  brass:  { primary: '#97781B', bg: '#FFFFFF', text: '#1F1E1C', muted: '#6B6862', border: '#E5E3DC' },
  dark:   { primary: '#D6B44F', bg: '#0A0A0B', text: '#FAFAF9', muted: '#89867F', border: '#2A2925' },
  blue:   { primary: '#4464C3', bg: '#FFFFFF', text: '#1F1E1C', muted: '#6B6862', border: '#E5E3DC' },
  green:  { primary: '#3B774F', bg: '#FFFFFF', text: '#1F1E1C', muted: '#6B6862', border: '#E5E3DC' },
  purple: { primary: '#7C3AED', bg: '#FFFFFF', text: '#1F1E1C', muted: '#6B6862', border: '#E5E3DC' },
  rose:   { primary: '#E11D48', bg: '#FFFFFF', text: '#1F1E1C', muted: '#6B6862', border: '#E5E3DC' },
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const businessName = searchParams.get('business') || ''
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '5')))
  const minRating = Math.min(5, Math.max(1, parseInt(searchParams.get('minRating') || '1')))
  const themeId = searchParams.get('theme') || 'brass'
  const typeId = searchParams.get('type') || 'carousel'

  // Resolve theme (fallback to brass if unknown)
  const theme = COLOR_THEMES[themeId] || COLOR_THEMES.brass

  // Resolve type (fallback to carousel if unknown)
  const validTypes = ['carousel', 'grid', 'badge', 'slider']
  const type = validTypes.includes(typeId) ? typeId : 'carousel'

  // Resolve business deterministically:
  // 1. businessId query param (cuid) -> exact unique lookup
  // 2. slug query param (unique public slug) -> exact unique lookup
  // 3. business query param: if looks like a cuid, lookup by id; if matches a slug, lookup by slug;
  //    otherwise exact case-insensitive name match ONLY if unique (no fuzzy cross-tenant substring).
  const businessIdParam = searchParams.get('businessId') || searchParams.get('id') || ''
  const slugParam = searchParams.get('slug') || ''
  const businessQuery = (searchParams.get('business') || '').trim()

  let reviews: Array<{ author: string; rating: number; text: string; source: string; createdAt: Date }> = []
  let avgRating = 0
  let reviewCount = 0
  let resolvedBusinessName = ''

  try {
    let business: any = null

    if (businessIdParam.trim().length > 0) {
      business = await db.business.findUnique({
        where: { id: businessIdParam.trim() },
        include: {
          reviews: {
            where: { rating: { gte: minRating } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          },
        },
      })
    } else if (slugParam.trim().length > 0) {
      business = await db.business.findUnique({
        where: { slug: slugParam.trim().toLowerCase() },
        include: {
          reviews: {
            where: { rating: { gte: minRating } },
            orderBy: { createdAt: 'desc' },
            take: limit,
          },
        },
      })
    } else if (businessQuery.length > 0) {
      // Check if businessQuery is a cuid
      if (/^c[a-z0-9]{24}$/.test(businessQuery)) {
        business = await db.business.findUnique({
          where: { id: businessQuery },
          include: {
            reviews: {
              where: { rating: { gte: minRating } },
              orderBy: { createdAt: 'desc' },
              take: limit,
            },
          },
        })
      }

      // Check if businessQuery matches a unique slug
      if (!business) {
        business = await db.business.findUnique({
          where: { slug: businessQuery.toLowerCase() },
          include: {
            reviews: {
              where: { rating: { gte: minRating } },
              orderBy: { createdAt: 'desc' },
              take: limit,
            },
          },
        })
      }

      // Fallback: EXACT name match only (case-insensitive) - never loose fuzzy substring
      if (!business) {
        const matches = await db.business.findMany({
          where: { name: { equals: businessQuery, mode: 'insensitive' } },
          take: 2,
          include: {
            reviews: {
              where: { rating: { gte: minRating } },
              orderBy: { createdAt: 'desc' },
              take: limit,
            },
          },
        })
        // If exact name is unique, resolve it. If multiple tenants share the exact same name,
        // fail closed to prevent cross-tenant data leakage and require explicit businessId/slug.
        if (matches.length === 1) {
          business = matches[0]
        }
      }
    }

    if (business) {
      reviews = business.reviews.map(r => ({
        author: r.author,
        rating: r.rating,
        text: r.text,
        source: r.source,
        createdAt: r.createdAt,
      }))
      avgRating = business.avgRating
      reviewCount = business.reviewCount
      resolvedBusinessName = business.name
    }
  } catch (e) {
    // Fail closed on error, render empty widget safely without crashing
  }

  const { primary: accent, bg: bgColor, text: textColor, muted: mutedColor, border: borderColor } = theme
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://reviewreply.pw').replace(/\/+$/, '')

  // Generate the widget JavaScript.
  // The `type` param selects between four distinct render functions.
  // Each type produces visibly different HTML structure — not just CSS tweaks.
  const widgetJS = `
(function() {
  var data = ${JSON.stringify({ reviews, avgRating, reviewCount, businessName: resolvedBusinessName || businessQuery })};
  var type = ${JSON.stringify(type)};
  var bg = "${bgColor}";
  var text = "${textColor}";
  var muted = "${mutedColor}";
  var border = "${borderColor}";
  var accent = "${accent}";
  var attributionUrl = ${JSON.stringify(appUrl)};

  function createWidget() {
    var containers = document.querySelectorAll('[data-reviewreply-widget], script[data-reviewreply-widget]');
    if (containers.length === 0) {
      var scripts = document.querySelectorAll('script[src*="widget.js"]');
      scripts.forEach(function(script) {
        var div = document.createElement('div');
        div.className = 'reviewreply-widget';
        script.parentNode.insertBefore(div, script.nextSibling);
        renderWidget(div);
      });
    } else {
      containers.forEach(function(c) {
        if (c.tagName === 'SCRIPT') {
          var div = document.createElement('div');
          div.className = 'reviewreply-widget';
          c.parentNode.insertBefore(div, c.nextSibling);
          renderWidget(div);
        } else {
          renderWidget(c);
        }
      });
    }
  }

  function stars(count, color, size) {
    var s = '';
    for (var i = 0; i < 5; i++) {
      s += '<span style="color:' + color + ';font-size:' + (size||12) + 'px;">' + (i < count ? '★' : '☆') + '</span>';
    }
    return s;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function renderWidget(container) {
    var html = '';

    if (type === 'badge') {
      // Floating Badge — compact rating summary, no review text
      html = '<div style="font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:12px;padding:16px 24px;background:' + bg + ';border:2px solid ' + accent + ';border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">';
      html += '<div style="text-align:center;">';
      html += '<div style="font-size:32px;font-weight:700;color:' + accent + ';">' + data.avgRating.toFixed(1) + '</div>';
      html += '<div>' + stars(Math.round(data.avgRating), accent, 14) + '</div>';
      html += '</div>';
      html += '<div style="width:1px;height:40px;background:' + accent + ';opacity:0.3;"></div>';
      html += '<div>';
      html += '<div style="font-size:11px;color:' + muted + ';">Rated by</div>';
      html += '<div style="font-size:20px;font-weight:700;color:' + text + ';">' + data.reviewCount + '</div>';
      html += '<div style="font-size:11px;color:' + muted + ';">customers</div>';
      html += '</div>';
      html += '</div>';
    } else if (type === 'grid') {
      // Grid — 2-column static grid of review cards
      html = '<div style="font-family:Inter,sans-serif;max-width:500px;background:' + bg + ';color:' + text + ';border:1px solid ' + border + ';border-radius:12px;padding:20px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">';
      html += '<div style="font-size:28px;font-weight:700;">' + data.avgRating.toFixed(1) + '</div>';
      html += '<div><div>' + stars(Math.round(data.avgRating), accent, 18) + '</div>';
      html += '<div style="font-size:11px;color:' + muted + ';">' + data.reviewCount + ' reviews</div></div>';
      html += '</div>';
      if (data.reviews.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:' + muted + ';font-size:13px;">No reviews yet</div>';
      } else {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        data.reviews.slice(0, 6).forEach(function(r) {
          html += '<div style="padding:10px;background:' + (bg === '#0A0A0B' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') + ';border-radius:8px;">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
          html += '<div style="width:20px;height:20px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;">' + escapeHtml(r.author.charAt(0)) + '</div>';
          html += '<span style="font-size:11px;font-weight:600;">' + escapeHtml(r.author.split(' ')[0]) + '</span>';
          html += '</div>';
          html += '<div style="margin-bottom:4px;">' + stars(r.rating, accent, 10) + '</div>';
          html += '<p style="font-size:10px;color:' + muted + ';margin:0;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escapeHtml(r.text.substring(0, 100)) + '</p>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '<div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid ' + border + ';"><a href="' + attributionUrl + '" style="font-size:10px;color:' + muted + ';text-decoration:none;" target="_blank" rel="noopener noreferrer">Powered by ReviewReply</a></div>';
      html += '</div>';
    } else if (type === 'slider') {
      // Slider — single review at a time with prev/next buttons
      html = '<div style="font-family:Inter,sans-serif;max-width:400px;background:' + bg + ';color:' + text + ';border:1px solid ' + border + ';border-radius:12px;padding:20px;">';
      html += '<div style="display:flex;align-items:center;justify-content:between;margin-bottom:16px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<div style="font-size:24px;font-weight:700;">' + data.avgRating.toFixed(1) + '</div>';
      html += '<div>' + stars(Math.round(data.avgRating), accent, 16) + '</div>';
      html += '</div>';
      html += '<div style="margin-left:auto;display:flex;gap:4px;">';
      html += '<button onclick="this.parentNode.parentNode.parentNode.dataset.idx=Math.max(0,(parseInt(this.parentNode.parentNode.parentNode.dataset.idx||0))-1);reviewreplySlide(this.parentNode.parentNode.parentNode)" style="width:28px;height:28px;border-radius:6px;background:' + accent + ';color:#fff;border:none;cursor:pointer;font-size:14px;">‹</button>';
      html += '<button onclick="this.parentNode.parentNode.parentNode.dataset.idx=Math.min(' + Math.max(0,data.reviews.length-1) + ',(parseInt(this.parentNode.parentNode.parentNode.dataset.idx||0))+1);reviewreplySlide(this.parentNode.parentNode.parentNode)" style="width:28px;height:28px;border-radius:6px;background:' + accent + ';color:#fff;border:none;cursor:pointer;font-size:14px;">›</button>';
      html += '</div>';
      html += '</div>';
      html += '<div data-slider style="position:relative;min-height:100px;">';
      if (data.reviews.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:' + muted + ';font-size:13px;">No reviews yet</div>';
      } else {
        data.reviews.forEach(function(r, i) {
          html += '<div data-slide="' + i + '" style="padding:16px;background:' + (bg === '#0A0A0B' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') + ';border-radius:8px;display:' + (i===0?'block':'none') + ';">';
          html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
          html += '<div style="width:32px;height:32px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;">' + escapeHtml(r.author.charAt(0)) + '</div>';
          html += '<div><div style="font-size:13px;font-weight:600;">' + escapeHtml(r.author) + '</div>';
          html += '<div>' + stars(r.rating, accent, 11) + '</div></div>';
          html += '<div style="margin-left:auto;font-size:10px;color:' + muted + ';">' + escapeHtml(r.source) + '</div>';
          html += '</div>';
          html += '<p style="font-size:12px;color:' + muted + ';margin:0;line-height:1.5;">"' + escapeHtml(r.text.substring(0, 150)) + (r.text.length > 150 ? '...' : '') + '"</p>';
          html += '</div>';
        });
      }
      html += '</div>';
      html += '<div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid ' + border + ';"><a href="' + attributionUrl + '" style="font-size:10px;color:' + muted + ';text-decoration:none;" target="_blank" rel="noopener noreferrer">Powered by ReviewReply</a></div>';
      html += '</div>';
      html += '<script>function reviewreplySlide(c){var i=parseInt(c.dataset.idx||0);var s=c.querySelectorAll("[data-slide]");s.forEach(function(el,idx){el.style.display=idx===i?"block":"none";});}</script>';
    } else {
      // Carousel (default) — vertical list of review cards, auto-rotates highlight
      html = '<div style="font-family:Inter,sans-serif;max-width:400px;background:' + bg + ';color:' + text + ';border:1px solid ' + border + ';border-radius:12px;padding:20px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">';
      html += '<div style="font-size:28px;font-weight:700;">' + data.avgRating.toFixed(1) + '</div>';
      html += '<div><div style="font-size:18px;">' + stars(Math.round(data.avgRating), accent, 18) + '</div>';
      html += '<div style="font-size:11px;color:' + muted + ';">' + data.reviewCount + ' reviews</div></div>';
      html += '</div>';
      if (data.reviews.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:' + muted + ';font-size:13px;">No reviews yet</div>';
      } else {
        data.reviews.forEach(function(r) {
          html += '<div style="padding:12px 0;border-top:1px solid ' + border + ';">';
          html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
          html += '<div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">' + escapeHtml(r.author.charAt(0)) + '</div>';
          html += '<div><div style="font-size:13px;font-weight:600;">' + escapeHtml(r.author) + '</div>';
          html += '<div>' + stars(r.rating, accent, 12) + '</div></div>';
          html += '<div style="margin-left:auto;font-size:10px;color:' + muted + ';">' + escapeHtml(r.source) + '</div>';
          html += '</div>';
          html += '<p style="font-size:12px;color:' + muted + ';margin:4px 0 0 0;line-height:1.5;">"' + escapeHtml(r.text.substring(0, 150)) + (r.text.length > 150 ? '...' : '') + '"</p>';
          html += '</div>';
        });
      }
      html += '<div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid ' + border + ';"><a href="' + attributionUrl + '" style="font-size:10px;color:' + muted + ';text-decoration:none;" target="_blank" rel="noopener noreferrer">Powered by ReviewReply</a></div>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
`.trim()

  return new NextResponse(widgetJS, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
