"""Builds the chibi person and exports it to public/models/person.glb.

Run from the repo root (Blender does not need to be open):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/person.py -- [preview.png]

Everyone who comes as a person looks the same: this one character. It is a set of rounded parts, each with
its pivot at its joint, so the page can swing legs and arms and turn the head in code (no animation clips).
Colours are not set here: the page paints each part by name (skin, hair, shirt, pants, shoes), and draws the face.

Parts (Blender is z-up and the person faces -y; the exporter turns this into three.js's y-up, facing +z):
  hips (shorts) > torso (shirt) > head (skin) > hair
                                > arm_L / arm_R (sleeves) > hand_L / hand_R
                > leg_L / leg_R (pants) > shoe_L / shoe_R, cuff_L / cuff_R (pants round the ankles, hidden by default)
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'person.glb')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = args[0] if args else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- proportions (metres): a big head on a small body, about 1.08 m tall ----------
HIP_Z = 0.30          # hip joints
WAIST_Z = 0.34
NECK_Z = 0.60
HEAD_C = Vector((0, 0, NECK_Z + 0.24))   # middle of the head
HEAD_R = 0.25
HEAD_SCALE = Vector((1.04, 1.0, 0.95))   # a little wider than tall
SHOULDER = Vector((0.15, 0, 0.56))
LEG_X = 0.075


def new_object(name, bm, pivot, parent=None):
    """Mesh object whose origin sits at `pivot` (world); bm vertices are given in world space."""
    me = bpy.data.meshes.new(name)
    for v in bm.verts:
        v.co -= pivot
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = pivot
    scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return ob


def ellipsoid_bm(center, radii, segs=20, rings=12):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    return bm


def ellipsoid(name, pivot, center, radii, parent=None, segs=20, rings=12):
    return new_object(name, ellipsoid_bm(center, radii, segs, rings), Vector(pivot), parent)


def shell(keep, radius, scale=HEAD_SCALE, fringe=False):
    """A sphere around the head, keeping only the faces `keep(local)` says yes to: a hair cut."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=26, radius=radius)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale.x, v.co.y * scale.y, v.co.z * scale.z))
    drop = [f for f in bm.faces if not keep(f.calc_center_median(), fringe)]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    # a little thickness so the edge reads as hair, not paper
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.016)
    for v in bm.verts:
        v.co += HEAD_C
    return bm


# Cuts follow the sphere's own rows and columns (height and angle round the head), so the edges come out clean.
FRINGE = 0.07  # where the fringe ends above the middle of the head


def around(p):
    """Angle round the head from the middle of the face (0) to the back (pi)."""
    return abs(math.atan2(p.x, -p.y))


def keep_short(p, _):
    a = around(p)
    if a < 0.95:
        return p.z > FRINGE  # the fringe across the forehead
    if a < 1.9:
        return p.z > -0.04  # over the ears
    return p.z > -0.14  # down to the nape


# ---------- body ----------
hips = ellipsoid('hips', (0, 0, HIP_Z), (0, 0, HIP_Z + 0.03), (0.15, 0.115, 0.085))
torso = ellipsoid('torso', (0, 0, WAIST_Z), (0, 0, WAIST_Z + 0.13), (0.15, 0.115, 0.155), hips)
head = new_object('head', ellipsoid_bm(HEAD_C, (HEAD_R * HEAD_SCALE.x, HEAD_R * HEAD_SCALE.y, HEAD_R * HEAD_SCALE.z), 32, 20), Vector((0, 0, NECK_Z)), torso)

for side, tag in ((1, 'L'), (-1, 'R')):  # the person's left is +x when they face -y
    sh = Vector((side * SHOULDER.x, 0, SHOULDER.z))
    arm = ellipsoid(f'arm_{tag}', sh, sh + Vector((side * 0.035, 0, -0.085)), (0.048, 0.052, 0.105), torso)
    ellipsoid(f'hand_{tag}', sh + Vector((side * 0.045, 0, -0.19)), sh + Vector((side * 0.045, 0, -0.19)), (0.05, 0.05, 0.05), arm)
    hip = Vector((side * LEG_X, 0, HIP_Z))
    leg = ellipsoid(f'leg_{tag}', hip, hip + Vector((0, 0, -0.12)), (0.07, 0.072, 0.14), hips)
    ellipsoid(f'shoe_{tag}', hip + Vector((0, 0, -0.255)), hip + Vector((0, -0.025, -0.255)), (0.072, 0.098, 0.05), leg)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=20, radius1=0.085, radius2=0.078, depth=0.07)
    for v in bm.verts:
        v.co += hip + Vector((0, 0, -0.2))
    new_object(f'cuff_{tag}', bm, hip + Vector((0, 0, -0.2)), leg)

# ---------- hair: a short cut with a straight fringe ----------
new_object('hair', shell(keep_short, 0.262), Vector((0, 0, NECK_Z)), head)

# ---------- export ----------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
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
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.objects if o.type == 'MESH')
print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB,', tris, 'triangles,', [o.name for o in scene.objects])

# ---------- optional preview ----------
if PREVIEW:
    def mat(name, rgb):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1)
        b.inputs['Roughness'].default_value = 0.75
        return m

    skin, hair, shirt, pants, shoe = mat('skin', (1, 0.72, 0.55)), mat('hair', (0.12, 0.07, 0.05)), mat('shirt', (1, 0.66, 0.08)), mat('pants', (0.07, 0.16, 0.38)), mat('shoe', (0.1, 0.08, 0.1))
    paint = {'head': skin, 'hand': skin, 'hair': hair, 'torso': shirt, 'arm': shirt, 'hips': pants, 'leg': pants, 'cuff': pants, 'shoe': shoe}
    for o in scene.objects:
        if o.type == 'MESH':
            o.data.materials.append(next(v for k, v in paint.items() if o.name.startswith(k)))
    for o in scene.objects:
        if o.name.startswith('cuff'):
            o.hide_render = True

    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.85, 0.95, 1)
    for name, loc, energy in (('key', (2, -3, 4), 250), ('fill', (-3, -2, 2), 90)):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = 3
        lo = bpy.data.objects.new(name, light)
        lo.location = loc
        scene.collection.objects.link(lo)
        lo.rotation_euler = (-lo.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (1.3, -2.6, 1.1)
    scene.collection.objects.link(cam)
    target = bpy.data.objects.new('target', None)
    target.location = (0, 0, 0.55)
    scene.collection.objects.link(target)
    cam.constraints.new('TRACK_TO').target = target
    scene.camera = cam
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 520
    scene.render.resolution_y = 640
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('preview', PREVIEW)
