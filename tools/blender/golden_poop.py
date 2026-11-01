"""Builds the wish page's golden poop and exports it to public/models/golden-poop.glb.

Run from the repo root (Blender does not need to be open):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/golden_poop.py -- [preview.png]

The shape is a soft-serve swirl: a tube that coils upward and thins out, with a little curl on top,
fused with a filler blob inside and smoothed into one piece. Materials are set on the page, not here.
"""
import math
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'golden-poop.glb')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = args[0] if args else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def lerp(a, b, t):
    return a + (b - a) * t


# ---------- the swirl: one coiled tube that rises and thins ----------
TURNS = 2.45
STEPS = 260
points = []
for i in range(STEPS + 1):
    t = i / STEPS
    a = t * TURNS * 2 * math.pi
    tuck = 1 - (1 - min(t / 0.12, 1)) ** 2  # the start eases in from inside, so no stub sticks out
    ring = 0.98 * (1 - 0.84 * t) * lerp(0.45, 1, tuck)  # how far the coil sits from the middle
    z = 0.36 + 1.5 * t ** 0.95            # rises a bit faster at first
    r = 0.43 * (1 - 0.58 * t) * lerp(0.4, 1, tuck)  # tube gets thinner going up
    points.append((math.cos(a) * ring, math.sin(a) * ring, z, r))

# the curl on top: from the end of the coil, up and over to a soft point
ex, ey, ez, er = points[-1]
for k in range(1, 15):
    t = k / 14
    x = lerp(ex, 0.0, t) + 0.16 * math.sin(t * math.pi) * 0.6 + 0.12 * t ** 2  # leans over a little at the end
    y = lerp(ey, -0.04, t)
    z = ez + 0.46 * math.sin(t * math.pi / 2)
    r = lerp(er, 0.035, t ** 1.4)
    points.append((x, y, z, r))

curve = bpy.data.curves.new('swirl', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = 1.0
curve.bevel_resolution = 10
curve.use_fill_caps = True
spline = curve.splines.new('POLY')
spline.points.add(len(points) - 1)
for p, (x, y, z, r) in zip(spline.points, points):
    p.co = (x, y, z, 1)
    p.radius = r
swirl = bpy.data.objects.new('swirl', curve)
scene.collection.objects.link(swirl)

# ---------- fillers inside, so no gaps show between the coils ----------
def blob(name, loc, scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return o

core_low = blob('core_low', (0, 0, 0.52), (0.86, 0.86, 0.5))
core_mid = blob('core_mid', (0, 0, 1.12), (0.5, 0.5, 0.52))

# ---------- fuse everything into one smooth mesh ----------
bpy.ops.object.select_all(action='DESELECT')
swirl.select_set(True)
bpy.context.view_layer.objects.active = swirl
bpy.ops.object.convert(target='MESH')
for o in (core_low, core_mid):
    o.select_set(True)
bpy.context.view_layer.objects.active = swirl
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.ops.object.join()
poop = bpy.context.active_object
poop.name = 'golden_poop'

remesh = poop.modifiers.new('fuse', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = 0.022
smooth = poop.modifiers.new('soften', 'CORRECTIVE_SMOOTH')
smooth.factor = 0.6
smooth.iterations = 12
smooth.smooth_type = 'LENGTH_WEIGHTED'
smooth.use_only_smooth = True
decimate = poop.modifiers.new('lighten', 'DECIMATE')
decimate.ratio = 0.12
bpy.ops.object.modifier_apply(modifier='fuse')
bpy.ops.object.modifier_apply(modifier='soften')
bpy.ops.object.modifier_apply(modifier='lighten')
poop.data.validate()  # decimating can leave a few broken faces; drop them before export
poop.data.name = 'golden_poop'
bpy.ops.object.shade_smooth()

# sit the bottom on z = 0
lowest = min((poop.matrix_world @ v.co).z for v in poop.data.vertices)
poop.location.z -= lowest
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

dims = tuple(round(d, 3) for d in poop.dimensions)
tris = sum(len(p.vertices) - 2 for p in poop.data.polygons)
print(f'golden poop: {dims} m, {tris} triangles')

# ---------- export (glTF is y-up; the exporter turns Blender's z-up for us) ----------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
poop.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_normals=True,
    export_materials='NONE',
    export_texcoords=False,
)
print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')

# ---------- optional preview render, to check the shape ----------
if PREVIEW:
    mat = bpy.data.materials.new('gold')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (1.0, 0.72, 0.25, 1)
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.3
    poop.data.materials.append(mat)

    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.035, 0.02, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

    for name, loc, energy in (('key', (3, -3, 5), 900), ('fill', (-4, -2, 2), 300), ('rim', (0, 4, 4), 500)):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = 3
        lo = bpy.data.objects.new(name, light)
        lo.location = loc
        lo.rotation_euler = (0, 0, 0)
        scene.collection.objects.link(lo)
        direction = -lo.location
        lo.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 60
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (0, -7.2, 2.6)
    scene.collection.objects.link(cam)
    target = bpy.data.objects.new('target', None)
    target.location = (0, 0, 1.15)
    scene.collection.objects.link(target)
    track = cam.constraints.new('TRACK_TO')
    track.target = target
    scene.camera = cam

    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('preview', PREVIEW, scene.render.engine)
