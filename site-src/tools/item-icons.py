"""Builds the quickbuy item icons from the replay viewer's texture atlases.

    python3 tools/item-icons.py

Writes src/assets/items.png (one row of 16x16 icons) and
src/data/item-icons.json ({ shop item id: index }). Run it again only when
the shop items change.
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


ICONS = {
    'wool': lambda: block('block/white_wool'),
    'hardened_clay': lambda: block('block/terracotta'),
    'blast-proof_glass': lambda: block('block/glass'),
    'end_stone': lambda: block('block/end_stone'),
    'ladder': lambda: block('block/ladder'),
    'oak_wood_planks': lambda: block('block/oak_planks'),
    'obsidian': lambda: block('block/obsidian'),
    'stone_sword': lambda: item('stone_sword'),
    'iron_sword': lambda: item('iron_sword'),
    'diamond_sword': lambda: item('diamond_sword'),
    'stick_(knockback_i)': lambda: item('stick'),
    'chainmail_boots': lambda: item('chainmail_boots'),
    'iron_boots': lambda: item('iron_boots'),
    'diamond_boots': lambda: item('diamond_boots'),
    'shears': lambda: item('shears'),
    'wooden_pickaxe': lambda: item('wooden_pickaxe'),
    'wooden_axe': lambda: item('wooden_axe'),
    'arrow': lambda: item('arrow'),
    'bow': lambda: item('bow'),
    'bow_(power_i)': lambda: item('bow'),
    'bow_(power_i__punch_i)': lambda: item('bow'),
    'speed_ii_potion_(45_seconds)': lambda: potion((124, 175, 198)),
    'jump_v_potion_(45_seconds)': lambda: potion((34, 255, 76)),
    'invisibility_potion_(30_seconds)': lambda: potion((127, 131, 146)),
    'golden_apple': lambda: item('golden_apple'),
    'bedbug': lambda: item('snowball'),
    'dream_defender': lambda: tint(item('egg'), (200, 190, 175)),
    'fireball': lambda: item('fire_charge'),
    'tnt': lambda: block('block/tnt_side'),
    'ender_pearl': lambda: item('ender_pearl'),
    'water_bucket': lambda: item('water_bucket'),
    'bridge_egg': lambda: item('egg'),
    'magic_milk': lambda: item('milk_bucket'),
    'sponge': lambda: block('block/sponge'),
    'compact_pop-up_tower': chest,
    'popup_tower': chest,
}

sheet = Image.new('RGBA', (16 * len(ICONS), 16))
index = {}
for i, (shop_id, make) in enumerate(ICONS.items()):
    sheet.paste(make(), (i * 16, 0))
    index[shop_id] = i
sheet.save(os.path.join(site, 'src', 'assets', 'items.png'), optimize=True)
json.dump({'size': 16, 'count': len(ICONS), 'index': index}, open(os.path.join(site, 'src', 'data', 'item-icons.json'), 'w'), indent=0)
print(len(ICONS), 'icons')
