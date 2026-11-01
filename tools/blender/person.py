"""Builds the chibi person and exports it to public/models/person.glb.

Run from the repo root (Blender does not need to be open):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/person.py -- [preview.png]

Everyone who comes as a person looks the same: this one character. It is a set of rounded parts, each with
its pivot at its joint, so the page can swing legs and arms and turn the head in code (no animation clips).
Colours are not set here: the page paints each part by name (skin, hair, shirt, pants, shoes), and draws the face.

Parts (Blender is z-up and the person faces -y; the exporter turns this into three.js's y-up, facing +z):
  hips (shorts, one block) > torso (tee) > head (skin) > hair, ear_L / ear_R
                              > arm_L / arm_R (sleeves) > hand_L / hand_R
                > leg_L / leg_R (bare legs) > shoe_L / shoe_R, cuff_L / cuff_R (shorts round the ankles, hidden by default)
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

# ---------- proportions (metres): a big round head on a small bean of a body, about 1.04 m tall ----------
HIP_Z = 0.21          # hip joints
WAIST_Z = 0.26
NECK_Z = 0.50
HEAD_C = Vector((0, 0, NECK_Z + 0.26))   # middle of the head
HEAD_R = 0.29
HEAD_SCALE = Vector((1.06, 1.0, 0.92))   # wider than tall, like a mochi
SHOULDER = Vector((0.098, 0, 0.47))   # at the round top corners of the tee
LEG_X = 0.068


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


def capsule_bm(top, bottom, r_top, r_bottom, segs=16, rings=12):
    """A rounded rod from `top` to `bottom`, thinning from r_top to r_bottom (an arm, a forearm)."""
    top, bottom = Vector(top), Vector(bottom)
    axis = top - bottom
    length = axis.length
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        t = (v.co.z + 1) / 2                      # 0 at the bottom cap, 1 at the top
        r = r_bottom + (r_top - r_bottom) * t
        z = v.co.z * r + (length / 2 if v.co.z > 0 else -length / 2)
        v.co = Vector((v.co.x * r, v.co.y * r, z))
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized())
    for v in bm.verts:
        v.co = rot @ v.co + (top + bottom) / 2
    return bm


def squircle_bm(top_z, bottom_z, center_xy, rx, ry, n=4.0, segs=28, rx_bottom=None, ry_bottom=None):
    """An upright tube with a rounded-square section and flat ends (shorts that meet flat, without a V between
    them); give it a wider bottom and it flares out like a tee."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=1.0, radius2=1.0, depth=1.0)
    for v in bm.verts:
        x, y = v.co.x, v.co.y
        r = math.hypot(x, y)
        if r > 1e-6:
            c, s = x / r, y / r
            x = math.copysign(abs(c) ** (2 / n), c) * r
            y = math.copysign(abs(s) ** (2 / n), s) * r
        t = v.co.z + 0.5  # 1 at the top
        z = bottom_z + t * (top_z - bottom_z)
        wx = rx if rx_bottom is None else rx_bottom + (rx - rx_bottom) * t
        wy = ry if ry_bottom is None else ry_bottom + (ry - ry_bottom) * t
        v.co = Vector((center_xy[0] + x * wx, center_xy[1] + y * wy, z))
    return bm


def rounded_box_bm(center, radii, side=3.0, ends=4.0, segs=32, rings=20):
    """A box with soft, evenly rounded edges all round (a superellipsoid): no flat caps, no sharp rims."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        rho = math.hypot(x, y)
        zz = math.copysign(abs(z) ** (2 / ends), z)
        ring = rho ** (2 / ends)
        if rho > 1e-6:
            c, s = x / rho, y / rho
            x = math.copysign(abs(c) ** (2 / side), c) * ring
            y = math.copysign(abs(s) ** (2 / side), s) * ring
        v.co = Vector((x * radii[0], y * radii[1], zz * radii[2])) + Vector(center)
    return bm


def bean_bm(center, radii, flare=0.12):
    """An ellipsoid a little wider at the bottom, like a bean."""
    bm = ellipsoid_bm((0, 0, 0), radii, 24, 14)
    for v in bm.verts:
        k = 1 + flare * (-v.co.z / radii[2])
        v.co.x *= k
        v.co.y *= k
        v.co += Vector(center)
    return bm


# ---------- body ----------
# the shorts: one soft block fixed to the hips (the thin legs swing inside it); its top hides under the tee
hips = new_object('hips', rounded_box_bm((0, 0, HIP_Z + 0.01), (0.13, 0.068, 0.07)), Vector((0, 0, HIP_Z)))
# an A-line tee: narrow at the round shoulders, flaring a little to a hem that hangs over the top of the shorts
tee = squircle_bm(NECK_Z - 0.01, HIP_Z + 0.035, (0, 0), 0.098, 0.084, n=3.0, rx_bottom=0.136, ry_bottom=0.106)
made = bmesh.ops.create_uvsphere(tee, u_segments=24, v_segments=12, radius=1.0)
for v in made['verts']:
    v.co = Vector((v.co.x * 0.1, v.co.y * 0.086, v.co.z * 0.04)) + Vector((0, 0, NECK_Z - 0.01))
torso = new_object('torso', tee, Vector((0, 0, WAIST_Z)), hips)
head = new_object('head', ellipsoid_bm(HEAD_C, (HEAD_R * HEAD_SCALE.x, HEAD_R * HEAD_SCALE.y, HEAD_R * HEAD_SCALE.z), 40, 24), Vector((0, 0, NECK_Z)), torso)

for side, tag in ((1, 'L'), (-1, 'R')):  # the person's left is +x when they face -y
    ellipsoid(f'ear_{tag}', (0, 0, NECK_Z), HEAD_C + Vector((side * 0.3, 0.01, -0.03)), (0.04, 0.034, 0.055), head)
    sh = Vector((side * SHOULDER.x, 0, SHOULDER.z))
    # a short sleeve flaring a little at the end, a thin arm, and a round ball of a hand
    elbow = sh + Vector((side * 0.03, 0, -0.065))
    wrist = sh + Vector((side * 0.06, 0, -0.175))
    arm = new_object(f'arm_{tag}', capsule_bm(sh, elbow, 0.044, 0.054), sh, torso)
    hand = capsule_bm(elbow, wrist, 0.025, 0.024)
    made = bmesh.ops.create_uvsphere(hand, u_segments=16, v_segments=12, radius=0.05)
    for v in made['verts']:
        v.co += wrist + Vector((side * 0.008, 0, -0.022))
    new_object(f'hand_{tag}', hand, sh, arm)
    hip = Vector((side * LEG_X, 0, HIP_Z))
    leg = new_object(f'leg_{tag}', capsule_bm(hip + Vector((0, 0, -0.01)), hip + Vector((0, 0, -0.15)), 0.042, 0.04), hip, hips)   # thin bare legs
    ellipsoid(f'shoe_{tag}', hip, hip + Vector((0, -0.02, -0.17)), (0.058, 0.08, 0.04), leg)   # chunky little shoes
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=20, radius1=0.072, radius2=0.066, depth=0.05)
    for v in bm.verts:
        v.co += hip + Vector((0, 0, -0.14))
    new_object(f'cuff_{tag}', bm, hip, leg)   # the shorts round the ankles, shown when they are pulled down

# ---------- hair: close to the head, a spiky fringe, pointed sideburns in front of the ears ----------
# The hair is the head's own ball, a little bigger, cut along a hairline that rises and falls round the head.
# Points below the line are pulled onto the line, so the edge follows it exactly (spikes and all), and the
# hair thins down to the skin at the edge instead of ending in a step.

def zigzag(u):
    """0 at the spike tips, 1 between them."""
    return abs((u % 1) - 0.5) * 2


def lerp_points(pts, s):
    for (s0, h0), (s1, h1) in zip(pts, pts[1:]):
        if s <= s1:
            return h0 + (h1 - h0) * (s - s0) / (s1 - s0)
    return pts[-1][1]


SIDE = [(0.95, 0.045), (1.22, -0.13), (1.44, 0.05), (1.85, 0.06), (2.2, -0.15), (math.pi, -0.17)]


def hairline(a):
    """Height of the hair's edge above the middle of the head, at angle `a` round it (0 = middle of the face)."""
    s = abs(a)
    if s < 0.95:
        return 0.085 - 0.085 * (1 - zigzag((a + 0.95) / 0.38))  # five spikes across the forehead
    h = lerp_points(SIDE, s)
    if s > 2.2:
        h -= 0.035 * (1 - zigzag((s - 2.2) / 0.32))  # a few points at the nape
    return h


def hair_bm():
    rx, ry, rz = HEAD_R * HEAD_SCALE.x, HEAD_R * HEAD_SCALE.y, HEAD_R * HEAD_SCALE.z
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
    under = set()
    for v in bm.verts:
        d = v.co.copy()
        a = math.atan2(d.x, -d.y)
        line = hairline(a)
        height = d.z * rz
        if height < line:
            # pull it up onto the hairline, at the same angle round the head
            under.add(v)
            zz = max(-0.999, min(0.999, line / rz))
            flat = Vector((d.x, d.y, 0))
            flat = flat.normalized() if flat.length > 1e-6 else Vector((0, -1, 0))
            ring = math.sqrt(1 - zz * zz)
            d = Vector((flat.x * ring, flat.y * ring, zz))
            thick = 0.006
        else:
            t = min(1.0, (height - line) / 0.07)
            thick = 0.006 + 0.022 * (t * t * (3 - 2 * t))  # thin at the edge, full a little above it
            thick += 0.01 * max(0.0, d.z) ** 2  # a touch more on the crown
        v.co = Vector((d.x * (rx + thick), d.y * (ry + thick), d.z * (rz + thick))) + HEAD_C
    gone = [f for f in bm.faces if all(v in under for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    return bm


new_object('hair', hair_bm(), Vector((0, 0, NECK_Z)), head)

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

    skin, hair, shirt, pants, shoe = mat('skin', (1, 0.9, 0.84)), mat('hair', (0.12, 0.07, 0.05)), mat('shirt', (1, 0.66, 0.08)), mat('pants', (0.07, 0.16, 0.38)), mat('shoe', (0.1, 0.08, 0.1))
    paint = {'head': skin, 'ear': skin, 'hand': skin, 'leg': skin, 'hair': hair, 'torso': shirt, 'arm': shirt, 'hips': pants, 'cuff': pants, 'shoe': shoe}
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
