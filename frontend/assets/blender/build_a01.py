"""Rebuild A01 with Blender --background --factory-startup --python this_file."""
import math
from pathlib import Path

import bpy
from mathutils import Vector

source = Path(__file__).resolve().parent
web = source.parents[1] / "public" / "models"


def paint(name, hex_color):
    mat = bpy.data.materials.new(name)
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    mat.diffuse_color = [((v + 0.055) / 1.055) ** 2.4 if v > .04045 else v / 12.92 for v in rgb] + [1]
    mat.roughness = .95
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = mat.diffuse_color
    shader.inputs['Roughness'].default_value = .95
    return mat


def finish(name, material):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def block(name, center, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = finish(name, mat)
    obj.dimensions = size
    return obj


def beam(name, a, b, radius, mat, sides=6):
    direction = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=direction.length,
                                       location=(Vector(a) + Vector(b)) / 2)
    obj = finish(name, mat)
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()


def house(index):
    wall = paint('lime_plaster', ['E6D5A5', 'EFE2C3', 'DCC79F'][index])
    tile = paint('fired_clay', ['A84E35', '98513C', 'AA5944'][index])
    block('walls', (0, 0, 1.5), (7.8, 7.8, 3), wall)
    # Triangular gables and two broad sloping roof faces.
    vertices = [(x, y, z) for x in (-4, 4) for y, z in [(-4, 3), (4, 3), (0, 4.94)]]
    mesh = bpy.data.meshes.new('pitched_roof')
    mesh.from_pydata(vertices, [], [(2,1,0),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
    obj = bpy.data.objects.new('roof', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(tile)
    for n in range(27):
        x = -3.9 + n * .30
        for side in (-1, 1):
            beam('roof_rib', (x, side * 3.96, 3.04), (x, 0, 4.94), .043, tile)
    beam('ridge', (-4, 0, 4.94), (4, 0, 4.94), .06, tile, 8)
    door_x = [0, -.8, .8][index]
    block('door', (door_x, -3.925, 1.08), (1.26, .05, 2.16), tile)
    for x in (-2.62, 2.62):
        block('shutter', (x, -3.925, 1.56), (1.40, .05, 1.32), tile)
        for row in range(4):
            block('louver', (x, -3.97, 1.12 + row * .29), (1.17, .055, .075), wall)
        block('sill', (x, -3.95, .86), (1.56, .10, .1), wall)


def tree(index):
    wood = paint('bark', '72533F')
    leaves = paint('canopy', ['5E854E', '487752'][index])
    beam('trunk', (0, 0, 0), (0, 0, 2.5), .35, wood)
    for n in range(4):
        angle = n * math.pi / 2 + index * .4
        x, y = math.cos(angle), math.sin(angle)
        beam('branch', (0, 0, 2.5), (.83*x, .83*y, 3.25), .12, wood)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=(x*.70, y*.70, 3.7 + .15*(n%2)))
        obj = finish('foliage', leaves)
        obj.scale = (1.23 - index*.12, 1.19, 1.02 + index*.30)
        obj.rotation_euler.z = angle
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=(0, 0, 4.3 + .42*index))
    finish('top', leaves).scale = (1.24, 1.2, .88)


def save_model(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / f'{name}.blend'), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(web / f'{name}.glb'), export_format='GLB',
                              use_selection=True, export_yup=True)


if __name__ == "__main__":
    for family, variants, build in [('house', 'abc', house), ('tree', 'ab', tree)]:
        for index, variant in enumerate(variants):
            name = f'{family}_{variant}'
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.context.scene.unit_settings.system = 'METRIC'
            bpy.context.preferences.filepaths.save_version = 0
            build(index)
            save_model(name)
