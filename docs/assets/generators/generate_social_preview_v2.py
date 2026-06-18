#!/usr/bin/env python3
"""Generate GitHub social preview image (1280x640) for claude-foreman.

Starts from ring-fight.png as the visual base and overlays text/cards/gloves
on top, preserving the dramatic boxing-ring atmosphere.
"""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import os

WIDTH, HEIGHT = 1280, 640
ACCENT = "#fbbf24"        # bright amber/gold
CLAUDE = "#c084fc"        # purple (claude)
KIMI = "#34d399"          # emerald (windsurf/kimi)
GEMINI = "#60a5fa"        # blue (antigravity/gemini)
TEXT = "#ffffff"
SUBTEXT = "#cbd5e1"
GLOVE_RED = "#ef4444"
GLOVE_DARK = "#7f1d1d"
RING_BORDER = "#334155"

def get_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/SFProDisplay-Bold.otf" if bold else "/System/Library/Fonts/SFProDisplay-Regular.otf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

def add_overlay_bar(img, y_start, height, alpha=160):
    """Add a semi-transparent dark bar for text readability."""
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_o = ImageDraw.Draw(overlay)
    draw_o.rectangle([0, y_start, WIDTH, y_start + height], fill=(0, 0, 0, alpha))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def draw_glow_text(draw, text, xy, font, fill, glow_color=(0, 0, 0, 180), glow_radius=5):
    x, y = xy
    for dx in range(-glow_radius, glow_radius + 1):
        for dy in range(-glow_radius, glow_radius + 1):
            if dx*dx + dy*dy <= glow_radius*glow_radius:
                draw.text((x + dx, y + dy), text, fill=glow_color, font=font)
    draw.text((x, y), text, fill=fill, font=font)

def draw_glove(draw, cx, cy, scale=1.0, left=True):
    s = scale
    if left:
        draw.ellipse([cx - 35*s, cy - 25*s, cx + 25*s, cy + 35*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        draw.ellipse([cx + 5*s, cy + 5*s, cx + 40*s, cy + 30*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        draw.rounded_rectangle([cx - 30*s, cy + 25*s, cx + 20*s, cy + 45*s], radius=5, fill="#fca5a5", outline=GLOVE_DARK, width=2)
        draw.ellipse([cx - 20*s, cy - 15*s, cx - 5*s, cy], fill="#f87171")
    else:
        draw.ellipse([cx - 25*s, cy - 25*s, cx + 35*s, cy + 35*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        draw.ellipse([cx - 40*s, cy + 5*s, cx - 5*s, cy + 30*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        draw.rounded_rectangle([cx - 20*s, cy + 25*s, cx + 30*s, cy + 45*s], radius=5, fill="#fca5a5", outline=GLOVE_DARK, width=2)
        draw.ellipse([cx + 5*s, cy - 15*s, cx + 20*s, cy], fill="#f87171")

def main():
    # --- Start from ring-fight.png ---
    bg_path = "/Users/hayssamhoballah/CascadeProjects/claude-foreman/ring-fight.png"
    if not os.path.exists(bg_path):
        raise FileNotFoundError(f"Background image not found: {bg_path}")

    bg = Image.open(bg_path).convert("RGBA")
    # Ensure exact size
    if bg.size != (WIDTH, HEIGHT):
        bg = bg.resize((WIDTH, HEIGHT), Image.LANCZOS)

    # --- Fonts ---
    title_font = get_font(78, bold=True)
    subtitle_font = get_font(24)
    label_font = get_font(19, bold=True)
    model_font = get_font(20, bold=True)
    desc_font = get_font(15)
    corner_font = get_font(14, bold=True)
    vs_font = get_font(44, bold=True)
    tag_font = get_font(14)

    # --- 1. Top bar overlay for title ---
    img = add_overlay_bar(bg, 0, 110, alpha=140)
    draw = ImageDraw.Draw(img)

    # --- Title ---
    title = "Claude Foreman"
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    tx = (WIDTH - tw) // 2
    draw_glow_text(draw, title, (tx, 18), title_font, ACCENT, glow_radius=6)

    # --- Subtitle ---
    subtitle = "Claude thinks. Free models type. Foreman makes sure it's done right."
    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    tw = bbox[2] - bbox[0]
    draw.text(((WIDTH - tw) // 2, 82), subtitle, fill=SUBTEXT, font=subtitle_font)

    # --- 2. Bottom bar overlay for tagline ---
    img = add_overlay_bar(img, HEIGHT - 42, 42, alpha=160)
    draw = ImageDraw.Draw(img)

    bottom = "Autonomous coding supervisor  ·  GitHub issues → free AI models  ·  Zero-cost coding"
    bbox = draw.textbbox((0, 0), bottom, font=tag_font)
    bw = bbox[2] - bbox[0]
    draw.text(((WIDTH - bw) // 2, HEIGHT - 32), bottom, fill="#94a3b8", font=tag_font)

    draw = ImageDraw.Draw(img)

    # --- 3. CORNER pill (Claude) ---
    corner_text = "  CORNER  "
    bbox = draw.textbbox((0, 0), corner_text, font=corner_font)
    cw = bbox[2] - bbox[0]
    ch = bbox[3] - bbox[1]
    cx = (WIDTH - cw) // 2
    cy = 125
    # Glow
    for r in range(10, 2, -2):
        draw.rounded_rectangle([cx - 10 - r, cy - 4 - r, cx + cw + 10 + r, cy + ch + 4 + r],
                               radius=14 + r, fill=None, outline=CLAUDE, width=1)
    draw.rounded_rectangle([cx - 10, cy - 4, cx + cw + 10, cy + ch + 4],
                           radius=14, fill=(46, 16, 101, 200), outline=CLAUDE, width=2)
    draw.text((cx, cy), corner_text, fill="#e9d5ff", font=corner_font)

    # --- 4. VS badge (center, just above the referee's head area) ---
    vs_x = WIDTH // 2
    vs_y = 250
    draw.ellipse([vs_x - 26, vs_y - 26, vs_x + 26, vs_y + 26], fill=ACCENT, outline="#fef3c7", width=3)
    bbox = draw.textbbox((0, 0), "VS", font=vs_font)
    vw = bbox[2] - bbox[0]
    vh = bbox[3] - bbox[1]
    draw.text((vs_x - vw // 2, vs_y - vh // 2 - 2), "VS", fill="#1a1000", font=vs_font)

    # --- 5. Ring cards (positioned to look like they belong in the scene) ---
    # Left card: Windsurf / Kimi  (upper-left quadrant, above the ropes)
    rw, rh = 300, 160
    rx1 = 55
    ry1 = 300
    # Soft glow behind card
    for r in range(8, 0, -2):
        draw.rounded_rectangle([rx1 - r, ry1 - r, rx1 + rw + r, ry1 + rh + r],
                             radius=16 + r, fill=None, outline=KIMI, width=1)
    draw.rounded_rectangle([rx1, ry1, rx1 + rw, ry1 + rh], radius=16,
                           fill=(13, 17, 23, 180), outline=KIMI, width=2)

    ring_label = "WINDSURF RING"
    bbox = draw.textbbox((0, 0), ring_label, font=label_font)
    lw = bbox[2] - bbox[0]
    draw.text((rx1 + (rw - lw) // 2, ry1 + 14), ring_label, fill=KIMI, font=label_font)

    card_h = 40
    card_margin = 20
    card_y = ry1 + 46
    card_w = rw - card_margin * 2
    card_x = rx1 + card_margin

    draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=8,
                           fill=(13, 17, 23, 160), outline=RING_BORDER, width=1)
    draw.text((card_x + 14, card_y + 9), "Kimi k1.6  ·  SWE 1.5", fill=TEXT, font=model_font)

    card_y2 = card_y + card_h + 10
    draw.rounded_rectangle([card_x, card_y2, card_x + card_w, card_y2 + card_h], radius=8,
                           fill=(13, 17, 23, 160), outline=RING_BORDER, width=1)
    draw.text((card_x + 14, card_y2 + 9), "quick, standard tasks", fill=SUBTEXT, font=desc_font)

    # Right card: Antigravity / Gemini
    rx1r = WIDTH - rw - 55
    for r in range(8, 0, -2):
        draw.rounded_rectangle([rx1r - r, ry1 - r, rx1r + rw + r, ry1 + rh + r],
                             radius=16 + r, fill=None, outline=GEMINI, width=1)
    draw.rounded_rectangle([rx1r, ry1, rx1r + rw, ry1 + rh], radius=16,
                           fill=(13, 17, 23, 180), outline=GEMINI, width=2)

    ring_label_r = "ANTIGRAVITY RING"
    bbox = draw.textbbox((0, 0), ring_label_r, font=label_font)
    lw = bbox[2] - bbox[0]
    draw.text((rx1r + (rw - lw) // 2, ry1 + 14), ring_label_r, fill=GEMINI, font=label_font)

    draw.rounded_rectangle([rx1r + card_margin, card_y, rx1r + card_margin + card_w, card_y + card_h], radius=8,
                           fill=(13, 17, 23, 160), outline=RING_BORDER, width=1)
    draw.text((rx1r + card_margin + 14, card_y + 9), "Gemini 3.1  ·  Gemini Flash", fill=TEXT, font=model_font)

    draw.rounded_rectangle([rx1r + card_margin, card_y2, rx1r + card_margin + card_w, card_y2 + card_h], radius=8,
                           fill=(13, 17, 23, 160), outline=RING_BORDER, width=1)
    draw.text((rx1r + card_margin + 14, card_y2 + 9), "complex, multi-file tasks", fill=SUBTEXT, font=desc_font)

    # --- 6. Boxing gloves (fun) ---
    # Left of left card
    draw_glove(draw, rx1 - 50, ry1 + rh // 2, scale=0.85, left=True)
    # Right of right card
    draw_glove(draw, rx1r + rw + 50, ry1 + rh // 2, scale=0.85, left=False)
    # Small ones near the VS badge
    draw_glove(draw, vs_x - 55, vs_y + 2, scale=0.30, left=True)
    draw_glove(draw, vs_x + 55, vs_y + 2, scale=0.30, left=False)
    # Decorative near top corners
    draw_glove(draw, 100, 60, scale=0.4, left=False)
    draw_glove(draw, WIDTH - 100, 60, scale=0.4, left=True)

    # --- 7. Top accent line ---
    draw.line([(0, 4), (WIDTH, 4)], fill=ACCENT, width=3)

    # Convert back to RGB for PNG save
    final = img.convert("RGB")
    out_path = "/Users/hayssamhoballah/CascadeProjects/claude-foreman/social-preview.png"
    final.save(out_path, "PNG")
    print(f"Saved to {out_path}")

if __name__ == "__main__":
    main()
