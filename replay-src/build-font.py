# Builds replay/fonts/minecraft.woff2 from Minecraft 1.8's own font sheet
# (font/ascii.png): every lit pixel becomes a square, so text drawn at a
# multiple of 8px looks exactly like the game's. Needs: pip install fonttools brotli pillow
import os
from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

here = os.path.dirname(os.path.abspath(__file__))
sheet = Image.open(os.path.join(here, 'node_modules/minecraft-assets/minecraft-assets/data/1.8.8/font/ascii.png')).convert('RGBA')
P = 125  # one font pixel; 8 pixels = 1em

glyphs = {'.notdef': None}
cmap = {}
widths = {}
for i in range(32, 256):
    ch = chr(i) if i < 128 else bytes([i]).decode('cp437')
    cx, cy = (i % 16) * 8, (i // 16) * 8
    on = [[sheet.getpixel((cx + x, cy + y))[3] > 0 for x in range(8)] for y in range(8)]
    cols = [x for x in range(8) if any(on[y][x] for y in range(8))]
    if i == 32: w = 4  # space, as in game
    elif not cols: continue
    else: w = max(cols) + 2  # glyph + 1px gap, like FontRenderer
    pen = TTGlyphPen(None)
    for y in range(8):
        x = 0
        while x < 8:
            if not on[y][x]: x += 1; continue
            s = x
            while x < 8 and on[y][x]: x += 1
            top = (7 - y) * P; bot = top - P  # row 7 is the descender row
            pen.moveTo((s * P, bot)); pen.lineTo((s * P, top)); pen.lineTo((x * P, top)); pen.lineTo((x * P, bot)); pen.closePath()
    name = 'g%d' % i
    glyphs[name] = pen.glyph()
    cmap[ord(ch)] = name
    widths[name] = w * P

pen = TTGlyphPen(None); glyphs['.notdef'] = pen.glyph(); widths['.notdef'] = 6 * P
order = list(glyphs)
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({n: (widths[n], 0) for n in order})
fb.setupHorizontalHeader(ascent=875, descent=-250)
fb.setupNameTable({'familyName': 'Minecraft', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=875, sTypoDescender=-250, usWinAscent=875, usWinDescent=250)
fb.setupPost()
fb.font.flavor = 'woff2'
out = os.path.join(here, '..', 'replay', 'fonts', 'minecraft.woff2')
fb.save(out)
print('wrote', out, os.path.getsize(out), 'bytes,', len(cmap), 'chars')
