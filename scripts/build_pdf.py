#!/usr/bin/env python3
"""
ReviewReply Enterprise — Audit, Architecture & Roadmap
Body PDF generator (ReportLab) — produces ~120 page premium strategy document.
"""
import os
import sys
import hashlib

# Skill path
PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Image, Flowable, HRFlowable, ListFlowable, ListItem
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfgen import canvas as canvas_module

# ─────────────────────────── FONT REGISTRATION ───────────────────────────
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
# Sarasa Mono for CJK code blocks
pdfmetrics.registerFont(TTFont('SarasaMonoSC', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
# English fonts — FreeSerif (4 weights)
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
# Sans-serif for headings/UI
pdfmetrics.registerFont(TTFont('FreeSans', f'{FONT_DIR}/truetype/freefont/FreeSans.ttf'))
pdfmetrics.registerFont(TTFont('FreeSans-Bold', f'{FONT_DIR}/truetype/freefont/FreeSansBold.ttf'))
# DejaVu for mono
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('FreeSans', normal='FreeSans', bold='FreeSans-Bold')

from pdf import install_font_fallback
install_font_fallback()

# ─────────────────────────── PALETTE (cascade, minimal mode) ───────────────────────────
PAGE_BG       = colors.HexColor('#FFFFFF')
SECTION_BG    = colors.HexColor('#F3F3F1')
CARD_BG       = colors.HexColor('#F7F7F4')
TABLE_STRIPE  = colors.HexColor('#F4F4F2')
HEADER_FILL   = colors.HexColor('#1F1E1C')  # near-black for premium feel
COVER_BLOCK   = colors.HexColor('#665D41')
BORDER        = colors.HexColor('#C3BBA4')
ICON          = colors.HexColor('#957F3D')
ACCENT        = colors.HexColor('#97781B')  # brass
ACCENT_2      = colors.HexColor('#4464C3')  # complementary blue
TEXT_PRIMARY  = colors.HexColor('#1F1E1C')
TEXT_MUTED    = colors.HexColor('#6B6862')
TEXT_LIGHT    = colors.HexColor('#89867F')
SEM_SUCCESS   = colors.HexColor('#3B774F')
SEM_WARNING   = colors.HexColor('#947C4A')
SEM_ERROR     = colors.HexColor('#97524C')
SEM_INFO      = colors.HexColor('#4F78A0')
P0_COLOR      = colors.HexColor('#B91C1C')
P1_COLOR      = colors.HexColor('#C2410C')
P2_COLOR      = colors.HexColor('#A16207')
P3_COLOR      = colors.HexColor('#3F6212')

# ─────────────────────────── STYLES ───────────────────────────
BASE_FONT = 'FreeSerif'
BASE_FONT_BOLD = 'FreeSerif-Bold'
MONO_FONT = 'DejaVuSans'

style_h1 = ParagraphStyle('H1', fontName=BASE_FONT_BOLD, fontSize=22, leading=28,
                          textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=12, alignment=TA_LEFT)
style_h2 = ParagraphStyle('H2', fontName=BASE_FONT_BOLD, fontSize=15, leading=20,
                          textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8, alignment=TA_LEFT)
style_h3 = ParagraphStyle('H3', fontName=BASE_FONT_BOLD, fontSize=12, leading=16,
                          textColor=ACCENT, spaceBefore=10, spaceAfter=5, alignment=TA_LEFT)
style_kicker = ParagraphStyle('Kicker', fontName=MONO_FONT, fontSize=8.5, leading=11,
                              textColor=ACCENT, spaceBefore=0, spaceAfter=2, alignment=TA_LEFT)
style_body = ParagraphStyle('Body', fontName=BASE_FONT, fontSize=10.5, leading=16,
                            textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=7, alignment=TA_JUSTIFY)
style_body_left = ParagraphStyle('BodyLeft', fontName=BASE_FONT, fontSize=10.5, leading=16,
                                 textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=7, alignment=TA_LEFT)
style_bullet = ParagraphStyle('Bullet', fontName=BASE_FONT, fontSize=10.5, leading=15,
                              textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=4,
                              leftIndent=14, bulletIndent=4, alignment=TA_LEFT)
style_quote = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=11, leading=16,
                             textColor=TEXT_MUTED, leftIndent=18, rightIndent=18,
                             spaceBefore=8, spaceAfter=8, alignment=TA_LEFT, borderColor=ACCENT,
                             borderPadding=(0, 0, 0, 12), borderWidth=0)
style_caption = ParagraphStyle('Caption', fontName='FreeSerif-Italic', fontSize=8.5, leading=12,
                               textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=12)
style_table_h = ParagraphStyle('THead', fontName=BASE_FONT_BOLD, fontSize=9.5, leading=12,
                               textColor=colors.white, alignment=TA_LEFT)
style_table_h_c = ParagraphStyle('THeadC', fontName=BASE_FONT_BOLD, fontSize=9.5, leading=12,
                                 textColor=colors.white, alignment=TA_CENTER)
style_table_c = ParagraphStyle('TCell', fontName=BASE_FONT, fontSize=9, leading=12,
                               textColor=TEXT_PRIMARY, alignment=TA_LEFT)
style_table_c_c = ParagraphStyle('TCellC', fontName=BASE_FONT, fontSize=9, leading=12,
                                 textColor=TEXT_PRIMARY, alignment=TA_CENTER)
style_table_c_b = ParagraphStyle('TCellB', fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                                 textColor=TEXT_PRIMARY, alignment=TA_LEFT)
style_toc_l0 = ParagraphStyle('TOCL0', fontName=BASE_FONT_BOLD, fontSize=11, leading=20,
                              textColor=TEXT_PRIMARY, leftIndent=0)
style_toc_l1 = ParagraphStyle('TOCL1', fontName=BASE_FONT, fontSize=10, leading=16,
                              textColor=TEXT_MUTED, leftIndent=20)
style_toc_l2 = ParagraphStyle('TOCL2', fontName=BASE_FONT, fontSize=9.5, leading=14,
                              textColor=TEXT_LIGHT, leftIndent=40)
style_callout = ParagraphStyle('Callout', fontName=BASE_FONT, fontSize=10, leading=15,
                               textColor=TEXT_PRIMARY, spaceBefore=4, spaceAfter=4, alignment=TA_LEFT)
style_stat_num = ParagraphStyle('StatNum', fontName=BASE_FONT_BOLD, fontSize=24, leading=28,
                                textColor=ACCENT, alignment=TA_LEFT)
style_stat_label = ParagraphStyle('StatLabel', fontName=MONO_FONT, fontSize=8, leading=10,
                                  textColor=TEXT_MUTED, alignment=TA_LEFT)
style_code = ParagraphStyle('Code', fontName=MONO_FONT, fontSize=8.5, leading=12,
                            textColor=TEXT_PRIMARY, backColor=CARD_BG,
                            leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=8,
                            borderColor=BORDER, borderWidth=0.5, borderPadding=6)

# ─────────────────────────── HELPERS ───────────────────────────
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 22*mm
RIGHT_MARGIN = 22*mm
TOP_MARGIN = 25*mm
BOTTOM_MARGIN = 22*mm
CONTENT_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN  # ~166mm ≈ 470pt

story = []

def add_h1(text, level=0, key=None):
    """Add a chapter heading + TOC entry."""
    if key is None:
        key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style_h1)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    story.append(p)
    # Add a thin accent rule under H1
    story.append(HRFlowable(width=60, thickness=2, color=ACCENT,
                            spaceBefore=-8, spaceAfter=10, hAlign='LEFT'))

def add_h2(text, level=1, key=None):
    if key is None:
        key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style_h2)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    story.append(p)

def add_h3(text):
    story.append(Paragraph(text, style_h3))

def add_kicker(text):
    story.append(Paragraph(text.upper(), style_kicker))

def add_body(text):
    story.append(Paragraph(text, style_body))

def add_body_left(text):
    story.append(Paragraph(text, style_body_left))

def add_bullets(items, style=None):
    if style is None:
        style = style_bullet
    for item in items:
        story.append(Paragraph(f'•&nbsp;&nbsp;{item}', style))

def add_quote(text):
    """Block quote with left accent border (drawn via table)."""
    p = Paragraph(text, style_quote)
    t = Table([[p]], colWidths=[CONTENT_W - 12])
    t.setStyle(TableStyle([
        ('LINEBEFORE', (0,0), (0,-1), 2.5, ACCENT),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(Spacer(1, 4))
    story.append(t)
    story.append(Spacer(1, 6))

def add_spacer(h=10):
    story.append(Spacer(1, h))

def add_table(headers, rows, col_widths=None, header_align='left'):
    """Build a styled table.
    headers: list[str]
    rows: list[list[str | Paragraph]]
    col_widths: list[float] in points (must sum to <= CONTENT_W)
    """
    if col_widths is None:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n
    # Normalize all cells to Paragraph
    h_style = style_table_h_c if header_align == 'center' else style_table_h
    data = [[Paragraph(f'<b>{h}</b>', h_style) for h in headers]]
    for row in rows:
        new_row = []
        for cell in row:
            if isinstance(cell, Paragraph):
                new_row.append(cell)
            else:
                new_row.append(Paragraph(str(cell), style_table_c))
        data.append(new_row)
    t = Table(data, colWidths=col_widths, hAlign='CENTER', repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), HEADER_FILL),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LINEBELOW', (0,0), (-1,0), 1, HEADER_FILL),
        ('LINEBELOW', (0,1), (-1,-1), 0.3, BORDER),
    ]
    # Alternating row backgrounds
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0,i), (-1,i), TABLE_STRIPE))
        else:
            style_cmds.append(('BACKGROUND', (0,i), (-1,i), colors.white))
    t.setStyle(TableStyle(style_cmds))
    story.append(Spacer(1, 6))
    story.append(t)
    story.append(Spacer(1, 6))

def add_callout_box(title, body_text, color=ACCENT, bg=CARD_BG):
    """Premium callout box for emphasis."""
    title_p = Paragraph(f'<b>{title}</b>', ParagraphStyle('CalT', fontName=BASE_FONT_BOLD,
                          fontSize=10, leading=13, textColor=color, alignment=TA_LEFT))
    body_p = Paragraph(body_text, style_callout)
    t = Table([[title_p], [body_p]], colWidths=[CONTENT_W - 16])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg),
        ('LINEBEFORE', (0,0), (0,-1), 3, color),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,0), 8),
        ('BOTTOMPADDING', (0,-1), (-1,-1), 8),
        ('TOPPADDING', (0,1), (-1,1), 2),
        ('BOTTOMPADDING', (0,0), (-1,0), 4),
    ]))
    story.append(Spacer(1, 6))
    story.append(t)
    story.append(Spacer(1, 6))

def add_stat_row(stats):
    """stats: list of (number, label, sublabel) tuples — up to 4 per row."""
    n = len(stats)
    col_w = CONTENT_W / n
    cells = []
    for num, label, sub in stats:
        num_p = Paragraph(num, style_stat_num)
        lab_p = Paragraph(label.upper(), style_stat_label)
        sub_p = Paragraph(sub, ParagraphStyle('StatSub', fontName=BASE_FONT, fontSize=8.5,
                          leading=11, textColor=TEXT_MUTED, alignment=TA_LEFT))
        inner = Table([[num_p], [lab_p], [sub_p]], colWidths=[col_w - 16])
        inner.setStyle(TableStyle([
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        cells.append(inner)
    t = Table([cells], colWidths=[col_w]*n)
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('BACKGROUND', (0,0), (-1,-1), CARD_BG),
        ('LINEABOVE', (0,0), (-1,0), 1, BORDER),
        ('LINEBELOW', (0,-1), (-1,-1), 1, BORDER),
    ]))
    story.append(Spacer(1, 6))
    story.append(t)
    story.append(Spacer(1, 8))

def add_severity_badge(level):
    """Return a Paragraph with a colored severity badge."""
    colors_map = {'P0': P0_COLOR, 'P1': P1_COLOR, 'P2': P2_COLOR, 'P3': P3_COLOR}
    c = colors_map.get(level, TEXT_MUTED)
    # ReportLab needs colors prefixed with '#'
    hex_str = '#' + c.hexval()[2:]
    return Paragraph(f'<font color="white" backColor="{hex_str}"><b>&nbsp;{level}&nbsp;</b></font>',
                     ParagraphStyle('Badge', fontName=BASE_FONT_BOLD, fontSize=8.5, leading=11,
                                    alignment=TA_CENTER, textColor=colors.white))

# ─────────────────────────── PAGE FRAME (Header/Footer) ───────────────────────────
def page_frame(canv, doc):
    canv.saveState()
    # Top header — thin gold accent + document title
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(1.5)
    canv.line(LEFT_MARGIN, PAGE_H - 16*mm, LEFT_MARGIN + 30, PAGE_H - 16*mm)
    canv.setFont('DejaVuSans', 8)
    canv.setFillColor(TEXT_MUTED)
    canv.drawString(LEFT_MARGIN + 38, PAGE_H - 16.5*mm, 'REVIEWREPLY ENTERPRISE')
    canv.setFont('DejaVuSans', 7.5)
    canv.setFillColor(TEXT_LIGHT)
    canv.drawRightString(PAGE_W - RIGHT_MARGIN, PAGE_H - 16.5*mm,
                         'Audit · Architecture · Roadmap')
    # Footer — page number + brand
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.3)
    canv.line(LEFT_MARGIN, 14*mm, PAGE_W - RIGHT_MARGIN, 14*mm)
    canv.setFont('DejaVuSans', 8)
    canv.setFillColor(TEXT_MUTED)
    canv.drawString(LEFT_MARGIN, 10*mm, 'Z.ai Strategic Engineering')
    canv.setFont('DejaVuSans', 8.5)
    canv.setFillColor(ACCENT)
    canv.drawRightString(PAGE_W - RIGHT_MARGIN, 10*mm, f'PAGE {doc.page:03d}')
    canv.restoreState()

# ─────────────────────────── TocDocTemplate ───────────────────────────
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ─────────────────────────── BUILD STORY ───────────────────────────
def build_story():
    """Import all content modules and build the full story."""
    import importlib.util

    # Build a globals dict with all helpers
    helpers = {
        'add_h1': add_h1, 'add_h2': add_h2, 'add_h3': add_h3, 'add_kicker': add_kicker,
        'add_body': add_body, 'add_body_left': add_body_left, 'add_bullets': add_bullets,
        'add_quote': add_quote, 'add_spacer': add_spacer, 'add_table': add_table,
        'add_callout_box': add_callout_box, 'add_stat_row': add_stat_row,
        'add_severity_badge': add_severity_badge,
        'PageBreak': PageBreak, 'Spacer': Spacer,
        'Paragraph': Paragraph, 'Table': Table, 'TableStyle': TableStyle,
        'HRFlowable': HRFlowable, 'KeepTogether': KeepTogether,
        'style_h1': style_h1, 'style_h2': style_h2, 'style_h3': style_h3,
        'style_body': style_body, 'style_body_left': style_body_left,
        'style_bullet': style_bullet, 'style_quote': style_quote, 'style_code': style_code,
        'style_caption': style_caption, 'style_table_c': style_table_c,
        'style_table_c_b': style_table_c_b, 'style_table_c_c': style_table_c_c,
        'ACCENT': ACCENT, 'ACCENT_2': ACCENT_2, 'HEADER_FILL': HEADER_FILL,
        'TEXT_PRIMARY': TEXT_PRIMARY, 'TEXT_MUTED': TEXT_MUTED, 'TEXT_LIGHT': TEXT_LIGHT,
        'BORDER': BORDER, 'CARD_BG': CARD_BG, 'TABLE_STRIPE': TABLE_STRIPE,
        'P0_COLOR': P0_COLOR, 'P1_COLOR': P1_COLOR, 'P2_COLOR': P2_COLOR, 'P3_COLOR': P3_COLOR,
        'SEM_SUCCESS': SEM_SUCCESS, 'SEM_WARNING': SEM_WARNING,
        'SEM_ERROR': SEM_ERROR, 'SEM_INFO': SEM_INFO,
        'CONTENT_W': CONTENT_W, 'colors': colors,
        'ParagraphStyle': ParagraphStyle, 'TA_LEFT': TA_LEFT, 'TA_CENTER': TA_CENTER,
    }

    # Load each content module with helpers in globals
    content_files = [
        '/home/z/my-project/scripts/pdf_content.py',
        '/home/z/my-project/scripts/pdf_content_p3_4.py',
        '/home/z/my-project/scripts/pdf_content_p5_6.py',
        '/home/z/my-project/scripts/pdf_content_p7_10.py',
    ]

    # Inject helpers into each module's globals by executing them with helpers as namespace
    modules = []
    for cf in content_files:
        # Read the source and exec it with helpers as globals
        with open(cf, 'r') as f:
            source = f.read()
        # Make a copy so we don't pollute the original
        module_globals = dict(helpers)
        exec(compile(source, cf, 'exec'), module_globals)
        modules.append(module_globals)

    # First module defines build() which calls parts 1+2
    # Subsequent modules define part_3_competitive through part_10_appendices
    # We need to extend the first module's build() to call all parts

    # Actually simpler: just call each part function in order
    print("  - Part I: Executive Summary")
    modules[0]['part_1_executive_summary'](story)
    story.append(PageBreak())
    print("  - Part II: Audit")
    modules[0]['part_2_audit'](story)
    story.append(PageBreak())
    print("  - Part III: Competitive")
    modules[1]['part_3_competitive'](story)
    story.append(PageBreak())
    print("  - Part IV: Modules")
    modules[1]['part_4_modules'](story)
    story.append(PageBreak())
    print("  - Part V: Design Architecture")
    modules[2]['part_5_design_architecture'](story)
    story.append(PageBreak())
    print("  - Part VI: Development Architecture")
    modules[2]['part_6_dev_architecture'](story)
    story.append(PageBreak())
    print("  - Part VII: Roadmap")
    modules[3]['part_7_roadmap'](story)
    story.append(PageBreak())
    print("  - Part VIII: Automation Flows")
    modules[3]['part_8_automation_flows'](story)
    story.append(PageBreak())
    print("  - Part IX: Launch Readiness")
    modules[3]['part_9_launch_readiness'](story)
    story.append(PageBreak())
    print("  - Part X: Appendices")
    modules[3]['part_10_appendices'](story)

# ─────────────────────────── MAIN ───────────────────────────
def main():
    output_path = "/home/z/my-project/scripts/body.pdf"
    doc = TocDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=LEFT_MARGIN, rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
        title="ReviewReply Enterprise — Audit, Architecture & Roadmap",
        author="Z.ai", creator="Z.ai", subject="Strategic Audit and Roadmap"
    )

    # Build TOC first
    toc = TableOfContents()
    toc.levelStyles = [style_toc_l0, style_toc_l1, style_toc_l2]

    print("Building content...")
    build_story()

    # Prepend TOC at the start of the story (after a TOC title)
    toc_title = Paragraph('<a name="toc"/><b>Table of Contents</b>',
                          ParagraphStyle('TOCT', fontName=BASE_FONT_BOLD, fontSize=24,
                          leading=30, textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=4))
    toc_kicker = Paragraph('CONTENTS &nbsp;·&nbsp; REVIEWREPLY ENTERPRISE',
                           ParagraphStyle('TOCK', fontName=MONO_FONT, fontSize=9, leading=12,
                           textColor=ACCENT, alignment=TA_LEFT, spaceAfter=20))
    story.insert(0, PageBreak())
    story.insert(0, toc)
    story.insert(0, HRFlowable(width=60, thickness=2, color=ACCENT,
                               spaceBefore=-4, spaceAfter=10, hAlign='LEFT'))
    story.insert(0, toc_title)
    story.insert(0, toc_kicker)

    print("Rendering PDF (multi-build for TOC)...")
    doc.multiBuild(story, onFirstPage=page_frame, onLaterPages=page_frame)
    print(f"✅ Body PDF generated: {output_path}")
    return output_path

if __name__ == '__main__':
    main()
