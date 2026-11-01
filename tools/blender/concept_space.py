"""A rough blockout of the v2 grounds, rendered to two pictures to agree on the feel before building it in three.js.

Run from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/concept_space.py -- out_dir

Layout (metres, Blender is z-up, south is -y): the plaza in the middle, the small 10-stall restroom behind it (north),
the campfire rest area east, the bushes west, the entrance south, and a walking path looping round everything.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(ROOT, 'concept')
os.makedirs(OUT, exist_ok=True)
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection


def hexcol(h, a=1.0):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


_mats = {}


def mat(color, emit=0.0, rough=0.85):
    key = (color, emit)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(color)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexcol(color)
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = hexcol(color)
        b.inputs['Emission Strength'].default_value = emit
    _mats[key] = m
    return m


def put(obj, color, **kw):
    obj.data.materials.append(mat(color, **kw))
    for p in getattr(obj.data, 'polygons', []):
        p.use_smooth = True
    return obj


def box(loc, size, color, rot=0.0, **kw):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=(0, 0, rot))
    o = bpy.context.active_object
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    o.data.polygons.foreach_set('use_smooth', [False] * len(o.data.polygons))
    o.data.materials.append(mat(color, **kw))
    bev = o.modifiers.new('soft', 'BEVEL')
    bev.width, bev.segments = min(size) * 0.12, 3
    return o


def ball(loc, r, color, scale=(1, 1, 1), **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(location=loc, radius=r, segments=24, ring_count=14)
    o = bpy.context.active_object
    o.scale = scale
    return put(o, color, **kw)


def cyl(loc, r, depth, color, rot=(0, 0, 0), verts=24, r2=None, **kw):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(location=loc, radius=r, depth=depth, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(location=loc, radius1=r, radius2=r2, depth=depth, rotation=rot, vertices=verts)
    return put(bpy.context.active_object, color, **kw)


# ---------- ground ----------
cyl((0, 0, -0.05), 40, 0.1, '#a9cf72', verts=96)                       # grass
cyl((0, 0, 0.005), 6.2, 0.02, '#eadfc4', verts=64)                     # plaza paving
for r in (5.4, 3.6):                                                     # paving rings
    bpy.ops.mesh.primitive_torus_add(location=(0, 0, 0.02), major_radius=r, minor_radius=0.04, major_segments=64)
    put(bpy.context.active_object, '#d7c9a6')
bpy.ops.mesh.primitive_torus_add(location=(0, 0, 0.0), major_radius=15, minor_radius=0.85, major_segments=96)
path = bpy.context.active_object
path.scale.z = 0.03
put(path, '#d9c294')                                                     # the walking loop
for a, b in (((0, -6.2), (0, -14.2)), ((0, 6.2), (0, 7.4)), ((6.2, 0), (7.6, 0)), ((-6.2, 0), (-8.0, 0))):
    (x0, y0), (x1, y1) = a, b
    mid = ((x0 + x1) / 2, (y0 + y1) / 2, 0.006)
    length = math.hypot(x1 - x0, y1 - y0)
    o = box(mid, (1.5 if x0 == x1 else length, length if x0 == x1 else 1.5, 0.02), '#d9c294')
    o.modifiers.clear()

# ---------- the small 10-stall restroom, north of the plaza ----------
RX, RY = 0, 11.0
box((RX, RY, 1.6), (10.5, 5.6, 3.2), '#a9d2ec')                        # sky-blue tiled walls
box((RX, RY, 3.3), (11.2, 6.2, 0.25), '#fbf6ea')                        # white roof slab
box((RX, RY - 2.81, 1.15), (1.6, 0.05, 2.3), '#5b4636')                 # entrance
box((RX, RY - 2.84, 2.65), (2.0, 0.06, 0.55), '#fffaf0')                # sign board
for k in range(5):                                                       # little windows along the front
    for side in (-1, 1):
        box((RX + side * (1.6 + k * 0.7), RY - 2.81, 2.45), (0.45, 0.05, 0.45), '#e9f6ff', emit=0.2)
ball((RX - 0.35, RY - 2.9, 2.65), 0.16, '#3e7bd1')                      # man / woman pictograms on the sign
ball((RX + 0.35, RY - 2.9, 2.65), 0.16, '#e2577a')

# ---------- plaza: vending machine and the golden-poop sign ----------
box((3.6, 2.6, 0.95), (1.0, 0.8, 1.9), '#e85d5d', rot=-0.5)             # vending machine
box((3.6 - 0.24, 2.6 - 0.34, 1.1), (0.6, 0.06, 1.0), '#dff3ff', rot=-0.5, emit=0.4)
cyl((-3.4, 2.2, 0.6), 0.08, 1.2, '#7a5b3e')                              # sign post
try:
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', 'golden-poop.glb'))
    for o in bpy.context.selected_objects:
        if o.type == 'MESH':
            o.location = (-3.4, 2.2, 1.25)
            o.scale = (0.28, 0.28, 0.28)
            o.data.materials.clear()
            o.data.materials.append(mat('#f2c14e', rough=0.25))
except Exception as err:  # the sign still reads without the poop
    print('golden poop not loaded', err)
# ---------- café terrace on the plaza: round tables, chairs, parasols, string lights, a coffee cart ----------
def chair(x, y, face):
    dx, dy = math.sin(face), -math.cos(face)  # unit vector the sitter faces
    box((x, y, 0.42), (0.42, 0.42, 0.06), '#fbf6ea', rot=face)
    box((x - dx * 0.2, y - dy * 0.2, 0.68), (0.42, 0.05, 0.5), '#fbf6ea', rot=face)
    for ox, oy in ((-0.17, -0.17), (0.17, -0.17), (-0.17, 0.17), (0.17, 0.17)):
        c, s_ = math.cos(face), math.sin(face)
        cyl((x + ox * c - oy * s_, y + ox * s_ + oy * c, 0.2), 0.02, 0.4, '#3b3a36')


TABLES = [(-2.4, -2.6, '#9fd8c7'), (0.4, -3.6, '#ffc2a8'), (2.9, -1.9, '#ffe28a')]
for tx, ty, shade in TABLES:
    cyl((tx, ty, 0.72), 0.42, 0.04, '#fffaf0')                   # table top
    cyl((tx, ty, 0.36), 0.04, 0.72, '#3b3a36')                    # stem
    cyl((tx, ty, 0.02), 0.2, 0.04, '#3b3a36')                     # foot
    cyl((tx, ty, 1.35), 0.025, 1.3, '#f4efe4')                    # parasol pole
    cyl((tx, ty, 2.05), 1.15, 0.45, shade, r2=0.05, verts=12)     # parasol
    cyl((tx + 0.12, ty + 0.05, 0.79), 0.05, 0.1, '#ffffff')       # a cup
    for k, a in enumerate((0.4, 0.4 + math.pi)):
        chair(tx + math.sin(a) * 0.75, ty - math.cos(a) * 0.75, a + math.pi)
for i in range(2):                                                # string lights between two posts
    px = -4.2 if i == 0 else 4.4
    cyl((px, -4.6, 1.3), 0.04, 2.6, '#5b4636')
for k in range(17):
    t = k / 16
    x = -4.2 + 8.6 * t
    z = 2.55 - 0.55 * math.sin(math.pi * t)
    ball((x, -4.6, z), 0.06, '#fff1c2', emit=6.0)
box((-4.0, -1.0, 0.55), (1.3, 0.8, 1.1), '#7cc6b2')               # coffee cart
box((-4.0, -1.0, 1.65), (1.5, 1.0, 0.08), '#ffffff')              # its awning
for side in (-1, 1):
    cyl((-4.0 + side * 0.6, -1.4, 1.35), 0.025, 0.6, '#f4efe4')
cyl((-4.5, -1.35, 0.15), 0.15, 0.06, '#3b3a36', rot=(math.pi / 2, 0, 0))   # wheels
cyl((-3.5, -1.35, 0.15), 0.15, 0.06, '#3b3a36', rot=(math.pi / 2, 0, 0))

# ---------- campfire rest area, east ----------
FX, FY = 10.5, 0
cyl((FX, FY, 0.01), 3.4, 0.02, '#cdb88f', verts=48)                    # trodden earth
for k in range(10):                                                      # stone ring
    a = k / 10 * math.tau
    ball((FX + math.cos(a) * 0.62, FY + math.sin(a) * 0.62, 0.08), 0.13, '#9a958c', scale=(1, 1, 0.7))
for a in (0.3, 1.9, 3.5):                                                # crossed firewood
    cyl((FX, FY, 0.14), 0.07, 0.8, '#6b4528', rot=(math.pi / 2, 0, a))
cyl((FX, FY, 0.42), 0.32, 0.6, '#ff8a2a', r2=0.0, emit=6.0)              # flames
cyl((FX + 0.1, FY - 0.05, 0.5), 0.18, 0.55, '#ffd34e', r2=0.0, emit=8.0)
cyl((FX - 0.12, FY + 0.06, 0.38), 0.15, 0.4, '#ff5a24', r2=0.0, emit=6.0)
for k in range(6):                                                       # log seats round the fire
    a = k / 6 * math.tau + 0.25
    cx, cy = FX + math.cos(a) * 2.1, FY + math.sin(a) * 2.1
    cyl((cx, cy, 0.22), 0.22, 1.1, '#8a5a34', rot=(math.pi / 2, 0, a + math.pi / 2))
fire = bpy.data.lights.new('fire', 'POINT')
fire.energy, fire.color, fire.shadow_soft_size = 900, (1.0, 0.55, 0.25), 0.4
fo = bpy.data.objects.new('fire', fire)
fo.location = (FX, FY, 0.9)
coll.objects.link(fo)
tent = cyl((FX + 2.9, FY + 2.8, 0.7), 1.1, 1.4, '#f2a25c', r2=0.0, verts=4)  # a little tent for the camping feel
tent.rotation_euler.z = 0.6

# ---------- bushes, west ----------
for k in range(26):
    x = -10.5 + random.uniform(-3.2, 3.2)
    y = random.uniform(-4.5, 4.5)
    r = random.uniform(0.45, 0.95)
    ball((x, y, r * 0.55), r, random.choice(['#5fae57', '#4b9446', '#7cc26a']), scale=(1, 1, 0.8))
for k in range(40):                                                      # tall grass tufts
    x = -10.5 + random.uniform(-4, 4)
    y = random.uniform(-5, 5)
    cyl((x, y, 0.25), 0.07, 0.5, '#6dbb4f', r2=0.0, verts=6)

# ---------- trees round the outside, a gate at the entrance ----------
for k in range(30):
    a = k / 30 * math.tau + random.uniform(-0.05, 0.05)
    d = random.uniform(18.5, 23)
    x, y = math.cos(a) * d, math.sin(a) * d
    if y < -12 and abs(x) < 3:
        continue
    h = random.uniform(1.6, 2.6)
    cyl((x, y, h / 2), 0.16, h, '#7a5536')
    ball((x, y, h + 0.7), random.uniform(1.0, 1.5), random.choice(['#4f9a4a', '#5fae57', '#3f8a43']))
for side in (-1, 1):
    cyl((side * 1.2, -14.2, 1.3), 0.14, 2.6, '#8a5a34')
box((0, -14.2, 2.7), (3.0, 0.3, 0.5), '#8a5a34')
box((0, -14.35, 2.7), (2.2, 0.06, 0.36), '#ffe28a')
for k in range(14):                                                      # lamps along the path
    a = k / 14 * math.tau
    x, y = math.cos(a) * 16.3, math.sin(a) * 16.3
    cyl((x, y, 0.7), 0.05, 1.4, '#5b4636')
    ball((x, y, 1.45), 0.13, '#fff1c2', emit=3.0)

# ---------- people, for scale (the real model, painted like the page does) ----------
PAINT = {'head': '#ffd8bf', 'ear': '#ffd8bf', 'hand': '#ffd8bf', 'leg': '#ffd8bf', 'torso': '#ffe28a', 'arm': '#ffe28a',
         'shorts': '#8db6ea', 'shoe': '#fbf8f2', 'cuff': '#8db6ea', 'briefs': '#ffc9d6'}
HAIRS = ['#6b4630', '#2b2226', '#8a4b2a', '#d9814a', '#e8c26a']
SPOTS = [(-1.2, -0.8, 0.6), (1.6, -2.6, 2.6), (1.8, 0.8, 3.6), (-0.4, 1.6, 0.2), (3.6, -0.6, 2.4),
         (FX - 2.1, FY - 0.2, -1.57), (FX + 0.4, FY - 2.1, 0.0), (FX + 1.6, FY + 1.4, 2.3), (0.3, 7.6, 3.14), (-6.9, -1.5, -1.3),
         (6.0, -12.6, 0.4), (-11.6, -11.3, 2.6)]
for i, (x, y, face) in enumerate(SPOTS):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', 'person.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    tops = [o for o in new if o.parent is None]
    hair = HAIRS[i % len(HAIRS)]
    for o in new:
        if o.type != 'MESH':
            continue
        base = o.name.split('.')[0]
        if base.startswith(('cuff', 'briefs')):
            o.hide_render = True
            continue
        color = hair if base.startswith('hair') else next((c for k, c in PAINT.items() if base.startswith(k)), '#cccccc')
        o.data.materials.clear()
        o.data.materials.append(mat(color))
        if base == 'head':  # two dot eyes, since the page draws the face
            for side in (-1, 1):
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.026, location=(0, 0, 0))
                eye = bpy.context.active_object
                eye.data.materials.append(mat('#6b4a3a'))
                eye.parent = o
                eye.location = (side * 0.1, -0.265, 0.17)
    holder = bpy.data.objects.new(f'person{i}', None)
    coll.objects.link(holder)
    for t in tops:
        t.parent = holder
    holder.location = (x, y, 0)
    holder.rotation_euler.z = face

# ---------- light, sky, cameras ----------
world = bpy.data.worlds.new('sky')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = hexcol('#cfe6f7')
bg.inputs['Strength'].default_value = 1.1
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy, sun.angle, sun.color = 3.2, 0.25, (1.0, 0.95, 0.85)
so = bpy.data.objects.new('sun', sun)
so.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
coll.objects.link(so)

scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 1400, 900
scene.view_settings.view_transform = 'Standard'


def shoot(name, loc, target, lens):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam = bpy.data.objects.new(name, cam_data)
    cam.location = loc
    coll.objects.link(cam)
    aim = bpy.data.objects.new(name + '_aim', None)
    aim.location = target
    coll.objects.link(aim)
    cam.constraints.new('TRACK_TO').target = aim
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)


shoot('overview', (20, -27, 22), (0, 0, 0), 30)
shoot('terrace', (3.2, -10.5, 3.4), (0.0, -2.2, 0.8), 30)
# dusk at the campfire: dimmer sky and sun so the fire glows
bg.inputs['Color'].default_value = hexcol('#8fa3c9')
bg.inputs['Strength'].default_value = 0.55
sun.energy, sun.color = 1.0, (1.0, 0.75, 0.55)
shoot('campfire', (FX - 1.0, FY - 6.6, 2.4), (FX + 0.3, FY + 0.4, 0.5), 32)
