"""Builds the five animals that wander about the place and exports them to public/models/animal-<kind>.glb.

Run from the repo root (Blender does not need to be open):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/animals.py -- [preview.png]

Each animal is the person's chibi (tools/blender/person.py) in fur: the same rounded rigid parts, the same names
and the same pivots, standing on two hind legs with the hips at the same height (HIP_Z), so the page's pose()
(walk, sit, squat, the 체조 moves...) works on them unchanged. No skinning: every part is its own mesh.

Parts (Blender is z-up and the animal faces -y; the exporter turns this into three.js's y-up, facing +z):
  hips (joint) > torso > head > ear_L / ear_R and the face bits (muzzle, nose, trunk, ...)
                       > arm_L / arm_R > hand_L / hand_R
               > leg_L / leg_R > foot_L / foot_R
               > tail (where the species has one)
The giraffe has a 'neck' between torso and head (torso > neck > head).
'head' is always a plain ellipsoid and nothing else, so the page's face decal (sized from the head's bounding box)
fits it exactly; the dot eyes land on the front of it, and every snout sits below them.

Colours: each mesh has exactly one material, named by what it is (fur, cream, ear_inner, nose, spots, ...),
with the intended colour as its base colour. The page can keep them or repaint by name.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'public', 'models')
PERSON = os.path.join(OUT_DIR, 'person.glb')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = args[0] if args else None
KINDS = ['elephant', 'dog', 'cat', 'giraffe', 'wombat']
# the small ones are smaller: the whole animal is scaled at the hips, which are lowered to match so the feet stay on
# the ground (the hips joint then sits at HIP_Z * size)
SIZE = dict(dog=0.8, cat=0.75, wombat=0.8)

HIP_Z = 0.21     # hip joints, the same as the person
WAIST_Z = 0.26   # the torso's pivot, the same as the person

scene = None


# ---------- helpers (the same approach as person.py) ----------

def srgb(h):
    """'#rrggbb' to Blender's linear colour."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


MATS = {}


def mat(name, hexcol):
    m = MATS.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
        b.inputs['Roughness'].default_value = 0.8
        m.use_backface_culling = True  # single-sided, like the page's materials, so a flipped face would show here
        MATS[name] = m
    return m


def new_object(name, bm, pivot, parent=None, material=None):
    """Mesh object whose origin sits at `pivot` (world); bm vertices are given in world space."""
    pivot = Vector(pivot)
    me = bpy.data.meshes.new(name)
    for v in bm.verts:
        v.co -= pivot
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    if material:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = pivot
    scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return ob


def as_rot(rot):
    if rot is None:
        return Matrix.Identity(3)
    if isinstance(rot, (tuple, list)):
        return Euler([math.radians(a) for a in rot], 'XYZ').to_matrix()
    return rot


def ellipsoid_bm(center, radii, segs=24, rings=14, rot=None, taper=0.0, bm=None):
    """An ellipsoid; `taper` narrows its top (in x) to a soft point, like a cat's ear. `rot` is degrees XYZ."""
    bm = bm or bmesh.new()
    made = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    R = as_rot(rot)
    for v in made['verts']:
        t = (v.co.z + 1) / 2
        k = 1 - taper * t
        local = Vector((v.co.x * radii[0] * k, v.co.y * radii[1] * (1 - 0.4 * taper * t), v.co.z * radii[2]))
        v.co = R @ local + Vector(center)
    return bm


def capsule_bm(top, bottom, r_top, r_bottom, segs=16, rings=12, bm=None):
    """A rounded rod from `top` to `bottom`, thinning from r_top to r_bottom (an arm, a leg)."""
    top, bottom = Vector(top), Vector(bottom)
    axis = top - bottom
    length = axis.length
    bm = bm or bmesh.new()
    made = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized())
    for v in made['verts']:
        t = (v.co.z + 1) / 2
        r = r_bottom + (r_top - r_bottom) * t
        z = v.co.z * r + (length / 2 if v.co.z > 0 else -length / 2)
        v.co = rot @ Vector((v.co.x * r, v.co.y * r, z)) + (top + bottom) / 2
    return bm


def bean_bm(center, radii, flare=0.12, segs=28, rings=16):
    """An ellipsoid a little wider at the bottom, like a bean."""
    bm = ellipsoid_bm((0, 0, 0), radii, segs, rings)
    for v in bm.verts:
        k = 1 + flare * (-v.co.z / radii[2])
        v.co.x *= k
        v.co.y *= k
        v.co += Vector(center)
    return bm


def bezier(p0, p1, p2, p3, n=24):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3)
    return out


def tube_bm(pts, radius, segs=16, bm=None):
    """A closed, round-ended tube along `pts`; `radius(t)` gives the radius at 0..1 along it (a trunk, a tail)."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    bm = bm or bmesh.new()
    tans = []
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        tans.append((b - a).normalized())
    u = tans[0].cross(Vector((0, 0, 1)))
    if u.length < 1e-3:
        u = tans[0].cross(Vector((1, 0, 0)))
    u.normalize()
    rings = []

    def ring(c, t, u, r):
        w = t.cross(u)
        return [bm.verts.new(c + (u * math.cos(a) + w * math.sin(a)) * r)
                for a in (2 * math.pi * j / segs for j in range(segs))]

    frames = []
    for i in range(n):
        if i:
            u = tans[i - 1].rotation_difference(tans[i]) @ u
            u = (u - tans[i] * u.dot(tans[i])).normalized()
        frames.append(u.copy())
    # round caps: a few shrinking rings past each end
    CAP = 4
    r0, r1 = radius(0), radius(1)
    for k in range(CAP, 0, -1):
        a = k / (CAP + 1) * math.pi / 2
        rings.append(ring(pts[0] - tans[0] * r0 * math.sin(a), tans[0], frames[0], r0 * math.cos(a)))
    for i in range(n):
        rings.append(ring(pts[i], tans[i], frames[i], radius(i / (n - 1))))
    for k in range(1, CAP + 1):
        a = k / (CAP + 1) * math.pi / 2
        rings.append(ring(pts[-1] + tans[-1] * r1 * math.sin(a), tans[-1], frames[-1], r1 * math.cos(a)))
    for ra, rb in zip(rings, rings[1:]):
        for j in range(segs):
            bm.faces.new((ra[j], ra[(j + 1) % segs], rb[(j + 1) % segs], rb[j]))
    start = bm.verts.new(pts[0] - tans[0] * r0)
    end = bm.verts.new(pts[-1] + tans[-1] * r1)
    for j in range(segs):
        bm.faces.new((rings[0][(j + 1) % segs], rings[0][j], start))
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % segs], end))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def shell_bm(base, field, offset=0.0035):
    """A thin coloured patch lying just over a surface: `base` (a bmesh, world space) is lifted by `offset` along
    its normals, and only the part where field(point) > 0 is kept. The cut edge is pulled onto field = 0, so
    spots and stripes have smooth outlines instead of steps."""
    bmesh.ops.triangulate(base, faces=base.faces)  # so every corner of a cut face shares an edge with the inside
    base.normal_update()
    f = {v: field(v.co) for v in base.verts}
    keep = [fc for fc in base.faces if any(f[v] > 0 for v in fc.verts)]
    gone = [fc for fc in base.faces if fc not in set(keep)]
    moved = {}
    for v in base.verts:
        if f[v] > 0:
            continue
        cross = [v.co + (e.other_vert(v).co - v.co) * (f[v] / (f[v] - f[e.other_vert(v)]))
                 for e in v.link_edges if f[e.other_vert(v)] > 0]
        if cross:
            moved[v] = sum(cross, Vector()) / len(cross)
    for v, co in moved.items():
        v.co = co
    for v in base.verts:
        v.co += v.normal * offset
    bmesh.ops.delete(base, geom=gone, context='FACES')
    loose = [v for v in base.verts if not v.link_faces]
    bmesh.ops.delete(base, geom=loose, context='VERTS')
    return base


def surface(center, radii, d):
    """Where direction `d` from the middle of an ellipsoid meets its surface, and the outward normal there."""
    d = Vector(d).normalized()
    t = 1 / math.sqrt(sum((d[i] / radii[i]) ** 2 for i in range(3)))
    p = d * t
    n = Vector((p.x / radii[0] ** 2, p.y / radii[1] ** 2, p.z / radii[2] ** 2)).normalized()
    return Vector(center) + p, n


# ---------- the body every animal shares ----------

class Body:
    """Lays out one chibi animal from a few numbers and builds the shared parts."""

    def __init__(self, s):
        self.s = s
        self.fur = mat('fur', s['fur'])
        self.hips = bpy.data.objects.new('hips', None)
        self.hips.location = (0, 0, HIP_Z)
        scene.collection.objects.link(self.hips)
        bpy.context.view_layer.update()
        self.torso = new_object('torso', bean_bm(s['torso_c'], s['torso_r'], s.get('flare', 0.14)), (0, 0, WAIST_Z), self.hips, self.fur)
        self.neck_parent = self.torso
        self.neck_z = s['neck_z']

    def head(self, parent=None, pivot=None):
        s = self.s
        self.HC = Vector(s['head_c'])
        self.HR = s['head_r']
        pivot = pivot or (0, 0, self.neck_z)
        self.head_ob = new_object('head', ellipsoid_bm(self.HC, self.HR, 40, 24), pivot, parent or self.torso, mat(s.get('head_mat', 'fur'), s['fur']))
        self.head_pivot = Vector(pivot)
        return self.head_ob

    def face(self, below, side, out=0.0):
        """A point on the head, by the angles the page's face decal uses: `below` the middle (radians, + is down)
        and to the `side` (radians, + is the animal's left, +x). The dot eyes sit at below 0.355, side ±0.37."""
        u = Vector((math.sin(side) * math.cos(below), -math.cos(side) * math.cos(below), -math.sin(below)))
        rx, ry, rz = self.HR
        return self.HC + Vector((u.x * rx, u.y * ry, u.z * rz)) * (1 + out)

    def limbs(self, hand_mat=None, foot_mat=None):
        s = self.s
        sx, sz = s['shoulder']
        lr = s['leg_r']
        fx, fy, fz = s['foot_r']
        fwd = s.get('foot_fwd', 0.02)
        for side, tag in ((1, 'L'), (-1, 'R')):
            # the front legs are the hind legs again: the same thickness, length and foot, so on all fours the animal
            # stands on four matching legs (standing up, they hang at its sides)
            sh = Vector((side * sx, 0, sz))
            arm = new_object(f'arm_{tag}', capsule_bm(sh + Vector((0, 0, -0.005)), sh + Vector((0, 0, -0.15)), lr, lr * 0.92), sh, self.torso, self.fur)
            new_object(f'hand_{tag}', ellipsoid_bm(sh + Vector((0, -fwd, -HIP_Z + fz)), (fx, fy, fz), 20, 12), sh, arm, foot_mat or hand_mat or self.fur)
            hip = Vector((side * s['leg_x'], 0, HIP_Z))
            leg = new_object(f'leg_{tag}', capsule_bm(hip + Vector((0, 0, -0.005)), hip + Vector((0, 0, -0.15)), lr, lr * 0.92), hip, self.hips, self.fur)
            new_object(f'foot_{tag}', ellipsoid_bm(hip + Vector((0, -s.get('foot_fwd', 0.02), -HIP_Z + fz)), (fx, fy, fz), 20, 12), hip, leg, foot_mat or self.fur)

    def belly(self, material, cx=0.085, cz=0.33, hz=0.12, depth=0.0):
        """A paler tummy patch on the front of the torso."""
        s = self.s

        def field(p):
            q = (p.x / cx) ** 2 + ((p.z - cz) / hz) ** 2
            return min(1 - q, -(p.y + depth) * 12)
        new_object('belly', shell_bm(bean_bm(s['torso_c'], s['torso_r'], s.get('flare', 0.14), 96, 56), field), (0, 0, WAIST_Z), self.torso, material)

    def tail(self, pts, radius, material=None, tip=None, tip_mat=None):
        bm = tube_bm(pts, radius)
        if tip and not tip_mat:
            ellipsoid_bm(Vector(pts[-1]) + Vector(tip[0]), tip[1], 16, 10, bm=bm)
        tail = new_object('tail', bm, pts[0], self.hips, material or self.fur)
        if tip and tip_mat:
            new_object('tail_tip', ellipsoid_bm(Vector(pts[-1]) + Vector(tip[0]), tip[1], 16, 10), pts[0], tail, tip_mat)
        return tail


def lens_bm(center, normal, radii, spin=0.0, bm=None):
    """A flat round blob lying on a surface at `center` facing `normal` (eyes and nostrils for the preview, nails)."""
    n = Vector(normal).normalized()
    R = Vector((0, 0, 1)).rotation_difference(n).to_matrix() @ Matrix.Rotation(spin, 3, 'Z')
    return ellipsoid_bm(center, radii, 16, 10, rot=R, bm=bm)


def spots_field(centres, r_of):
    """field > 0 inside any of the round spots at `centres` (world points), each of radius r_of(i)."""
    rs = [r_of(i) for i in range(len(centres))]

    def field(p):
        best = -1.0
        for c, r in zip(centres, rs):
            dx, dy, dz = p.x - c.x, p.y - c.y, p.z - c.z
            # a little wobble so the spots aren't perfect circles
            d = math.sqrt(dx * dx + dy * dy + dz * dz)
            best = max(best, 1 - d / r)
        return best
    return field


# ---------- the five ----------

BASE = dict(
    torso_c=(0, 0, 0.35), torso_r=(0.135, 0.115, 0.19), flare=0.15,
    neck_z=0.5, head_c=(0, 0, 0.75), head_r=(0.3, 0.275, 0.26),
    shoulder=(0.1, 0.465), arm_r=0.044, paw_r=0.05,
    leg_x=0.07, leg_r=0.05, foot_r=(0.06, 0.08, 0.042),
)


def spec(**kw):
    s = dict(BASE)
    s.update(kw)
    return s


def elephant():
    # standing 1.05 m to the crown of the head (head 0.77 ± 0.28), the ears' tops at about 1.0 m
    s = spec(fur='#a9afb7', torso_c=(0, 0, 0.36), torso_r=(0.15, 0.13, 0.2), neck_z=0.51,
             head_c=(0, 0, 0.77), head_r=(0.33, 0.29, 0.28), shoulder=(0.112, 0.48), arm_r=0.052, paw_r=0.058,
             leg_x=0.076, leg_r=0.06, foot_r=(0.07, 0.08, 0.046), foot_fwd=0.012)
    B = Body(s)
    head = B.head()
    pink, nail = mat('ear_inner', '#e9b9b3'), mat('nail', '#f2ebdf')
    B.limbs()
    B.belly(mat('belly', '#bcc2c9'), cx=0.1, cz=0.33, hz=0.13)
    for side, tag in ((1, 'L'), (-1, 'R')):
        # big soft fan ears standing out from the sides of the head, swept a little back
        c = B.HC + Vector((side * 0.36, 0.06, 0.01))
        R = Matrix.Rotation(side * math.radians(28), 3, 'Z') @ Matrix.Rotation(side * math.radians(-8), 3, 'Y')
        ear = ellipsoid_bm(c, (0.2, 0.032, 0.23), 32, 18, rot=R)
        pivot = B.HC + Vector((side * 0.24, 0.02, 0.02))
        ear_ob = new_object(f'ear_{tag}', ear, pivot, head, B.fur)
        new_object(f'ear_inner_{tag}', ellipsoid_bm(c + R @ Vector((-side * 0.01, -0.024, -0.005)), (0.155, 0.012, 0.18), 28, 14, rot=R), pivot, ear_ob, pink)
        # three pale toenails on the front of each foot
        nails = None
        fc = Vector((side * s['leg_x'], -s['foot_fwd'], s['foot_r'][2]))
        for a in (-0.55, 0, 0.55):
            p, n = surface(fc, s['foot_r'], (math.sin(a), -math.cos(a), -0.25))
            nails = lens_bm(p, n, (0.02, 0.016, 0.01), bm=nails)
        foot = bpy.data.objects[f'foot_{tag}']
        new_object(f'nails_{tag}', nails, foot.matrix_world.translation, foot, nail)
    # the trunk: out from between the eyes, down, and curling up and forward at the tip
    b = B.face(0.5, 0, -0.25)
    pts = bezier(b, b + Vector((0, -0.12, -0.05)), b + Vector((0, -0.2, -0.2)), b + Vector((0, -0.29, -0.12)), 28)
    trunk = new_object('trunk', tube_bm(pts, lambda t: 0.075 - 0.032 * t, 20), b, head, B.fur)
    # a few soft wrinkles across the trunk
    lines = None
    for t in (0.42, 0.55, 0.68):
        i = int(t * (len(pts) - 1))
        tan = (pts[i + 1] - pts[i - 1]).normalized()
        r = 0.075 - 0.032 * t
        ring = bmesh.new() if lines is None else lines
        lines = ellipsoid_bm(pts[i], (r + 0.003, r + 0.003, 0.004), 20, 6, rot=Vector((0, 0, 1)).rotation_difference(tan).to_matrix(), bm=ring)
    new_object('trunk_lines', lines, b, trunk, mat('wrinkle', '#959ca5'))
    B.tail(bezier((0, 0.13, 0.27), (0, 0.18, 0.26), (0, 0.2, 0.2), (0, 0.21, 0.13), 12), lambda t: 0.016 - 0.004 * t,
           tip=((0, 0.0, -0.02), (0.022, 0.022, 0.035)), tip_mat=mat('tuft', '#6f757d'))
    return B


def dog():
    # standing 1.01 m to the crown of the head (head 0.75 ± 0.26)
    s = spec(fur='#d8a46b')
    B = Body(s)
    head = B.head()
    white, brown = mat('cream', '#f7f0e5'), mat('ear', '#9c6a45')
    B.limbs(foot_mat=white)
    B.belly(white)
    for side, tag in ((1, 'L'), (-1, 'R')):
        # soft floppy ears hanging down the sides of the head, a little out at the bottom
        c = B.HC + Vector((side * 0.285, 0.015, 0.0))
        R = Matrix.Rotation(-side * math.radians(14), 3, 'Y') @ Matrix.Rotation(math.pi, 3, 'X')
        new_object(f'ear_{tag}', ellipsoid_bm(c, (0.085, 0.04, 0.16), 24, 14, rot=R, taper=0.3), B.HC + Vector((side * 0.23, 0.015, 0.16)), head, brown)
    # a pale muzzle below the eyes with a big dark nose on top
    m = B.face(0.62, 0, -0.18)
    muzzle = new_object('muzzle', ellipsoid_bm(m, (0.115, 0.085, 0.078), 28, 16), m, head, white)
    n = B.face(0.5, 0, 0.02) + Vector((0, -0.045, 0.0))
    new_object('nose', ellipsoid_bm(n, (0.042, 0.03, 0.03), 20, 12), n, muzzle, mat('nose', '#3b2c29'))
    # a happy tail curling up behind
    B.tail(bezier((0, 0.1, 0.27), (0, 0.2, 0.25), (0, 0.24, 0.35), (0, 0.2, 0.44), 16), lambda t: 0.03 - 0.008 * t,
           tip=((0, -0.01, 0.01), (0.026, 0.026, 0.03)), tip_mat=white)
    return B


def cat():
    # an orange tabby, standing 1.01 m to the crown of the head (head 0.75 ± 0.255), the ears' tips at about 1.12 m
    s = spec(fur='#e8a566', torso_r=(0.125, 0.11, 0.19), head_r=(0.3, 0.27, 0.255), leg_r=0.046, arm_r=0.04, paw_r=0.046)
    B = Body(s)
    head = B.head()
    cream, pink, stripe = mat('cream', '#f7e8d4'), mat('ear_inner', '#efb0ac'), mat('stripes', '#c97a40')
    B.limbs(hand_mat=None, foot_mat=cream)
    B.belly(cream, cx=0.075)
    for side, tag in ((1, 'L'), (-1, 'R')):
        # pointed ears on top, leaning out a little, pink inside
        base = B.HC + Vector((side * 0.17, 0.02, 0.2))
        R = Matrix.Rotation(side * math.radians(22), 3, 'Y')
        c = base + R @ Vector((0, 0, 0.065))
        ear = new_object(f'ear_{tag}', ellipsoid_bm(c, (0.095, 0.045, 0.11), 24, 14, rot=R, taper=0.85), base, head, B.fur)
        new_object(f'ear_inner_{tag}', ellipsoid_bm(c + R @ Vector((0, -0.03, -0.012)), (0.06, 0.016, 0.075), 20, 12, rot=R, taper=0.85), base, ear, pink)
    # two round whisker pads, a little pink nose above them, and three whiskers each side
    pads = None
    for side in (1, -1):
        p = B.face(0.62, side * 0.13, -0.1)
        pads = ellipsoid_bm(p, (0.06, 0.05, 0.048), 20, 12, bm=pads)
    m = B.face(0.62, 0, -0.1)
    muzzle = new_object('muzzle', pads, m, head, cream)
    n = B.face(0.5, 0, 0.03)
    new_object('nose', ellipsoid_bm(n, (0.03, 0.02, 0.022), 16, 10, rot=(180, 0, 0), taper=0.5), n, muzzle, mat('nose', '#e48e98'))
    wh = None
    for side in (1, -1):
        for k, (dz, tilt) in enumerate(((0.012, 0.18), (-0.008, 0.0), (-0.028, -0.18))):
            a = B.face(0.6, side * 0.32, -0.02) + Vector((0, 0, dz))
            b = a + Vector((side * 0.11, 0.015, 0.11 * tilt))
            wh = capsule_bm(a, b, 0.0035, 0.0028, 8, 4, bm=wh)
    new_object('whiskers', wh, m, head, mat('whisker', '#8a6250'))
    # tabby stripes: three on the forehead, bands over the back
    hb = ellipsoid_bm(B.HC, B.HR, 96, 56)

    def brow(p):
        q = p - B.HC
        if q.y > 0.02 or q.z < 0.13:
            return -1
        return max(1 - ((q.x - x0) / 0.019) ** 2 - ((q.z - 0.215) / 0.065) ** 2 for x0 in (-0.068, 0, 0.068))
    new_object('stripes_head', shell_bm(hb, brow), (0, 0, B.neck_z), head, stripe)
    tb = bean_bm(s['torso_c'], s['torso_r'], s['flare'], 96, 56)

    def bands(p):
        if p.y < -0.04:
            return -1
        z = p.z + 0.35 * abs(p.x)  # chevrons pointing down the back
        return min(math.cos(2 * math.pi * (z - 0.3) / 0.085) - 0.35, (p.y + 0.04) * 20, 0.5 - p.z)
    new_object('stripes', shell_bm(tb, bands), (0, 0, WAIST_Z), B.torso, stripe)
    # a long tail rising behind in an S, with rings
    pts = bezier((0, 0.09, 0.26), (0, 0.32, 0.22), (0, 0.18, 0.5), (0.0, 0.3, 0.64), 30)
    rad = lambda t: 0.028 - 0.004 * t
    tail = B.tail(pts, rad)
    rings = None
    for t0 in (0.4, 0.55, 0.7, 0.85):
        i0, i1 = int(t0 * 30), int(t0 * 30) + 2
        rings = tube_bm(pts[i0:i1 + 1], lambda t, t0=t0: rad(t0) + 0.003, 16, bm=rings)
    new_object('stripes_tail', rings, pts[0], tail, stripe)
    return B


def line_tube(a, b, ra, rb, n=16, segs=24):
    """A straight round-ended tube from a to b, made of many rings (so patches can be cut along it)."""
    a, b = Vector(a), Vector(b)
    return tube_bm([a + (b - a) * (i / n) for i in range(n + 1)], lambda t: ra + (rb - ra) * t, segs)


def giraffe():
    # 1.34 m to the crown of the head (head 1.10 ± 0.235 on a tall neck), 1.44 m to the tips of the horns
    s = spec(fur='#ecc57f', torso_c=(0, 0, 0.34), torso_r=(0.13, 0.112, 0.18), neck_z=0.95,
             head_c=(0, -0.06, 1.10), head_r=(0.26, 0.255, 0.235), leg_r=0.044, arm_r=0.039, paw_r=0.045,
             foot_r=(0.052, 0.064, 0.042), shoulder=(0.097, 0.45))
    B = Body(s)
    spot, light, dark = mat('spots', '#b8763f'), mat('cream', '#f6e5c0'), mat('hoof', '#6e4a33')
    # a tall neck rising from the top of the body, leaning a touch forward
    nb, nt = Vector((0, -0.01, 0.42)), Vector((0, -0.05, s['neck_z']))
    neck_bm = lambda res=1: line_tube(nb, nt, 0.088, 0.07, 16 * res, 24 * res)
    neck = new_object('neck', neck_bm(), nb, B.torso, B.fur)
    head = B.head(parent=neck, pivot=nt)
    B.limbs(hand_mat=None, foot_mat=dark)
    belly = dict(cx=0.075, cz=0.32, hz=0.11)
    B.belly(light, **belly)
    # a long soft snout, nostrils on it
    m = B.face(0.72, 0, -0.2)
    mr = (0.135, 0.105, 0.085)
    muzzle = new_object('muzzle', ellipsoid_bm(m, mr, 28, 16), m, head, light)
    nos = None
    for side in (1, -1):
        p, nn = surface(m, mr, (side * 0.5, -1, -0.1))
        nos = lens_bm(p, nn, (0.011, 0.016, 0.005), bm=nos)
    new_object('nostrils', nos, m, muzzle, mat('nose', '#c08f62'))
    for side, tag in ((1, 'L'), (-1, 'R')):
        # two little horns with round brown knobs, and leafy ears sticking out sideways
        hb = B.HC + Vector((side * 0.085, 0.04, 0.19))
        ht = hb + Vector((side * 0.025, 0.01, 0.12))
        horn_ob = new_object(f'horn_{tag}', capsule_bm(ht, hb, 0.024, 0.028, 12, 8), hb, head, B.fur)
        new_object(f'knob_{tag}', ellipsoid_bm(ht, (0.036, 0.036, 0.034), 16, 10), hb, horn_ob, mat('knob', '#8a5a36'))
        base = B.HC + Vector((side * 0.21, 0.06, 0.1))
        R = Matrix.Rotation(side * math.radians(72), 3, 'Y') @ Matrix.Rotation(math.radians(10), 3, 'X')
        new_object(f'ear_{tag}', ellipsoid_bm(base + R @ Vector((0, 0, 0.06)), (0.048, 0.024, 0.09), 20, 12, rot=R, taper=0.6), base, head, B.fur)
    # a short brown mane down the back of the neck
    mane_pts = [nb + (nt - nb) * t + Vector((0, 0.078 - 0.016 * t, 0)) for t in [0.15 + 0.85 * i / 12 for i in range(13)]]
    new_object('mane', tube_bm(mane_pts, lambda t: 0.024, 12), nb, neck, spot)
    # spots: scattered over the body, the neck, the legs and the back of the head (none on the pale tummy)
    rnd = random.Random(7)

    def scatter_on(base_fn, n, rmin, rmax, ok=lambda p: True):
        pts = []
        bm = base_fn()
        cand = [v.co.copy() for v in bm.verts]
        bm.free()
        rnd.shuffle(cand)
        for c in cand:
            r = rnd.uniform(rmin, rmax)
            if ok(c) and all((c - q).length > r + qr + 0.014 for q, qr in pts):
                pts.append((c, r))
            if len(pts) >= n:
                break
        return pts

    def off_tummy(p):
        q = (p.x / (belly['cx'] + 0.05)) ** 2 + ((p.z - belly['cz']) / (belly['hz'] + 0.05)) ** 2
        return (q > 1 or p.y > 0) and p.z > 0.19
    tor = lambda: bean_bm(s['torso_c'], s['torso_r'], s['flare'], 96, 56)
    for name, base_fn, parent, pivot, n, rr, ok in (
        ('spots', tor, B.torso, (0, 0, WAIST_Z), 40, (0.026, 0.038), off_tummy),
        ('spots_neck', lambda: neck_bm(3), neck, nb, 40, (0.022, 0.032), lambda p: 0.5 < p.z < nt.z - 0.08 and p.y < 0.05),
        ('spots_head', lambda: ellipsoid_bm(B.HC, B.HR, 96, 56), head, nt, 5, (0.024, 0.03), lambda p: p.y > B.HC.y + 0.08 and p.z > B.HC.z - 0.05),
    ):
        pts = scatter_on(base_fn, n, *rr, ok=ok)
        new_object(name, shell_bm(base_fn(), spots_field([p for p, _ in pts], lambda i: pts[i][1])), pivot, parent, spot)
    for side, tag in ((1, 'L'), (-1, 'R')):
        hip = Vector((side * s['leg_x'], 0, HIP_Z))
        lb = line_tube(hip + Vector((0, 0, -0.005)), hip + Vector((0, 0, -0.15)), s['leg_r'], s['leg_r'] * 0.92, 30, 48)
        pts = [(hip + Vector((side * 0.035, -0.03, -0.06)), 0.024), (hip + Vector((-side * 0.03, 0.03, -0.11)), 0.021)]
        leg = bpy.data.objects[f'leg_{tag}']
        new_object(f'spots_leg_{tag}', shell_bm(lb, spots_field([p for p, _ in pts], lambda i: pts[i][1])), hip, leg, spot)
    B.tail(bezier((0, 0.1, 0.26), (0, 0.15, 0.25), (0, 0.18, 0.2), (0, 0.19, 0.12), 12), lambda t: 0.013,
           tip=((0, 0.0, -0.025), (0.022, 0.022, 0.04)), tip_mat=mat('tuft', '#7a4f33'))
    return B


def rounded_box_bm(center, radii, side=3.0, ends=4.0, segs=32, rings=20):
    """A box with soft, evenly rounded edges all round (a superellipsoid), as in person.py."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        rho = math.hypot(x, y)
        zz = math.copysign(abs(z) ** (2 / ends), z)
        ring = rho ** (2 / ends)
        if rho > 1e-6:
            c, s_ = x / rho, y / rho
            x = math.copysign(abs(c) ** (2 / side), c) * ring
            y = math.copysign(abs(s_) ** (2 / side), s_) * ring
        v.co = Vector((x * radii[0], y * radii[1], zz * radii[2])) + Vector(center)
    return bm


def wombat():
    # stocky and round, standing 0.925 m to the crown of the head (head 0.68 ± 0.245, broad and flat)
    s = spec(fur='#8d7462', torso_c=(0, 0, 0.33), torso_r=(0.18, 0.16, 0.19), flare=0.2, neck_z=0.47,
             head_c=(0, 0, 0.68), head_r=(0.33, 0.27, 0.245), shoulder=(0.13, 0.44), arm_r=0.05, paw_r=0.056,
             leg_x=0.088, leg_r=0.058, foot_r=(0.068, 0.082, 0.042))
    B = Body(s)
    head = B.head()
    paw = mat('paw', '#6f5848')
    B.limbs(hand_mat=paw, foot_mat=paw)
    B.belly(mat('belly', '#a68e7a'), cx=0.12, cz=0.31, hz=0.13)
    inner = mat('ear_inner', '#b8998a')
    for side, tag in ((1, 'L'), (-1, 'R')):
        # small, slightly pointed ears set wide on the flat head
        base = B.HC + Vector((side * 0.25, 0.04, 0.12))
        R = Matrix.Rotation(side * math.radians(38), 3, 'Y')
        c = base + R @ Vector((0, 0, 0.035))
        ear = new_object(f'ear_{tag}', ellipsoid_bm(c, (0.045, 0.026, 0.05), 20, 12, rot=R, taper=0.6), base, head, B.fur)
        new_object(f'ear_inner_{tag}', ellipsoid_bm(c + R @ Vector((0, -0.018, -0.006)), (0.028, 0.01, 0.032), 16, 10, rot=R, taper=0.6), base, ear, inner)
    # a broad snout in the same fur, and a big, square, dark nose: the wombat's look
    m = B.face(0.72, 0, -0.17)
    muzzle = new_object('muzzle', ellipsoid_bm(m, (0.14, 0.08, 0.07), 28, 16), m, head, B.fur)
    n = B.face(0.64, 0, 0.0) + Vector((0, -0.02, 0))
    new_object('nose', rounded_box_bm(n, (0.09, 0.035, 0.042), side=3.2, ends=3.0, segs=28, rings=16), n, muzzle, mat('nose', '#3f332e'))
    B.tail([(0, 0.15, 0.23), (0, 0.17, 0.225)], lambda t: 0.026)  # just a tiny stub
    return B


BUILDERS = dict(elephant=elephant, dog=dog, cat=cat, giraffe=giraffe, wombat=wombat)


def export(kind):
    global scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    MATS.clear()
    B = BUILDERS[kind]()
    size = SIZE.get(kind, 1)
    B.hips.scale = (size, size, size)
    B.hips.location.z = HIP_Z * size
    bpy.context.view_layer.update()
    out = os.path.join(OUT_DIR, f'animal-{kind}.glb')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_materials='EXPORT',
        export_texcoords=False,
    )
    meshes = [o for o in scene.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    top = max((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)
    head = bpy.data.objects['head']
    crown = max((head.matrix_world @ v.co).z for v in head.data.vertices)
    low = min((o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices)

    def tree(o, d=0):
        return '  ' * d + o.name + '\n' + ''.join(tree(c, d + 1) for c in sorted(o.children, key=lambda c: c.name))
    print(f'EXPORTED {kind}: {out} {os.path.getsize(out) // 1024} KB, {tris} tris, height {top:.3f}, head crown {crown:.3f}, '
          f'head centre {B.HC.z * size:.3f}, lowest {low:.4f}')
    print(tree(bpy.data.objects['hips']))


for k in KINDS:
    export(k)


# ---------- optional preview: the person and the five in a row ----------
if PREVIEW:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    MATS.clear()
    ink, blush = mat('ink', '#3b2a22'), mat('blush', '#f0a0a5')

    def add_face(head):
        """Dot eyes and blush where the page's face decal puts them (person.js, faceGeometry and drawFace)."""
        bpy.context.view_layer.update()
        vs = [v.co for v in head.data.vertices]
        lo = Vector([min(v[i] for v in vs) for i in range(3)])
        hi = Vector([max(v[i] for v in vs) for i in range(3)])
        c, size = (lo + hi) / 2, hi - lo
        bm = None
        bl = None
        for side in (1, -1):
            for below, sd, r, which in ((0.355, 0.37, 0.022, 'eye'), (0.55, 0.594, 0.04, 'blush')):
                u = Vector((math.sin(side * sd) * math.cos(below), -math.cos(side * sd) * math.cos(below), -math.sin(below)))
                p = c + Vector((u.x * size.x, u.y * size.y, u.z * size.z)) / 2 * 1.015
                n = Vector((u.x / size.x, u.y / size.y, u.z / size.z)).normalized()
                if which == 'eye':
                    bm = lens_bm(p, n, (r, r, 0.006), bm=bm)
                else:
                    bl = lens_bm(p, n, (r, r * 0.8, 0.004), bm=bl)
        for name, b, m in (('eyes', bm, ink), ('cheeks', bl, blush)):
            me = bpy.data.meshes.new(name)
            b.to_mesh(me)
            b.free()
            me.materials.append(m)
            ob = bpy.data.objects.new(name, me)
            scene.collection.objects.link(ob)
            ob.parent = head

    LOOK = dict(skin='#ffd8bf', hair='#6b4630', shirt='#ffe28a', pants='#8db6ea', shoe='#fbf8f2')
    paint = {'head': 'skin', 'ear': 'skin', 'hand': 'skin', 'leg': 'skin', 'hair': 'hair', 'torso': 'shirt', 'arm': 'shirt',
             'shorts': 'pants', 'shoe': 'shoe'}
    row = ['person'] + KINDS
    POSE = args[2] if len(args) > 2 else None
    POSES = {
        # from person.js pose(): part -> (rotation.x, rotation.z) in three.js
        'squat': {'hips_drop': (0.12, 0), 'leg_L': (-1.35, 0.45), 'leg_R': (-1.35, -0.45), 'torso': (0.22, 0),
                  'arm_L': (-0.9, -0.2), 'arm_R': (-0.9, 0.2)},
        'walk': {'leg_L': (0.55, 0), 'leg_R': (-0.55, 0), 'arm_L': (-0.55, 0.12), 'arm_R': (0.55, -0.12), 'head': (0.15, 0.1)},
        'twist': {'arm_L': (0, 1.35), 'arm_R': (0, -1.35), 'head': (-0.3, 0)},
    }
    gap = 0.95
    for i, kind in enumerate(row):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=PERSON if kind == 'person' else os.path.join(OUT_DIR, f'animal-{kind}.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if kind == 'person' and o.type == 'MESH':
                base = o.name.split('.')[0]
                if base.startswith(('cuff', 'briefs')):
                    o.hide_render = True
                key = next((v for k2, v in paint.items() if base.startswith(k2)), 'skin')
                o.data.materials.clear()
                o.data.materials.append(mat('p_' + key, LOOK[key]))
            if o.parent is None:
                o.location.x += (i - (len(row) - 1) / 2) * gap
        head = next(o for o in new if o.name.split('.')[0] == 'head')
        add_face(head)
        if POSE:
            # the page's poses, turned into Blender's frame: three's rotation.x is Blender's x, three's z is Blender's -y
            byname = {o.name.split('.')[0]: o for o in new}
            for part, (rx, rz) in POSES[POSE].items():
                if part == 'hips_drop':
                    byname['hips'].location.z -= rx
                elif part in byname:
                    byname[part].rotation_mode = 'XYZ'
                    byname[part].rotation_euler = (rx, -rz, 0)

    ground = bpy.data.meshes.new('ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
    bm.to_mesh(ground)
    bm.free()
    ground.materials.append(mat('ground', '#b9cfa6'))
    scene.collection.objects.link(bpy.data.objects.new('ground', ground))

    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#dbe9f5'), 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    for name, loc, energy, size in (('key', (3, -6, 6), 650, 6), ('fill', (-5, -4, 3), 220, 6), ('rim', (0, 5, 4), 220, 5)):
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.size = size
        lo = bpy.data.objects.new(name, light)
        lo.location = loc
        scene.collection.objects.link(lo)
        lo.rotation_euler = (Vector((0, 0, 0.6)) - lo.location).to_track_quat('-Z', 'Y').to_euler()
    for m in bpy.data.materials:
        m.use_backface_culling = True  # the person's parts too (the hair is an open shell the page draws double-sided)
    bpy.data.objects['hair'].data.materials[0].use_backface_culling = False
    view = args[1] if len(args) > 1 else 'front'
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = {'front': (0.6, -9.0, 1.6), 'side': (9.0, -2.5, 1.4), 'back': (-0.6, 9.0, 1.6)}[view]
    scene.collection.objects.link(cam)
    target = bpy.data.objects.new('target', None)
    target.location = (0, 0, 0.72)
    scene.collection.objects.link(target)
    cam.constraints.new('TRACK_TO').target = target
    scene.camera = cam
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 700
    scene.view_settings.view_transform = 'Standard'
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('preview', PREVIEW)
