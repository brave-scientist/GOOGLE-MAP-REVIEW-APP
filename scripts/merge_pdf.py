#!/usr/bin/env python3
"""Merge cover PDF + body PDF into final deliverable."""
from pypdf import PdfReader, PdfWriter
import os, sys

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    # Always scale to exact A4 to ensure consistent page sizes across merge
    if abs(w - A4_W) > 0.5 or abs(h - A4_H) > 0.5:
        page.scale_to(A4_W, A4_H)
    return page

def insert_cover(cover_pdf, body_pdf, output_pdf):
    writer = PdfWriter()
    cover_page = PdfReader(cover_pdf).pages[0]
    writer.add_page(normalize_page_to_a4(cover_page))
    for page in PdfReader(body_pdf).pages:
        writer.add_page(normalize_page_to_a4(page))
    writer.add_metadata({
        '/Title': 'ReviewReply Enterprise — Audit, Architecture & Roadmap',
        '/Author': 'Z.ai',
        '/Creator': 'Z.ai',
        '/Subject': 'Strategic audit, design + dev architecture, and 24-week roadmap',
    })
    with open(output_pdf, 'wb') as f:
        writer.write(f)
    size_kb = os.path.getsize(output_pdf) / 1024
    n_pages = len(PdfReader(output_pdf).pages)
    print(f"✅ Final PDF: {output_pdf}")
    print(f"   Pages: {n_pages}")
    print(f"   Size:  {size_kb:.1f} KB")

if __name__ == '__main__':
    insert_cover(
        '/home/z/my-project/scripts/cover.pdf',
        '/home/z/my-project/scripts/body.pdf',
        '/home/z/my-project/download/ReviewReply_Enterprise_Audit_Roadmap.pdf',
    )
