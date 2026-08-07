// /widget.js — Embeddable ReviewReply widget
// This route serves a JavaScript file that renders a review widget on any website
// Usage: <script src="https://app.reviewreply.com/widget.js?business=Bamboo+Garden" async></script>

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const businessName = searchParams.get('business') || ''
  const limit = parseInt(searchParams.get('limit') || '5')
  const minRating = parseInt(searchParams.get('minRating') || '1')
  const theme = searchParams.get('theme') || 'light'

  // Fetch real reviews from DB
  let reviews: Array<{ author: string; rating: number; text: string; source: string; createdAt: Date }> = []
  let avgRating = 0
  let reviewCount = 0

  try {
    // SQLite doesn't support mode: 'insensitive', so we use contains without it
    // SQLite is case-insensitive by default for ASCII
    const business = await db.business.findFirst({
      where: { name: { contains: businessName } },
      include: {
        reviews: {
          where: { rating: { gte: minRating } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        },
      },
    })

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
    }
  } catch (e) {
    // If DB fails, render with empty data
  }

  const isDark = theme === 'dark'
  const bgColor = isDark ? '#0A0A0B' : '#FFFFFF'
  const textColor = isDark ? '#FAFAF9' : '#1F1E1C'
  const mutedColor = isDark ? '#89867F' : '#6B6862'
  const borderColor = isDark ? '#2A2925' : '#E5E3DC'
  const accentColor = '#97781B'

  // Generate the widget JavaScript
  const widgetJS = `
(function() {
  var data = ${JSON.stringify({ reviews, avgRating, reviewCount, businessName })};
  var bg = "${bgColor}";
  var text = "${textColor}";
  var muted = "${mutedColor}";
  var border = "${borderColor}";
  var accent = "${accentColor}";

  function createWidget() {
    var containers = document.querySelectorAll('[data-reviewreply-widget], script[data-reviewreply-widget]');
    if (containers.length === 0) {
      // If no explicit container, create one after the script tag
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

  function renderWidget(container) {
    var stars = '';
    for (var i = 0; i < 5; i++) {
      stars += '<span style="color:' + accent + '">' + (i < Math.round(data.avgRating) ? '★' : '☆') + '</span>';
    }

    var html = '<div style="font-family:Inter,sans-serif;max-width:400px;background:' + bg + ';color:' + text + ';border:1px solid ' + border + ';border-radius:12px;padding:20px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">';
    html += '<div style="font-size:28px;font-weight:700;">' + data.avgRating.toFixed(1) + '</div>';
    html += '<div><div style="font-size:18px;">' + stars + '</div>';
    html += '<div style="font-size:11px;color:' + muted + ';">' + data.reviewCount + ' reviews</div></div>';
    html += '</div>';

    if (data.reviews.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:' + muted + ';font-size:13px;">No reviews yet</div>';
    } else {
      data.reviews.forEach(function(r) {
        var reviewStars = '';
        for (var i = 0; i < 5; i++) {
          reviewStars += '<span style="color:' + accent + ';font-size:12px;">' + (i < r.rating ? '★' : '☆') + '</span>';
        }
        html += '<div style="padding:12px 0;border-top:1px solid ' + border + ';">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
        html += '<div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">' + r.author.charAt(0) + '</div>';
        html += '<div><div style="font-size:13px;font-weight:600;">' + r.author + '</div>';
        html += '<div>' + reviewStars + '</div></div>';
        html += '<div style="margin-left:auto;font-size:10px;color:' + muted + ';">' + r.source + '</div>';
        html += '</div>';
        html += '<p style="font-size:12px;color:' + muted + ';margin:4px 0 0 0;line-height:1.5;">"' + r.text.substring(0, 150) + (r.text.length > 150 ? '...' : '') + '"</p>';
        html += '</div>';
      });
    }

    html += '<div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid ' + border + ';">';
    html += '<a href="' + window.location.origin + '" style="font-size:10px;color:' + muted + ';text-decoration:none;" target="_blank">Powered by ReviewReply</a>';
    html += '</div>';
    html += '</div>';

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
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      'Access-Control-Allow-Origin': '*', // Allow embedding on any site
    },
  })
}
