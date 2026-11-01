"""A rough blockout of the private toilet room you find behind a stall door, rendered to agree on the feel.

Run from the repo root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/concept_stall.py -- out_dir

A small, warm room (2.3 m wide, 2.6 m deep): cream brick-tile walls, a soft pink floor, a window with sky,
the toilet, a little side table with something to read, a sink on a stand with a mirror, a hanging plant,
a framed picture, a diffuser and a pendant lamp. The visitor sits on the toilet, shorts down.
"""
import math
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(ROOT, 'concept')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection


def hexcol(h, a=1.0):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb], a)


_mats = {}


def mat(color, emit=0.0, rough=0.8):
    key = (color, emit, rough)
    if key not in _mats:
        m = bpy.data.materials.new(color)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = hexcol(color)
        b.inputs['Roughness'].default_value = rough
        if emit:
            b.inputs['Emission Color'].default_value = hexcol(color)
            b.inputs['Emission Strength'].default_value = emit
        _mats[key] = m
    return _mats[key]


def box(loc, size, color, bevel=0.02, rot=0.0, **kw):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=(0, 0, rot))
    o = bpy.context.active_object
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat(color, **kw))
    if bevel:
        b = o.modifiers.new('soft', 'BEVEL')
        b.width, b.segments = bevel, 3
    return o


def cyl(loc, r, depth, color, rot=(0, 0, 0), r2=None, verts=32, **kw):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(location=loc, radius=r, depth=depth, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(location=loc, radius1=r, radius2=r2, depth=depth, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.data.materials.append(mat(color, **kw))
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def ball(loc, r, color, scale=(1, 1, 1), **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(location=loc, radius=r, segments=24, ring_count=14)
    o = bpy.context.active_object
    o.scale = scale
    o.data.materials.append(mat(color, **kw))
    for p in o.data.polygons:
        p.use_smooth = True
    return o


W, D, H = 2.3, 2.6, 2.6          # room width (x), depth (y, back wall at +y), height
WALL, GROUT = '#f3dcc4', '#e4c6a8'

# ---------- floor, walls with brick tiles, ceiling ----------
box((0, D / 2, -0.02), (W, D, 0.04), '#f6dbe2', bevel=0)                   # soft pink floor
for i in range(12):                                                         # floor tile lines
    box((-W / 2 + i * W / 11, D / 2, 0.002), (0.012, D, 0.004), '#ead0d8', bevel=0)
    box((0, i * D / 11, 0.002), (W, 0.012, 0.004), '#ead0d8', bevel=0)
box((0, D, H / 2), (W, 0.06, H), GROUT, bevel=0)                            # back wall
box((-W / 2, D / 2, H / 2), (0.06, D, H), GROUT, bevel=0)                  # left wall
box((W / 2, D / 2, H / 2), (0.06, D, H), GROUT, bevel=0)                   # right wall
TW, TH = 0.3, 0.15                                                          # brick tiles in rows
for row in range(int(H / TH)):
    z = row * TH + TH / 2
    shift = (row % 2) * TW / 2
    for col in range(-1, int(W / TW) + 2):                                  # back wall
        x = -W / 2 + col * TW + shift + TW / 2
        if -W / 2 + 0.02 < x < W / 2 - 0.02:
            box((x, D - 0.035, z), (TW - 0.014, 0.012, TH - 0.014), WALL, bevel=0.004)
    for col in range(-1, int(D / TW) + 2):                                  # side walls
        y = col * TW + shift + TW / 2
        if 0.02 < y < D - 0.02:
            box((-W / 2 + 0.035, y, z), (0.012, TW - 0.014, TH - 0.014), WALL, bevel=0.004)
            box((W / 2 - 0.035, y, z), (0.012, TW - 0.014, TH - 0.014), WALL, bevel=0.004)

# ---------- window on the left wall, with sky ----------
box((-W / 2 + 0.05, 1.0, 1.6), (0.03, 0.9, 0.75), '#bfe0f7', bevel=0, emit=0.9)
box((-W / 2 + 0.06, 1.0, 1.6), (0.04, 0.96, 0.05), '#fbf6ea', bevel=0.005)
box((-W / 2 + 0.06, 1.0, 1.98), (0.05, 1.0, 0.05), '#fbf6ea', bevel=0.005)
box((-W / 2 + 0.06, 1.0, 1.22), (0.08, 1.04, 0.05), '#fbf6ea', bevel=0.005)
for y in (0.53, 1.47):
    box((-W / 2 + 0.06, y, 1.6), (0.05, 0.05, 0.8), '#fbf6ea', bevel=0.005)

# ---------- toilet against the back wall ----------
TX, TY = -0.35, D - 0.45
box((TX, TY + 0.2, 0.62), (0.44, 0.2, 0.42), '#fbfaf6', bevel=0.05)        # tank
cyl((TX, TY - 0.08, 0.2), 0.2, 0.4, '#fbfaf6', r2=0.16)                    # bowl base
cyl((TX, TY - 0.12, 0.42), 0.23, 0.05, '#fbfaf6')                          # seat
cyl((TX + 0.16, TY + 0.2, 0.84), 0.02, 0.06, '#c9c4bb')                    # flush button

# ---------- side table with something to read, a paper roll and a plunger ----------
box((TX + 0.62, TY + 0.05, 0.3), (0.42, 0.38, 0.6), '#3f3833', bevel=0.02)
box((TX + 0.62, TY + 0.05, 0.62), (0.34, 0.26, 0.03), '#f6efe0', bevel=0.005, rot=0.2)   # an open magazine
box((TX + 0.62, TY - 0.15, 0.4), (0.3, 0.02, 0.05), '#cfc6ba', bevel=0.005)              # drawer pull
cyl((TX + 0.62, TY - 0.1, 0.14), 0.06, 0.12, '#ffffff', rot=(math.pi / 2, 0, 0))         # spare roll
cyl((TX + 0.98, TY - 0.05, 0.03), 0.09, 0.06, '#2e2a28', r2=0.06)                       # plunger cup
cyl((TX + 0.98, TY - 0.05, 0.32), 0.012, 0.55, '#f2efe8')

# ---------- sink on a stand with towels, a mirror, a diffuser ----------
SX, SY = 0.85, 1.25
box((SX, SY, 0.4), (0.04, 0.42, 0.8), '#9aa3a0', bevel=0.01)               # stand legs (simplified)
box((SX - 0.02, SY, 0.79), (0.42, 0.46, 0.04), '#f6efe0', bevel=0.01)       # stand top
box((SX - 0.02, SY, 0.35), (0.38, 0.4, 0.03), '#9aa3a0', bevel=0.005)       # lower shelf
box((SX - 0.02, SY, 0.42), (0.3, 0.3, 0.1), '#f8e7c9', bevel=0.03)         # folded towels
cyl((SX - 0.02, SY, 0.88), 0.17, 0.14, '#fbfaf6', r2=0.12)                 # basin
cyl((W / 2 - 0.08, SY, 1.05), 0.015, 0.22, '#e9e6df', rot=(0, math.pi / 2, 0))   # tap
box((W / 2 - 0.05, SY, 1.55), (0.03, 0.5, 0.62), '#8fa79d', bevel=0.01)    # mirror frame
box((W / 2 - 0.07, SY, 1.55), (0.01, 0.42, 0.54), '#dfeef0', bevel=0, rough=0.1)
box((W / 2 - 0.2, 0.55, 0.45), (0.3, 0.55, 0.9), '#3f3833', bevel=0.02)    # small chest of drawers
cyl((W / 2 - 0.2, 0.55, 0.98), 0.06, 0.16, '#b98f63')                     # diffuser bottle
for k in range(4):
    a = k * 0.4 - 0.6
    cyl((W / 2 - 0.2 + math.sin(a) * 0.04, 0.55, 1.16), 0.006, 0.3, '#d4a96b', rot=(a * 0.3, 0.15 * (k - 1.5), 0))

# ---------- hanging plant, framed picture, pendant lamp ----------
cyl((-0.35, 1.2, 2.4), 0.005, 0.4, '#3b3a36')                              # chain
cyl((-0.35, 1.2, 2.05), 0.16, 0.3, '#3b3a36', r2=0.0, verts=4, rot=(math.pi, 0, 0.4))   # geometric planter
for k in range(7):
    a = k / 7 * math.tau
    ball((-0.35 + math.cos(a) * 0.08, 1.2 + math.sin(a) * 0.08, 2.0 - (k % 3) * 0.08), 0.06, '#6fb36a', scale=(1, 1, 1.6))
box((0.35, D - 0.05, 1.7), (0.5, 0.03, 0.62), '#2e2a28', bevel=0.005)      # picture frame
box((0.35, D - 0.07, 1.7), (0.42, 0.01, 0.54), '#efe8dc', bevel=0)        # the picture
for k in range(3):
    ball((0.24 + k * 0.1, D - 0.08, 1.62 + (k % 2) * 0.05), 0.04, '#7f8a83', scale=(1, 0.2, 1.4))
cyl((0.2, 1.4, 2.5), 0.006, 0.2, '#2e2a28')                                # lamp cord
cyl((0.2, 1.4, 2.32), 0.22, 0.16, '#2e2a28', r2=0.04)                      # lampshade
ball((0.2, 1.4, 2.22), 0.07, '#fff3d6', emit=8.0)                           # bulb
lamp = bpy.data.lights.new('lamp', 'POINT')
lamp.energy, lamp.color, lamp.shadow_soft_size = 70, (1.0, 0.84, 0.64), 0.15
lo = bpy.data.objects.new('lamp', lamp)
lo.location = (0.2, 1.4, 2.1)
coll.objects.link(lo)
sky = bpy.data.lights.new('window', 'AREA')
sky.energy, sky.size, sky.color = 35, 0.9, (0.85, 0.92, 1.0)
so = bpy.data.objects.new('window', sky)
so.location = (-W / 2 + 0.3, 1.0, 1.6)
so.rotation_euler = (0, math.radians(-90), 0)
coll.objects.link(so)

# ---------- the visitor, sitting on the toilet with the shorts down ----------
PAINT = {'head': '#ffd8bf', 'ear': '#ffd8bf', 'hand': '#ffd8bf', 'leg': '#ffd8bf', 'torso': '#ffe28a', 'arm': '#ffe28a',
         'shoe': '#fbf8f2', 'cuff': '#8db6ea', 'briefs': '#ffc9d6', 'hair': '#6b4630'}
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', 'person.glb'))
new = [o for o in bpy.data.objects if o not in before]
for o in new:
    base = o.name.split('.')[0]
    if o.type == 'MESH':
        if base == 'shorts':
            o.hide_render = True  # pulled down
            continue
        o.data.materials.clear()
        o.data.materials.append(mat(next((c for k, c in PAINT.items() if base.startswith(k)), '#cccccc')))
        if base == 'head':
            for side in (-1, 1):
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.026)
                eye = bpy.context.active_object
                eye.data.materials.append(mat('#6b4a3a'))
                eye.parent = o
                eye.location = (side * 0.1, -0.265, 0.17)
    if base in ('leg_L', 'leg_R'):
        o.rotation_mode = 'XYZ'
        o.rotation_euler.x -= math.radians(80)  # legs forward: sitting
holder = bpy.data.objects.new('visitor', None)
coll.objects.link(holder)
for o in new:
    if o.parent is None:
        o.parent = holder
holder.location = (TX, TY - 0.12, 0.44 - 0.21)
holder.rotation_euler.z = 0.0

# ---------- render ----------
world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = hexcol('#f4e7d6')
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 1400, 900
scene.view_settings.view_transform = 'AgX'
cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 20
cam = bpy.data.objects.new('cam', cam_data)
cam.location = (0.45, -0.25, 1.6)
coll.objects.link(cam)
aim = bpy.data.objects.new('aim', None)
aim.location = (-0.15, D - 0.7, 0.85)
coll.objects.link(aim)
cam.constraints.new('TRACK_TO').target = aim
scene.camera = cam
scene.render.filepath = os.path.join(OUT, 'stall_room.png')
bpy.ops.render.render(write_still=True)
print('rendered', scene.render.filepath)
