#!/usr/bin/env python3
"""Generate GitHub social preview image (1280x640) for claude-foreman."""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import os

WIDTH, HEIGHT = 1280, 640
ACCENT = "#f59e0b"        # amber/gold (foreman)
CLAUDE = "#a78bfa"        # purple (claude)
KIMI = "#34d399"          # emerald (windsurf/kimi)
GEMINI = "#60a5fa"        # blue (antigravity/gemini)
TEXT = "#e6edf3"
SUBTEXT = "#8b949e"
RING_BG = "#161b22"
RING_BORDER = "#30363d"
GLOVE_RED = "#ef4444"
GLOVE_DARK = "#991b1b"

def get_font(size, bold=False):
    """Try to find a suitable system font."""
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

def darken_bg(bg_img, factor=0.25):
    """Darken background image for overlay readability."""
    enhancer = ImageEnhance.Brightness(bg_img)
    return enhancer.enhance(factor)

def draw_glove(draw, cx, cy, scale=1.0, left=True):
    """Draw a cartoon boxing glove."""
    s = scale
    if left:
        # Main glove body
        draw.ellipse([cx - 35*s, cy - 25*s, cx + 25*s, cy + 35*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        # Thumb bump
        draw.ellipse([cx + 5*s, cy + 5*s, cx + 40*s, cy + 30*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        # Cuff
        draw.rounded_rectangle([cx - 30*s, cy + 25*s, cx + 20*s, cy + 45*s], radius=5, fill="#fca5a5", outline=GLOVE_DARK, width=2)
        # Shine
        draw.ellipse([cx - 20*s, cy - 15*s, cx - 5*s, cy], fill="#f87171", outline=None)
    else:
        # Mirrored for right glove
        draw.ellipse([cx - 25*s, cy - 25*s, cx + 35*s, cy + 35*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        draw.ellipse([cx - 40*s, cy + 5*s, cx - 5*s, cy + 30*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
        draw.rounded_rectangle([cx - 20*s, cy + 25*s, cx + 30*s, cy + 45*s], radius=5, fill="#fca5a5", outline=GLOVE_DARK, width=2)
        draw.ellipse([cx + 5*s, cy - 15*s, cx + 20*s, cy], fill="#f87171", outline=None)

def draw_glow_text(draw, text, xy, font, fill, glow_color="#000000", glow_radius=4):
    """Draw text with a soft glow/shadow for pop."""
    x, y = xy
    for dx in range(-glow_radius, glow_radius + 1):
        for dy in range(-glow_radius, glow_radius + 1):
            if dx*dx + dy*dy <= glow_radius*glow_radius:
                draw.text((x + dx, y + dy), text, fill=glow_color, font=font)
    draw.text((x, y), text, fill=fill, font=font)

def draw_spotlight(draw, cx, cy, radius, color):
    """Draw a soft radial spotlight effect."""
    for r in range(radius, 0, -5):
        alpha = int(30 * (1 - r / radius))
        c = f"#{color[1:]}"  # keep hex, alpha handled by overlay logic if needed
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=None, outline=c, width=2)

def main():
    # --- Load and darken ring-fight.png as background ---
    bg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ring-fight.png")
    if os.path.exists(bg_path):
        bg = Image.open(bg_path).convert("RGB")
        bg = bg.resize((WIDTH, HEIGHT), Image.LANCZOS)
        bg = darken_bg(bg, 0.22)
    else:
        bg = Image.new("RGB", (WIDTH, HEIGHT), "#0d1117")

    img = bg.copy()
    draw = ImageDraw.Draw(img)

    # Dark vignette overlay for depth
    for i in range(HEIGHT):
        darkness = int(180 * (abs(i - HEIGHT // 2) / (HEIGHT // 2)) ** 2)
        draw.line([(0, i), (WIDTH, i)], fill=(darkness // 6, darkness // 5, darkness // 4))

    title_font = get_font(80, bold=True)
    subtitle_font = get_font(26)
    label_font = get_font(20, bold=True)
    model_font = get_font(22, bold=True)
    desc_font = get_font(16)
    corner_font = get_font(15, bold=True)
    vs_font = get_font(48, bold=True)

    # --- Title with glow ---
    title = "Claude Foreman"
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    tx = (WIDTH - tw) // 2
    draw_glow_text(draw, title, (tx, 40), title_font, ACCENT, glow_color="#1a1000", glow_radius=6)

    # --- Subtitle ---
    subtitle = "Claude thinks. Free models type. Foreman makes sure it's done right."
    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    tw = bbox[2] - bbox[0]
    draw.text(((WIDTH - tw) // 2, 130), subtitle, fill="#c9d1d9", font=subtitle_font)

    # --- Corner (Claude) pill with glow ---
    corner_text = "  CORNER  "
    bbox = draw.textbbox((0, 0), corner_text, font=corner_font)
    cw = bbox[2] - bbox[0]
    ch = bbox[3] - bbox[1]
    cx = (WIDTH - cw) // 2
    cy = 190
    # Glow behind pill
    for r in range(12, 2, -2):
        draw.rounded_rectangle([cx - 12 - r, cy - 6 - r, cx + cw + 12 + r, cy + ch + 6 + r], radius=16 + r, fill=None, outline=CLAUDE, width=1)
    draw.rounded_rectangle([cx - 12, cy - 6, cx + cw + 12, cy + ch + 6], radius=16, fill="#2e1065", outline=CLAUDE, width=2)
    draw.text((cx, cy), corner_text, fill="#e9d5ff", font=corner_font)

    # --- VS badge between rings ---
    vs_x = WIDTH // 2
    vs_y = 270
    draw.ellipse([vs_x - 28, vs_y - 28, vs_x + 28, vs_y + 28], fill=ACCENT, outline="#fef3c7", width=3)
    bbox = draw.textbbox((0, 0), "VS", font=vs_font)
    vw = bbox[2] - bbox[0]
    vh = bbox[3] - bbox[1]
    draw.text((vs_x - vw // 2, vs_y - vh // 2 - 2), "VS", fill="#1a1000", font=vs_font)

    # --- Connector lines (ring ropes feel) ---
    line_y = 250
    left_ring_center = 360
    right_ring_center = 920
    for offset in (-4, 0, 4):
        draw.line([(left_ring_center, line_y + offset), (right_ring_center, line_y + offset)], fill="#30363d", width=1)
    # Drop lines
    draw.line([(left_ring_center, line_y), (left_ring_center, line_y + 25)], fill=RING_BORDER, width=2)
    draw.line([(right_ring_center, line_y), (right_ring_center, line_y + 25)], fill=RING_BORDER, width=2)

    # --- Left Ring: Windsurf / Kimi ---
    rw, rh = 340, 200
    rx1 = left_ring_center - rw // 2
    ry1 = line_y + 25
    # Glassmorphism box with subtle border glow
    for r in range(6, 0, -1):
        draw.rounded_rectangle([rx1 - r, ry1 - r, rx1 + rw + r, ry1 + rh + r], radius=20 + r, fill=None, outline=KIMI, width=1)
    draw.rounded_rectangle([rx1, ry1, rx1 + rw, ry1 + rh], radius=20, fill="#0d111799", outline=KIMI, width=2)

    # Ring label with icon feel
    ring_label = "WINDSURF RING"
    bbox = draw.textbbox((0, 0), ring_label, font=label_font)
    lw = bbox[2] - bbox[0]
    draw.text((rx1 + (rw - lw) // 2, ry1 + 16), ring_label, fill=KIMI, font=label_font)

    # Model cards inside ring
    card_h = 46
    card_margin = 24
    card_y = ry1 + 52
    card_w = rw - card_margin * 2
    card_x = rx1 + card_margin

    draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h], radius=10, fill="#0d1117cc", outline=RING_BORDER, width=1)
    draw.text((card_x + 16, card_y + 10), "Kimi k1.6  ·  SWE 1.5", fill=TEXT, font=model_font)

    card_y2 = card_y + card_h + 12
    draw.rounded_rectangle([card_x, card_y2, card_x + card_w, card_y2 + card_h], radius=10, fill="#0d1117cc", outline=RING_BORDER, width=1)
    draw.text((card_x + 16, card_y2 + 10), "quick, standard tasks", fill=SUBTEXT, font=desc_font)

    # --- Right Ring: Antigravity / Gemini ---
    rx1r = right_ring_center - rw // 2
    for r in range(6, 0, -1):
        draw.rounded_rectangle([rx1r - r, ry1 - r, rx1r + rw + r, ry1 + rh + r], radius=20 + r, fill=None, outline=GEMINI, width=1)
    draw.rounded_rectangle([rx1r, ry1, rx1r + rw, ry1 + rh], radius=20, fill="#0d111799", outline=GEMINI, width=2)

    ring_label_r = "ANTIGRAVITY RING"
    bbox = draw.textbbox((0, 0), ring_label_r, font=label_font)
    lw = bbox[2] - bbox[0]
    draw.text((rx1r + (rw - lw) // 2, ry1 + 16), ring_label_r, fill=GEMINI, font=label_font)

    draw.rounded_rectangle([rx1r + card_margin, card_y, rx1r + card_margin + card_w, card_y + card_h], radius=10, fill="#0d1117cc", outline=RING_BORDER, width=1)
    draw.text((rx1r + card_margin + 16, card_y + 10), "Gemini 3.1  ·  Gemini Flash", fill=TEXT, font=model_font)

    draw.rounded_rectangle([rx1r + card_margin, card_y2, rx1r + card_margin + card_w, card_y2 + card_h], radius=10, fill="#0d1117cc", outline=RING_BORDER, width=1)
    draw.text((rx1r + card_margin + 16, card_y2 + 10), "complex, multi-file tasks", fill=SUBTEXT, font=desc_font)

    # --- Boxing Gloves (fun elements) ---
    # Left glove near Windsurf ring
    draw_glove(draw, rx1 - 55, ry1 + rh // 2 - 10, scale=0.9, left=True)
    # Right glove near Antigravity ring
    draw_glove(draw, rx1r + rw + 55, ry1 + rh // 2 - 10, scale=0.9, left=False)
    # Small gloves near title
    draw_glove(draw, 140, 55, scale=0.5, left=False)
    draw_glove(draw, WIDTH - 140, 55, scale=0.5, left=True)
    # Tiny gloves near VS
    draw_glove(draw, vs_x - 60, vs_y + 5, scale=0.35, left=True)
    draw_glove(draw, vs_x + 60, vs_y + 5, scale=0.35, left=False)

    # --- Bottom tagline ---
    bottom = "Autonomous coding supervisor  ·  GitHub issues → free AI models  ·  Zero-cost coding"
    bbox = draw.textbbox((0, 0), bottom, font=desc_font)
    bw = bbox[2] - bbox[0]
    draw.text(((WIDTH - bw) // 2, HEIGHT - 55), bottom, fill="#8b949e", font=desc_font)

    # --- Subtle top/bottom accent lines ---
    draw.line([(0, 8), (WIDTH, 8)], fill=ACCENT, width=2)
    draw.line([(0, HEIGHT - 8), (WIDTH, HEIGHT - 8)], fill=ACCENT, width=2)

    out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "social-preview.png")
    img.save(out_path, "PNG")
    print(f"Saved to {out_path}")

if __name__ == "__main__":
    main()
