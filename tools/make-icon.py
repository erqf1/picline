"""Erzeugt das Picline-Logo (assets/icon.ico, icon.png, icon.icns): verschwommene Farben hinter Milchglas (Acryl),
darauf das weiße Symbol. Gleicher Aufbau wie das Logo von Vidline, nur eigene Farben und eigenes Zeichen.
Braucht Pillow und PySide6. Aufruf aus dem Projektordner: python tools/make-icon.py"""
import struct
from io import BytesIO

from PIL import Image, ImageChops, ImageDraw, ImageFilter
from PySide6.QtCore import QByteArray
from PySide6.QtGui import QGuiApplication, QImage, QPainter
from PySide6.QtSvg import QSvgRenderer

S = 1024
# Farbflecken: Mitte x, y und Radius in Prozent der Kachel, dazu die Farbe
BLOBS = [(76, 18, 34, (238, 84, 170)), (18, 20, 32, (126, 80, 244)), (20, 84, 36, (56, 170, 200)), (84, 84, 34, (248, 150, 90)), (50, 50, 20, (80, 44, 110))]
GLYPH = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="13" y="13" width="8" height="8" rx="1.2" fill="#fff" opacity=".95"/><rect x="21" y="21" width="8" height="8" rx="1.2" fill="#fff" opacity=".7"/><rect x="13" y="29" width="8" height="8" rx="1.2" fill="#fff" opacity=".45"/>
<path d="M47.5 15.5a3.4 3.4 0 0 1 4.8 4.8L37.6 35l-4.8-4.8z" fill="#fff"/>
<path d="M31.6 32.4c-3.8-.5-6.9 2.2-7.2 5.8-.3 2.9-1.5 4.8-3.8 6 6.2 2.2 12.6.7 14.8-3.6 1-2 .7-4.1-.3-5.7z" fill="#fff"/></svg>"""

app = QGuiApplication([])


def rounded(box, radius):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius, fill=255)
    return m


def glyph_mask():
    r = QSvgRenderer(QByteArray(GLYPH.encode()))
    im = QImage(S, S, QImage.Format_ARGB32_Premultiplied)
    im.fill(0)
    p = QPainter(im)
    r.render(p)
    p.end()
    return Image.frombytes('RGBA', (S, S), bytes(im.constBits()), 'raw', 'BGRA').getchannel('A')


def tile():
    im = Image.new('RGB', (S, S), (40, 37, 44))
    d = ImageDraw.Draw(im)
    for x, y, r, col in BLOBS:
        c = S / 100
        d.ellipse(((x - r) * c, (y - r) * c, (x + r) * c, (y + r) * c), fill=col)
    im = im.filter(ImageFilter.GaussianBlur(170))
    # Tönung wie beim Acryl
    im = Image.blend(im, Image.new('RGB', (S, S), (30, 28, 34)), .26)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    mask = rounded((41, 41, 983, 983), 214)
    out.paste(im, (0, 0), mask)
    # Licht von oben und helle Glaskante
    sheen = Image.new('L', (S, S), 0)
    for y in range(41, 520):
        ImageDraw.Draw(sheen).line([(0, y), (S, y)], fill=int(46 * (1 - (y - 41) / 479) ** 2))
    out.paste(Image.new('RGBA', (S, S), (255, 255, 255, 255)), (0, 0), ImageChops.multiply(sheen, mask))
    rim = ImageChops.subtract(mask, rounded((51, 51, 973, 973), 204))
    fade = Image.new('L', (S, S), 0)
    for y in range(S):
        ImageDraw.Draw(fade).line([(0, y), (S, y)], fill=int(120 - 84 * y / S))
    out.paste(Image.new('RGBA', (S, S), (255, 255, 255, 255)), (0, 0), ImageChops.multiply(rim, fade))
    return out


def with_glyph(base):
    g = glyph_mask()
    out = base.copy()
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.paste(Image.new('RGBA', (S, S), (10, 8, 14, 150)), (0, 22), g)
    out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
    out.paste(Image.new('RGBA', (S, S), (255, 255, 255, 245)), (0, 0), g)
    return out


BASE = tile()
M = with_glyph(BASE)


def png(size):
    b = BytesIO()
    M.resize((size, size), Image.LANCZOS).save(b, 'PNG')
    return b.getvalue()


sizes = [16, 24, 32, 48, 64, 128, 256]
data = [png(s) for s in sizes]
ico = struct.pack('<HHH', 0, 1, len(sizes))
off = 6 + 16 * len(sizes)
for s, d in zip(sizes, data):
    ico += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(d), off)
    off += len(d)
open('assets/icon.ico', 'wb').write(ico + b''.join(data))
M.resize((512, 512), Image.LANCZOS).save('assets/icon.png')
chunks = b''
for tag, sz in ((b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024)):
    d = png(sz)
    chunks += tag + struct.pack('>I', len(d) + 8) + d
open('assets/icon.icns', 'wb').write(b'icns' + struct.pack('>I', len(chunks) + 8) + chunks)
print('ok')
