"""Builds the item icons (quick buy, hotbar, cosmetic categories, wood
skins) from the replay viewer's texture atlases.

    python3 tools/item-icons.py

Writes src/assets/items.png (one row of 64x64 icons; blocks drawn as 3D
cubes the way the game's inventory shows them, items as sharp pixels) and
src/data/item-icons.json ({ id: index }). Run it again only when the icons
change.
"""
import json
import os
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
site = os.path.dirname(here)
replay = os.path.join(site, '..', 'replay')
meta = json.load(open(os.path.join(replay, 'blocks.json')))
blocks = Image.open(os.path.join(replay, 'blocks.png')).convert('RGBA')
items = Image.open(os.path.join(replay, 'items.png')).convert('RGBA')


def item(name):
    t = meta['items']['textures'][name]
    return items.crop((t['x'], t['y'], t['x'] + 16, t['y'] + 16))


def block(name):
    t = meta['textures'][name]
    return blocks.crop((t['x'], t['y'], t['x'] + 16, t['y'] + 16))


def tint(img, rgb):
    r, g, b = rgb
    px = img.load()
    out = img.copy()
    po = out.load()
    for y in range(img.height):
        for x in range(img.width):
            pr, pg, pb, pa = px[x, y]
            po[x, y] = (pr * r // 255, pg * g // 255, pb * b // 255, pa)
    return out


def potion(rgb):
    base = tint(item('potion_overlay'), rgb)
    base.alpha_composite(item('potion'))
    return base


def chest():
    t = meta['textures']['entity/chest/normal']
    s = t['w'] // 64
    tex = blocks.crop((t['x'], t['y'], t['x'] + t['w'], t['y'] + t['h'])).resize((64, 64), Image.NEAREST) if s != 1 else blocks.crop((t['x'], t['y'], t['x'] + 64, t['y'] + 64))
    out = Image.new('RGBA', (16, 16))
    out.paste(tex.crop((14, 14, 28, 19)), (1, 1))   # lid front
    out.paste(tex.crop((14, 34, 28, 44)), (1, 6))   # base front
    out.paste(tex.crop((1, 1, 3, 5)), (7, 4))       # latch
    return out



CELL = 64


def up(img):
    """A flat 16x16 texture, scaled up with sharp pixels."""
    return img.resize((CELL, CELL), Image.NEAREST)


def shade(img, f):
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * f), int(g * f), int(b * f), a)
    return out


def cube(top, left, right=None, drop=0):
    """A block as the inventory draws it: top, left and right faces."""
    right = right or left
    S = 4 * CELL           # draw big, then shrink for smooth edges
    k = S / 32             # 32-unit cube space -> pixels
    out = Image.new('RGBA', (S, S))
    big = lambda t: t.resize((16 * 16, 16 * 16), Image.NEAREST)
    m = 16                 # texels -> big texture pixels
    faces = [
        # (texture, shade, inverse affine in cube units, polygon)
        (top, 1.0, (0.5, 1, -8 - drop, -0.5, 1, 8 - drop), [(16, drop), (32, 8 + drop), (16, 16 + drop), (0, 8 + drop)]),
        (left, 0.78, (1, 0, 0, -0.5, 1, -8), [(0, 8), (16, 16), (16, 32), (0, 24)]),
        (right, 0.6, (1, 0, -16, 0.5, 1, -24), [(16, 16), (32, 8), (32, 24), (16, 32)]),
    ]
    from PIL import ImageDraw
    for tex, f, (a, b, c, d, e, g), poly in faces:
        t = big(shade(tex, f))
        # output pixel (X, Y) -> cube units (X/k, Y/k) -> texel -> big texture pixel
        data = (a / k * m, b / k * m, c * m, d / k * m, e / k * m, g * m)
        face = t.transform((S, S), Image.AFFINE, data, Image.NEAREST)
        mask = Image.new('L', (S, S))
        ImageDraw.Draw(mask).polygon([(x * k, y * k) for x, y in poly], fill=255)
        from PIL import ImageChops
        face.putalpha(ImageChops.multiply(face.getchannel('A'), mask))
        out.alpha_composite(face)
    pad = int(S * 0.06)
    out = out.resize((S - 2 * pad, S - 2 * pad), Image.LANCZOS)
    framed = Image.new('RGBA', (S, S))
    framed.paste(out, (pad, pad))
    return framed.resize((CELL, CELL), Image.BOX)


def block_cube(name, top=None):
    side = block(name)
    return cube(block(top) if top else side, side)


def grass():
    top = tint(block('block/grass_block_top'), (124, 189, 107))
    side = block('block/grass_block_side')
    over = tint(block('block/grass_block_side_overlay'), (124, 189, 107))
    side.alpha_composite(over)
    return cube(top, side)


def planks(kind):
    p = block(f'block/{kind}_planks')
    return cube(p, p)


def bed():
    """The foot of a bed as a low block (the top 7 rows of its sides are empty)."""
    top = block('blocks/bed_feet_top').rotate(90)
    return cube(top, block('blocks/bed_feet_side'), block('blocks/bed_feet_end'), drop=7)


def _center(img):
    bbox = img.getbbox()
    if not bbox:
        return img
    c = img.crop(bbox)
    out = Image.new('RGBA', (CELL, CELL))
    out.paste(c, ((CELL - c.width) // 2, (CELL - c.height) // 2))
    return out


COMPASS = [
    "......XXXX......",
    "....XXwwwwXX....",
    "...XwwggggwwX...",
    "..XwggggggggwX..",
    "..XwgggggRRgwX..",
    ".XwggggggRRggwX.",
    ".XwgggggRRgggwX.",
    ".Xwggggg@ggggwX.",
    ".XwggggSSgggggX.",
    ".XwgggSSggggwwX.",
    "..XwggSgggggwX..",
    "..XwggggggggwX..",
    "...XwwggggwwX...",
    "....XXwwwwXX....",
    "......XXXX......",
    "................",
]
COMPASS_COLORS = {'X': (60, 60, 66), 'w': (168, 168, 176), 'g': (96, 98, 110), 'R': (214, 52, 52), 'S': (210, 210, 220), '@': (40, 40, 44)}


def compass():
    img = Image.new('RGBA', (16, 16))
    px = img.load()
    for y, row in enumerate(COMPASS):
        for x, ch in enumerate(row):
            if ch in COMPASS_COLORS:
                px[x, y] = COMPASS_COLORS[ch] + (255,)
    return up(img)


def flat(fn):
    return lambda: up(fn())


ICONS = {
    # quick buy
    'wool': lambda: block_cube('block/white_wool'),
    'hardened_clay': lambda: block_cube('block/terracotta'),
    'blast-proof_glass': lambda: block_cube('block/glass'),
    'end_stone': lambda: block_cube('block/end_stone'),
    'ladder': flat(lambda: block('block/ladder')),
    'oak_wood_planks': lambda: planks('oak'),
    'obsidian': lambda: block_cube('block/obsidian'),
    'stone_sword': flat(lambda: item('stone_sword')),
    'iron_sword': flat(lambda: item('iron_sword')),
    'diamond_sword': flat(lambda: item('diamond_sword')),
    'stick_(knockback_i)': flat(lambda: item('stick')),
    'chainmail_boots': flat(lambda: item('chainmail_boots')),
    'iron_boots': flat(lambda: item('iron_boots')),
    'diamond_boots': flat(lambda: item('diamond_boots')),
    'shears': flat(lambda: item('shears')),
    'wooden_pickaxe': flat(lambda: item('wooden_pickaxe')),
    'wooden_axe': flat(lambda: item('wooden_axe')),
    'arrow': flat(lambda: item('arrow')),
    'bow': flat(lambda: item('bow')),
    'bow_(power_i)': flat(lambda: item('bow')),
    'bow_(power_i__punch_i)': flat(lambda: item('bow')),
    'speed_ii_potion_(45_seconds)': flat(lambda: potion((124, 175, 198))),
    'jump_v_potion_(45_seconds)': flat(lambda: potion((34, 255, 76))),
    'invisibility_potion_(30_seconds)': flat(lambda: potion((127, 131, 146))),
    'golden_apple': flat(lambda: item('golden_apple')),
    'bedbug': flat(lambda: item('snowball')),
    'dream_defender': flat(lambda: tint(item('egg'), (200, 190, 175))),
    'fireball': flat(lambda: item('fire_charge')),
    'tnt': lambda: cube(block('block/tnt_top'), block('block/tnt_side')),
    'ender_pearl': flat(lambda: item('ender_pearl')),
    'water_bucket': flat(lambda: item('water_bucket')),
    'bridge_egg': flat(lambda: item('egg')),
    'magic_milk': flat(lambda: item('milk_bucket')),
    'sponge': lambda: block_cube('block/sponge'),
    'compact_pop-up_tower': flat(chest),
    'popup_tower': flat(chest),
    # hotbar
    'compass': compass,
    # cosmetic categories (for cosmetics with no picture of their own)
    'cat:final': flat(lambda: item('nether_star')),
    'cat:dance': flat(lambda: item('firework_rocket')),
    'cat:msg': flat(lambda: item('writable_book')),
    'cat:topper': grass,
    'cat:trail': flat(lambda: item('spectral_arrow')),
    'cat:bed': bed,
    'cat:cry': flat(lambda: item('music_disc_cat')),
    'cat:spray': flat(lambda: item('painting')),
    'cat:glyph': flat(lambda: item('filled_map')),
    'cat:shop': flat(lambda: item('emerald')),
    'cat:wood': lambda: planks('oak'),
    'cat:figurine': flat(lambda: item('armor_stand')),
    # stats and page icons
    'res:iron': flat(lambda: item('iron_ingot')),
    'res:gold': flat(lambda: item('gold_ingot')),
    'res:diamond': flat(lambda: item('diamond')),
    'res:emerald': flat(lambda: item('emerald')),
    'ui:sword': flat(lambda: item('diamond_sword')),
    'ui:iron_sword': flat(lambda: item('iron_sword')),
    'ui:bed': bed,
    'ui:nametag': flat(lambda: item('name_tag')),
    'ui:book': flat(lambda: item('writable_book')),
    'ui:enchanted_book': flat(lambda: item('enchanted_book')),
    'ui:map': flat(lambda: item('filled_map')),
    'ui:eye': flat(lambda: item('ender_eye')),
    'ui:totem': flat(lambda: item('totem_of_undying')),
    'ui:helmet': flat(lambda: item('golden_helmet')),
    'ui:disc': flat(lambda: item('music_disc_13')),
    'ui:star': flat(lambda: item('nether_star')),
    'ui:rocket': flat(lambda: item('firework_rocket')),
    'ui:clock': compass,
    'ui:apple': flat(lambda: item('golden_apple')),
    'ui:pearl': flat(lambda: item('ender_pearl')),
    'ui:xp': flat(lambda: item('experience_bottle')),
    'ui:paper': flat(lambda: item('paper')),
    'ui:shears': flat(lambda: item('shears')),
    'ui:fireball': flat(lambda: item('fire_charge')),
    'block:gold': lambda: block_cube('block/gold_block'),
    'block:iron': lambda: block_cube('block/iron_block'),
    'block:diamond': lambda: block_cube('block/diamond_block'),
    'block:emerald': lambda: block_cube('block/emerald_block'),
    'block:bookshelf': lambda: cube(block('block/oak_planks'), block('block/bookshelf')),
    'block:crafting': lambda: cube(block('block/crafting_table_top'), block('block/crafting_table_front'), block('block/crafting_table_side')),
    'block:enchanting': lambda: cube(block('block/enchanting_table_top'), block('block/enchanting_table_side')),
    'block:beacon': lambda: block_cube('block/beacon'),
    'block:end_stone': lambda: block_cube('block/end_stone'),
    'block:red_wool': lambda: block_cube('block/red_wool'),
    'block:blue_wool': lambda: block_cube('block/blue_wool'),
    'block:lime_wool': lambda: block_cube('block/lime_wool'),
    'block:yellow_wool': lambda: block_cube('block/yellow_wool'),
    'block:glass': lambda: block_cube('block/light_blue_stained_glass'),
    'block:obsidian': lambda: block_cube('block/obsidian'),
    'block:tnt': lambda: cube(block('block/tnt_top'), block('block/tnt_side')),
    'block:grass': grass,
    'block:jukebox': lambda: cube(block('block/jukebox_top'), block('block/jukebox_side')),
    'block:sea_lantern': lambda: block_cube('block/sea_lantern'),
    'block:glowstone': lambda: block_cube('block/glowstone'),
    # wood skins
    'wood:oak': lambda: planks('oak'),
    'wood:spruce': lambda: planks('spruce'),
    'wood:birch': lambda: planks('birch'),
    'wood:jungle': lambda: planks('jungle'),
    'wood:acacia': lambda: planks('acacia'),
    'wood:dark_oak': lambda: planks('dark_oak'),
}

sheet = Image.new('RGBA', (CELL * len(ICONS), CELL))
index = {}
for i, (key, make) in enumerate(ICONS.items()):
    img = make()
    assert img.size == (CELL, CELL), (key, img.size)
    sheet.paste(img, (i * CELL, 0))
    index[key] = i
# 256 colours keeps the sheet small (about a fifth of the size) with no visible change.
sheet.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE).save(os.path.join(site, 'src', 'assets', 'items.png'), optimize=True)
json.dump({'size': CELL, 'count': len(ICONS), 'index': index}, open(os.path.join(site, 'src', 'data', 'item-icons.json'), 'w'), indent=0)
print(len(ICONS), 'icons')
