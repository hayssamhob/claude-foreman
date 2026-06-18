#!/usr/bin/env python3
"""Generate GitHub social preview image (1280x640) for claude-foreman.

Starts from ring-fight.png as the base image. Adds only the title and subtitle text.
"""

from PIL import Image, ImageDraw, ImageFont
import os

WIDTH, HEIGHT = 1280, 640

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
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_o = ImageDraw.Draw(overlay)
    draw_o.rectangle([0, y_start, img.size[0], y_start + height], fill=(0, 0, 0, alpha))
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def main():
    bg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ring-fight.png")
    if not os.path.exists(bg_path):
        raise FileNotFoundError(f"Background image not found: {bg_path}")

    bg = Image.open(bg_path).convert("RGBA")
    if bg.size != (WIDTH, HEIGHT):
        bg = bg.resize((WIDTH, HEIGHT), Image.LANCZOS)

    title_font = get_font(110, bold=True)
    subtitle_font = get_font(26)

    # Top bar for title readability — taller for the big title
    img = add_overlay_bar(bg, 0, 170, alpha=160)
    draw = ImageDraw.Draw(img)

    # --- Boxing gloves flanking the title (fighting toward center) ---
    GLOVE_RED = "#ef4444"
    GLOVE_DARK = "#7f1d1d"

    def draw_glove_horizontal(draw, cx, cy, scale=1.0, pointing="right"):
        """Draw a horizontal boxing glove pointing left or right toward the title."""
        s = scale
        if pointing == "right":
            # On the left side of image, punching right toward center
            # Main body: wide horizontal ellipse
            draw.ellipse([cx - 25*s, cy - 22*s, cx + 35*s, cy + 22*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
            # Thumb bump on the right side, slightly below
            draw.ellipse([cx + 15*s, cy + 8*s, cx + 48*s, cy + 28*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
            # Cuff on the far left
            draw.rounded_rectangle([cx - 42*s, cy - 18*s, cx - 12*s, cy + 18*s], radius=6, fill="#fca5a5", outline=GLOVE_DARK, width=2)
            # Shine highlight on top-left of body
            draw.ellipse([cx - 10*s, cy - 12*s, cx + 12*s, cy - 2*s], fill="#f87171")
        else:
            # On the right side of image, punching left toward center (mirrored)
            draw.ellipse([cx - 35*s, cy - 22*s, cx + 25*s, cy + 22*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
            draw.ellipse([cx - 48*s, cy + 8*s, cx - 15*s, cy + 28*s], fill=GLOVE_RED, outline=GLOVE_DARK, width=2)
            draw.rounded_rectangle([cx + 12*s, cy - 18*s, cx + 42*s, cy + 18*s], radius=6, fill="#fca5a5", outline=GLOVE_DARK, width=2)
            draw.ellipse([cx - 12*s, cy - 12*s, cx + 10*s, cy - 2*s], fill="#f87171")

    # Primary gloves: large, pointing toward the title from both sides
    draw_glove_horizontal(draw, 105, 60, scale=1.15, pointing="right")
    draw_glove_horizontal(draw, WIDTH - 105, 60, scale=1.15, pointing="left")
    # Secondary gloves: smaller, behind and staggered
    draw_glove_horizontal(draw, 55, 90, scale=0.75, pointing="right")
    draw_glove_horizontal(draw, WIDTH - 55, 90, scale=0.75, pointing="left")

    # --- Title with heavy glow/shadow for impact ---
    title = "Claude Foreman"
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    tx = (WIDTH - tw) // 2
    # Thick black outline/glow
    for dx in range(-5, 6):
        for dy in range(-5, 6):
            if dx*dx + dy*dy <= 25:
                draw.text((tx + dx, 18 + dy), title, fill=(0, 0, 0, 200), font=title_font)
    draw.text((tx, 18), title, fill="#fbbf24", font=title_font)

    # --- Subtitle below title ---
    subtitle = "Claude thinks. Free models type. Foreman makes sure it's done right."
    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    tw = bbox[2] - bbox[0]
    draw.text(((WIDTH - tw) // 2, 130), subtitle, fill="#cbd5e1", font=subtitle_font)

    final = img.convert("RGB")
    out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "social-preview.png")
    final.save(out_path, "PNG", optimize=True, compress_level=9)
    size = os.path.getsize(out_path)
    if size > 1_000_000:
        # Switch to JPEG if PNG is still too large
        final.save(out_path, "JPEG", quality=92, optimize=True)
        size = os.path.getsize(out_path)
    print(f"Saved to {out_path} ({size / 1024 / 1024:.2f} MB)")

if __name__ == "__main__":
    main()
