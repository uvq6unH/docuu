"""Create the four A02 visual assets in metres from Blender primitives."""
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from build_a01 import beam, finish, paint, save_model


def bush():
    for x, y, z, size, color in [
        (-.28, -.13, .55, (.72, .87, .55), '638545'),
        (.28, .12, .50, (.72, .88, .50), '527B46'),
    ]:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=(x, y, z))
        finish('foliage', paint('leaves', color)).scale = size


def haystack():
    straw = paint('straw', 'D2A854')
    shade = paint('under_thatch', 'AD813C')
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1, depth=.12, location=(0, 0, .06))
    finish('base', shade)
    for i, (bottom, top, low, high) in enumerate([
        (.98, 1.16, .11, .43), (1.2, 1.02, .42, .79),
        (1.06, .78, .78, 1.12), (.81, .39, 1.11, 1.39), (.43, .10, 1.38, 1.50),
    ]):
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=bottom, radius2=top,
                                        depth=high-low, location=(0, 0, (high+low)/2))
        finish('thatch', straw if i % 2 == 0 else shade)


def fence_segment():
    wood = paint('posts', '806348')
    reed = paint('rails', 'BC995C')
    for x in (-1.94, -.65, .65, 1.94):
        beam('post', (x, 0, 0), (x, 0, .65), .06, wood)
    for z in (.20, .48):
        beam('rail', (-2, -.025, z), (2, -.025, z), .05, reed)


def jail():
    bamboo = paint('bamboo', 'B09558')
    binding = paint('frame', '755D41')
    for x in (-1.91, 1.91):
        for y in (-1.91, 1.91):
            beam('corner', (x, y, 0), (x, y, 2.45), .09, binding)
    for side in (-1, 1):
        edge = side * 1.92
        for n in range(-3, 4):
            t = n * .50
            beam('bar', (t, edge, 0), (t, edge, 2.32), .045, bamboo)
            beam('bar', (edge, t, 0), (edge, t, 2.32), .045, bamboo)
        for z in (.18, 1.66, 2.30):
            beam('crossbar', (-2, edge, z), (2, edge, z), .06, binding)
            beam('crossbar', (edge, -2, z), (edge, 2, z), .06, binding)


for build in (bush, haystack, fence_segment, jail):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.preferences.filepaths.save_version = 0
    build()
    save_model(build.__name__)
