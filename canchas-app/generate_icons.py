import os
from PIL import Image, ImageDraw

SIZE = 1024
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 1. Base Squircle (Badge)
pad = 48
r = 260

# Background fill: deep dark slate
draw.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=r, fill=(11, 17, 32, 255))

# Outer emerald border (vibrant)
draw.rounded_rectangle([pad, pad, SIZE - pad, SIZE - pad], radius=r, outline=(52, 211, 153, 240), width=26)

# 2. Central Athletic Court
court_w, court_h = 380, 380
cx, cy = SIZE // 2, SIZE // 2
c_left, c_top = cx - court_w // 2, cy - court_h // 2
c_right, c_bottom = cx + court_w // 2, cy + court_h // 2

# Turf background
draw.rounded_rectangle([c_left, c_top, c_right, c_bottom], radius=48, fill=(6, 78, 59, 255), outline=(52, 211, 153, 240), width=22)

# Court net (vertical line)
for ny in range(c_top + 16, c_bottom - 16, 40):
    draw.line([cx, ny, cx, min(ny + 24, c_bottom - 16)], fill=(248, 250, 252, 245), width=18)

# Center service line (horizontal)
draw.line([c_left + 16, cy, c_right - 16, cy], fill=(110, 231, 183, 220), width=14)

# Center spot
draw.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=(248, 250, 252, 255))

# 3. Bold Athletic "C" Framing the Court
arc_pad = 180
bbox = [arc_pad, arc_pad, SIZE - arc_pad, SIZE - arc_pad]
draw.arc(bbox, start=36, end=324, fill=(16, 185, 129, 255), width=74)
draw.arc([arc_pad + 8, arc_pad + 8, SIZE - arc_pad - 8, SIZE - arc_pad - 8], start=36, end=324, fill=(52, 211, 153, 200), width=20)

# 4. Neon Athletic Sphere (Ball)
bx, by = SIZE - 280, 260
br = 74
draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(190, 242, 100, 255), outline=(20, 83, 45, 255), width=14)
# Seam curve
draw.arc([bx - br + 16, by - br + 12, bx + br - 12, by + br - 16], start=190, end=345, fill=(255, 255, 255, 230), width=10)

base_dir = os.path.dirname(os.path.abspath(__file__))
public_dir = os.path.join(base_dir, 'public')
app_dir = os.path.join(base_dir, 'src', 'app')

os.makedirs(public_dir, exist_ok=True)
os.makedirs(app_dir, exist_ok=True)

# Save Master PNGs
img.save(os.path.join(public_dir, 'icon-512.png'), 'PNG')
img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'icon-192.png'), 'PNG')
img.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'apple-touch-icon.png'), 'PNG')
img.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'favicon-32x32.png'), 'PNG')
img.resize((16, 16), Image.Resampling.LANCZOS).save(os.path.join(public_dir, 'favicon-16x16.png'), 'PNG')

# Save ICO to both locations
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(os.path.join(app_dir, 'favicon.ico'), format='ICO', sizes=ico_sizes)
img.save(os.path.join(public_dir, 'favicon.ico'), format='ICO', sizes=ico_sizes)

print('Success! All icons and favicons generated.')
