# PNG -> WebP für die Website: python tools/webp.py <ordner mit png> <zielordner>
# Braucht Python 3 + Pillow. Qualität 84 reicht für Oberflächen-Bilder (scharfe Schrift, 30-60 KB je Bild).
import os
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name in sorted(os.listdir(src)):
    if not name.endswith('.png'):
        continue
    out = os.path.join(dst, name[:-4] + '.webp')
    Image.open(os.path.join(src, name)).convert('RGB').save(out, 'WEBP', quality=84, method=6)
    print(f'{out} ({os.path.getsize(out) // 1024} KB)')
