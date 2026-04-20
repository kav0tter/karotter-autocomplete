"""
Flash Writer icon generator.

Design:
  - Dark amber/black background
  - Lightning bolt (flash) symbol in white
  - Amber (#D97706) accent dot
"""
from PIL import Image, ImageDraw
import os

BG    = (26, 18, 0, 255)
WHITE = (255, 255, 255, 255)
AMBER = (217, 119, 6, 255)


def make_icon(size):
    scale = 4
    S = size * scale
    img = Image.new("RGBA", (S, S), BG)
    d = ImageDraw.Draw(img)

    # Lightning bolt polygon (centered)
    cx, cy = S / 2, S / 2
    w, h = S * 0.42, S * 0.72
    x0, y0 = cx - w / 2, cy - h / 2

    # Top-right to center-left to bottom-left, classic lightning shape
    bolt = [
        (x0 + w * 0.62, y0),            # top-right
        (x0 + w * 0.22, y0 + h * 0.48), # mid-left
        (x0 + w * 0.52, y0 + h * 0.48), # mid-right notch
        (x0 + w * 0.38, y0 + h),        # bottom-left
        (x0 + w * 0.78, y0 + h * 0.52), # mid-right
        (x0 + w * 0.48, y0 + h * 0.52), # mid-left notch
    ]
    d.polygon(bolt, fill=WHITE)

    # Amber dot (top-right badge)
    if size >= 48:
        dot_r = S * 0.09
    else:
        dot_r = S * 0.10
    dot_cx = x0 + w + dot_r * 0.1
    dot_cy = y0 - dot_r * 0.1
    d.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=AMBER)

    img = img.resize((size, size), Image.LANCZOS)
    return img


os.makedirs("chrome/icons", exist_ok=True)
os.makedirs("icons", exist_ok=True)

for sz in [16, 48, 128]:
    icon = make_icon(sz)
    for path in [f"chrome/icons/icon{sz}.png", f"icons/icon{sz}.png"]:
        icon.save(path, "PNG")
        print(f"  saved {path}")

print("Done.")
