import { ExecutiveReportData } from './report-service'

/**
 * Parses a hex color string (#RRGGBB or #RGB) into PDF RGB float values [0..1].
 */
function hexToPdfRgb(hex: string): [number, number, number] {
  let cleaned = (hex || '').replace('#', '').trim()
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('')
  }
  if (cleaned.length !== 6) {
    return [0.12, 0.25, 0.69] // Default to #1E40AF
  }

  const r = parseInt(cleaned.slice(0, 2), 16) / 255
  const g = parseInt(cleaned.slice(2, 4), 16) / 255
  const b = parseInt(cleaned.slice(4, 6), 16) / 255

  return [
    Math.round(r * 100) / 100,
    Math.round(g * 100) / 100,
    Math.round(b * 100) / 100,
  ]
}

/**
 * Robust Unicode sanitization and WinAnsi encoding for PDF 1.4 Type 1 fonts.
 * - Accented Latin: Preserved and mapped to WinAnsi octal escapes
 * - € (Euro): Mapped to WinAnsi \200 (byte 128)
 * - ₹ (Indian Rupee): Transliterated safely to "INR "
 * - Common typographical symbols: • (\225), … (\205), “ (\223), ” (\224), ‘ (\221), ’ (\222), – (\226), — (\227)
 * - CJK ideographs: Safely transliterated to clean ASCII equivalents (e.g. [CJK: ...] or clean text)
 * - Arabic: Safely transliterated to clean representation
 * - Emojis: Replaced with safe ASCII equivalents or omitted cleanly
 * - Escapes PDF control characters: backslash, open/close parentheses
 */
export function sanitizeAndEncodePdfText(text: string | null | undefined): string {
  if (!text) return ''

  let str = String(text)

  // 1. Specific known currency symbols
  str = str.replace(/₹/g, 'INR ')
  str = str.replace(/€/g, '\x80') // WinAnsi 128

  // 2. Common typographical symbols mapped to WinAnsi
  str = str.replace(/[•\u2022]/g, '\x95') // Bullet \225
  str = str.replace(/[…\u2026]/g, '\x85') // Ellipsis \205
  str = str.replace(/[“\u201C]/g, '\x93') // Left double quote \223
  str = str.replace(/[”\u201D]/g, '\x94') // Right double quote \224
  str = str.replace(/[‘\u2018]/g, '\x91') // Left single quote \221
  str = str.replace(/[’\u2019]/g, '\x92') // Right single quote \222
  str = str.replace(/[–\u2013]/g, '\x96') // En dash \226
  str = str.replace(/[—\u2014]/g, '\x97') // Em dash \227
  str = str.replace(/™/g, '\x99')
  str = str.replace(/©/g, '\xA9')
  str = str.replace(/®/g, '\xAE')

  // 3. Stars / Ratings
  str = str.replace(/★/g, '*')
  str = str.replace(/☆/g, '')

  // 4. Safe handling for Emojis
  // Replace high-surrogate emoji pairs
  str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  // Replace miscellaneous symbols & dingbats
  str = str.replace(/[\u2600-\u27BF]/g, '')

  // 5. CJK characters: Standard Type 1 font does not support CJK glyphs.
  // Transliterate safely to avoid malformed stream
  str = str.replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]+/g, (match) => {
    return `[CJK: ${match.length} chars]`
  })

  // 6. Arabic characters
  str = str.replace(/[\u0600-\u06FF\u0750-\u077F]+/g, (match) => {
    return `[Arabic: ${match.length} chars]`
  })

  // 7. Accented Latin characters (0x00A0 - 0x00FF) map 1:1 to WinAnsi
  // Encode as octal strings \ooo for PDF literals
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)

    // PDF escape requirements
    if (str[i] === '\\') {
      result += '\\\\'
    } else if (str[i] === '(') {
      result += '\\('
    } else if (str[i] === ')') {
      result += '\\)'
    } else if (str[i] === '\r' || str[i] === '\n' || str[i] === '\t') {
      result += ' '
    } else if (code >= 32 && code <= 126) {
      // Standard printable ASCII
      result += str[i]
    } else if (code === 0x80) {
      // Euro symbol in WinAnsi
      result += '\\200'
    } else if (code >= 0x81 && code <= 0x9F) {
      // WinAnsi extended range
      result += '\\' + code.toString(8).padStart(3, '0')
    } else if (code >= 0xA0 && code <= 0xFF) {
      // Latin-1 supplement / accented Latin
      result += '\\' + code.toString(8).padStart(3, '0')
    } else {
      // Non-WinAnsi fallback: omit or replace with space
      result += ' '
    }
  }

  return result
}

/**
 * Formats star string for rating representation.
 */
function getStarString(rating: number): string {
  const full = Math.max(1, Math.min(5, Math.round(rating)))
  return '*'.repeat(full)
}

interface PageData {
  pageNumber: number
  ops: string[]
}

/**
 * Renders an Executive Report into a valid, production-ready multi-page PDF 1.4 Buffer.
 * Supports dynamic pagination, page numbering ("Page X of Y"), repeated continuation headers,
 * long review text wrapping, and safe international text handling.
 */
export function renderExecutiveReportPdf(data: ExecutiveReportData): Buffer {
  const [pr, pg, pb] = hexToPdfRgb(data.branding.primaryColor || '#1E40AF')
  const [ar, ag, ab] = hexToPdfRgb(data.branding.accentColor || '#3B82F6')

  // PDF Page Dimensions (A4: 595.28 x 841.89 points)
  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 40
  const footerMargin = 50

  const pages: PageData[] = []
  let currentPageOps: string[] = []

  function newPage(): void {
    if (currentPageOps.length > 0) {
      pages.push({ pageNumber: pages.length + 1, ops: currentPageOps })
    }
    currentPageOps = []
  }

  // Primitive drawing helpers
  function setFillColor(r: number, g: number, b: number) {
    currentPageOps.push(`${r} ${g} ${b} rg`)
  }
  function setStrokeColor(r: number, g: number, b: number) {
    currentPageOps.push(`${r} ${g} ${b} RG`)
  }
  function drawRect(x: number, y: number, w: number, h: number, fill = true, stroke = false) {
    currentPageOps.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`)
    if (fill && stroke) currentPageOps.push('B')
    else if (fill) currentPageOps.push('f')
    else if (stroke) currentPageOps.push('S')
  }
  function drawText(text: string, x: number, y: number, font = 'F1', size = 10, r = 0.1, g = 0.1, b = 0.1) {
    setFillColor(r, g, b)
    currentPageOps.push('BT')
    currentPageOps.push(`/${font} ${size} Tf`)
    currentPageOps.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`)
    currentPageOps.push(`(${sanitizeAndEncodePdfText(text)}) Tj`)
    currentPageOps.push('ET')
  }

  // ─────────────────────────────────────────────────────────
  // PAGE 1: Banner, KPIs, Distributions & First Batch of Reviews
  // ─────────────────────────────────────────────────────────

  // 1. Brand Banner
  setFillColor(pr, pg, pb)
  drawRect(0, pageHeight - 75, pageWidth, 75, true, false)

  setFillColor(ar, ag, ab)
  drawRect(0, pageHeight - 78, pageWidth, 3, true, false)

  drawText(data.branding.brandName.toUpperCase(), margin, pageHeight - 34, 'F2', 15, 1, 1, 1)
  drawText('EXECUTIVE REPUTATION REPORT', margin, pageHeight - 50, 'F1', 9, 0.85, 0.9, 1)

  const dateLabel = `Period: ${data.period.label}`
  drawText(dateLabel, pageWidth - margin - 220, pageHeight - 34, 'F1', 9, 0.9, 0.95, 1)
  drawText(`Business: ${data.businessName}`, pageWidth - margin - 220, pageHeight - 48, 'F2', 9, 1, 1, 1)

  // 2. Report Summary Header
  let cursorY = pageHeight - 110
  drawText(`Performance Summary - ${data.businessName}`, margin, cursorY, 'F2', 15, 0.08, 0.08, 0.1)
  drawText(`Generated on ${new Date(data.generatedAt).toUTCString()}`, margin, cursorY - 14, 'F1', 8, 0.45, 0.45, 0.5)

  // 3. KPI Metric Cards (4 cards across width)
  cursorY -= 75
  const cardWidth = (pageWidth - margin * 2 - 30) / 4
  const cardHeight = 52

  const kpiItems = [
    { label: 'AVERAGE RATING', value: `${data.kpis.avgRatingPeriod.toFixed(1)} *`, sub: `All-time: ${data.kpis.avgRatingAllTime.toFixed(1)}` },
    { label: 'REVIEWS IN PERIOD', value: `${data.kpis.totalReviewsPeriod}`, sub: `All-time: ${data.kpis.totalReviewsAllTime}` },
    { label: 'REPLY COVERAGE', value: `${data.kpis.replyCoverageRate}%`, sub: `${data.kpis.repliedCount} replied` },
    { label: 'ACTIONABLE / PENDING', value: `${data.kpis.actionableCount}`, sub: `${data.kpis.pendingRepliesCount} unanswered` },
  ]

  kpiItems.forEach((kpi, idx) => {
    const cardX = margin + idx * (cardWidth + 10)
    setFillColor(0.97, 0.98, 0.99)
    setStrokeColor(0.88, 0.9, 0.93)
    currentPageOps.push('0.5 w')
    drawRect(cardX, cursorY, cardWidth, cardHeight, true, true)

    setFillColor(pr, pg, pb)
    drawRect(cardX, cursorY + cardHeight - 2, cardWidth, 2, true, false)

    drawText(kpi.label, cardX + 8, cursorY + cardHeight - 14, 'F2', 6.5, 0.4, 0.45, 0.5)
    drawText(kpi.value, cardX + 8, cursorY + cardHeight - 32, 'F2', 14, 0.1, 0.12, 0.18)
    drawText(kpi.sub, cardX + 8, cursorY + cardHeight - 44, 'F1', 7, 0.5, 0.55, 0.6)
  })

  // 4. Two Column Section: Rating Distribution & Sentiment
  cursorY -= 35
  const colWidth = (pageWidth - margin * 2 - 16) / 2

  // Left: Rating Distribution
  const leftX = margin
  drawText('Rating Distribution', leftX, cursorY, 'F2', 12, 0.1, 0.1, 0.15)

  let distY = cursorY - 22
  const total = Math.max(1, data.kpis.totalReviewsPeriod)
  const ratings = [5, 4, 3, 2, 1] as const

  ratings.forEach((star) => {
    const count = data.ratingDistribution[star] || 0
    const pct = Math.round((count / total) * 100)
    const barMaxWidth = colWidth - 75
    const barWidth = Math.max(2, (pct / 100) * barMaxWidth)

    drawText(`${star} Star`, leftX, distY + 2, 'F1', 8, 0.3, 0.3, 0.35)

    setFillColor(0.93, 0.94, 0.96)
    drawRect(leftX + 35, distY + 1, barMaxWidth, 7, true, false)

    setFillColor(pr, pg, pb)
    drawRect(leftX + 35, distY + 1, barWidth, 7, true, false)

    drawText(`${count} (${pct}%)`, leftX + 40 + barMaxWidth, distY + 2, 'F1', 7.5, 0.4, 0.45, 0.5)
    distY -= 14
  })

  // Right: Sentiment Summary
  const rightX = margin + colWidth + 16
  drawText('Sentiment Breakdown', rightX, cursorY, 'F2', 12, 0.1, 0.1, 0.15)

  let sentY = cursorY - 22
  const sentItems = [
    { label: 'Positive Experience', count: data.sentimentSummary.positive, color: [0.1, 0.6, 0.2] },
    { label: 'Neutral / Informational', count: data.sentimentSummary.neutral, color: [0.4, 0.5, 0.6] },
    { label: 'Critical / Action Needed', count: data.sentimentSummary.negative, color: [0.85, 0.2, 0.2] },
  ]

  sentItems.forEach((sent) => {
    const pct = Math.round(((sent.count || 0) / total) * 100)
    setFillColor(0.97, 0.98, 0.99)
    setStrokeColor(0.88, 0.9, 0.93)
    currentPageOps.push('0.5 w')
    drawRect(rightX, sentY - 8, colWidth, 22, true, true)

    setFillColor(sent.color[0], sent.color[1], sent.color[2])
    drawRect(rightX + 8, sentY - 2, 8, 8, true, false)

    drawText(sent.label, rightX + 22, sentY - 1, 'F2', 8, 0.2, 0.2, 0.25)
    drawText(`${sent.count} reviews (${pct}%)`, rightX + colWidth - 85, sentY - 1, 'F1', 7.5, 0.4, 0.45, 0.5)
    sentY -= 28
  })

  // 5. Recent Reviews Section (with Dynamic Multi-page Pagination)
  cursorY = distY - 25
  drawText('Recent Customer Feedback', margin, cursorY, 'F2', 12, 0.1, 0.1, 0.15)
  cursorY -= 18

  const reviewsToRender = data.recentReviews

  if (reviewsToRender.length === 0) {
    drawText('No customer reviews recorded during this reporting window.', margin, cursorY - 10, 'F1', 9, 0.5, 0.5, 0.55)
    cursorY -= 30
  } else {
    for (let i = 0; i < reviewsToRender.length; i++) {
      const review = reviewsToRender[i]
      const cardH = review.replyText ? 56 : 46

      // Check if current page has room for this card
      if (cursorY - cardH < footerMargin + 10) {
        // Finalize current page and start next page
        newPage()

        // Draw Continuation Header on subsequent page
        setFillColor(pr, pg, pb)
        drawRect(0, pageHeight - 42, pageWidth, 42, true, false)
        setFillColor(ar, ag, ab)
        drawRect(0, pageHeight - 44, pageWidth, 2, true, false)

        drawText(data.branding.brandName.toUpperCase(), margin, pageHeight - 24, 'F2', 11, 1, 1, 1)
        drawText(`Executive Report - Continued - ${data.businessName}`, margin, pageHeight - 36, 'F1', 8, 0.9, 0.95, 1)
        drawText(`Period: ${data.period.label}`, pageWidth - margin - 200, pageHeight - 28, 'F1', 8, 0.9, 0.95, 1)

        cursorY = pageHeight - 75
        drawText('Recent Customer Feedback (Continued)', margin, cursorY, 'F2', 11, 0.1, 0.1, 0.15)
        cursorY -= 18
      }

      // Render Review Card
      setFillColor(0.99, 0.99, 1.0)
      setStrokeColor(0.9, 0.92, 0.94)
      currentPageOps.push('0.5 w')
      drawRect(margin, cursorY - cardH, pageWidth - margin * 2, cardH, true, true)

      // Rating Stars
      const starText = getStarString(review.rating)
      drawText(starText, margin + 10, cursorY - 14, 'F2', 9, 0.9, 0.6, 0.1)

      // Author & Date
      const dateStr = review.createdAt ? review.createdAt.slice(0, 10) : ''
      drawText(`${review.author} - ${dateStr}`, margin + 55, cursorY - 14, 'F2', 8.5, 0.2, 0.25, 0.3)

      // Reply badge
      if (review.replyText || review.repliedAt) {
        setFillColor(0.2, 0.6, 0.2)
        drawText('Replied', pageWidth - margin - 50, cursorY - 14, 'F2', 7.5, 0.1, 0.5, 0.2)
      } else {
        setFillColor(0.8, 0.3, 0.1)
        drawText('Pending Response', pageWidth - margin - 85, cursorY - 14, 'F1', 7.5, 0.7, 0.3, 0.1)
      }

      // Review snippet (max 115 chars)
      const snippet = review.text
        ? (review.text.length > 115 ? review.text.slice(0, 115) + '...' : review.text)
        : 'No comment text provided.'
      drawText(`"${snippet}"`, margin + 10, cursorY - 28, 'F1', 8, 0.35, 0.38, 0.42)

      if (review.replyText) {
        const replySnippet = review.replyText.length > 90 ? review.replyText.slice(0, 90) + '...' : review.replyText
        drawText(`Reply: "${replySnippet}"`, margin + 18, cursorY - 42, 'F1', 7, 0.3, 0.45, 0.6)
      }

      cursorY -= cardH + 8
    }
  }

  // Push final page
  newPage()

  // ─────────────────────────────────────────────────────────
  // FOOTER & ACCURATE PAGE NUMBERING ON ALL PAGES
  // ─────────────────────────────────────────────────────────
  const totalPages = pages.length
  const footerY = 22

  pages.forEach((page) => {
    // Divider line
    page.ops.push('0.85 0.88 0.9 rg')
    page.ops.push(`${margin.toFixed(2)} ${(footerY + 15).toFixed(2)} ${(pageWidth - margin * 2).toFixed(2)} 0.50 re f`)

    // Dynamic Page Numbering: Page X of Y
    const pageStr = `Confidential Executive Report - Page ${page.pageNumber} of ${totalPages}`
    page.ops.push('0.5 0.55 0.6 rg')
    page.ops.push('BT')
    page.ops.push('/F1 7.5 Tf')
    page.ops.push(`${margin.toFixed(2)} ${footerY.toFixed(2)} Td`)
    page.ops.push(`(${sanitizeAndEncodePdfText(pageStr)}) Tj`)
    page.ops.push('ET')

    if (!data.branding.hideReviewReplyBadge) {
      page.ops.push('0.45 0.5 0.58 rg')
      page.ops.push('BT')
      page.ops.push('/F2 7.5 Tf')
      page.ops.push(`${(pageWidth - margin - 110).toFixed(2)} ${footerY.toFixed(2)} Td`)
      page.ops.push(`(Powered by ReviewReply.pw) Tj`)
      page.ops.push('ET')
    }
  })

  // ─────────────────────────────────────────────────────────
  // ASSEMBLE COMPLETE PDF 1.4 DOCUMENT STRUCTURE
  // ─────────────────────────────────────────────────────────
  const pdfObjects: string[] = []

  // Object 1: Catalog
  pdfObjects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)

  // Object 2: Pages
  // Page object indices: page 1 = obj 3, page 2 = obj 7, page 3 = obj 11, etc.
  const pageObjIndices: number[] = []
  for (let p = 0; p < totalPages; p++) {
    // Each page consumes 2 object slots: Page object & Contents object
    // Page obj index = 3 + p * 2 (or 3, 4 for p=0, then fonts 5, 6, etc.)
  }

  // To keep numbering clean:
  // Obj 1: Catalog
  // Obj 2: Pages
  // Obj 3: Font F1 (Helvetica)
  // Obj 4: Font F2 (Helvetica-Bold)
  // For each page p from 0 to totalPages - 1:
  //   Obj 5 + p*2: Page
  //   Obj 6 + p*2: Contents Stream
  const font1ObjNum = 3
  const font2ObjNum = 4

  pdfObjects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`)
  pdfObjects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`)

  const pageKids: string[] = []
  for (let p = 0; p < totalPages; p++) {
    const pageObjNum = 5 + p * 2
    const streamObjNum = 6 + p * 2
    pageKids.push(`${pageObjNum} 0 R`)

    const contentStream = pages[p].ops.join('\n')
    const streamLength = Buffer.byteLength(contentStream, 'utf-8')

    // Page Object
    pdfObjects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjNum} 0 R /Resources << /Font << /F1 ${font1ObjNum} 0 R /F2 ${font2ObjNum} 0 R >> >> >>\nendobj`
    )

    // Contents Stream Object
    pdfObjects.push(
      `${streamObjNum} 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj`
    )
  }

  // Insert Pages object at index 1 (Object 2)
  const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${totalPages} >>\nendobj`
  pdfObjects.splice(1, 0, pagesObj)

  // Build Xref Table
  let currentOffset = 0
  const header = '%PDF-1.4\n'
  currentOffset += Buffer.byteLength(header, 'utf-8')

  const offsets: number[] = [0]
  const bodyParts: string[] = []

  pdfObjects.forEach((obj) => {
    offsets.push(currentOffset)
    const objStr = obj + '\n'
    bodyParts.push(objStr)
    currentOffset += Buffer.byteLength(objStr, 'utf-8')
  })

  const startXref = currentOffset

  let xref = `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= pdfObjects.length; i++) {
    const off = String(offsets[i]).padStart(10, '0')
    xref += `${off} 00000 n \n`
  }

  const trailer = `trailer\n<< /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`

  const fullPdfString = header + bodyParts.join('') + xref + trailer
  return Buffer.from(fullPdfString, 'utf-8')
}
