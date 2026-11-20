"""Rebuild A03 Character Avatars with Blender --background --factory-startup --python this_file."""
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from build_a01 import block, finish, paint, save_model


def avatar(role="police"):
    is_police = role == "police"

    skin = paint("skin", "F2C9AC")
    hair = paint("hair", "1F2937" if is_police else "2D1F18")
    primary = paint("primary", "2876C9" if is_police else "EC8F32")
    secondary = paint("secondary", "1C2A38" if is_police else "4A3525")
    trim = paint("trim", "0F172A" if is_police else "D4A373")
    accent = paint("accent", "F1C40F" if is_police else "C06C27")
    leather = paint("leather", "18181B" if is_police else "2E2016")

    # Pelvis & Belt
    block("pelvis", (0, 0, 0.76), (0.30, 0.20, 0.14), secondary)
    block("belt", (0, 0, 0.81), (0.31, 0.21, 0.05), leather)
    block("buckle", (0, -0.106, 0.81), (0.06, 0.02, 0.06), accent)

    # Torso (Chest & Abdomen)
    block("chest", (0, 0, 1.04), (0.34, 0.22, 0.42), primary)
    block("collar", (0, 0, 1.24), (0.22, 0.23, 0.05), primary)

    # Neck & Head
    block("neck", (0, 0, 1.30), (0.11, 0.11, 0.07), skin)
    block("head", (0, 0, 1.45), (0.26, 0.26, 0.26), skin)
    block("eye_l", (0.065, -0.131, 1.45), (0.04, 0.02, 0.05), hair)
    block("eye_r", (-0.065, -0.131, 1.45), (0.04, 0.02, 0.05), hair)
    block("hair_top", (0, 0, 1.57), (0.27, 0.27, 0.05), hair)
    block("hair_back", (0, 0.12, 1.46), (0.27, 0.05, 0.18), hair)

    # Role Accessories
    if is_police:
        block("kepi_crown", (0, -0.01, 1.60), (0.28, 0.28, 0.07), primary)
        block("kepi_brim", (0, -0.16, 1.56), (0.26, 0.10, 0.02), trim)
        block("kepi_badge", (0, -0.151, 1.61), (0.045, 0.02, 0.045), accent)
        block("chest_badge", (0.08, -0.115, 1.11), (0.05, 0.02, 0.05), accent)
        block("epaulet_l", (0.18, 0, 1.23), (0.07, 0.12, 0.02), accent)
        block("epaulet_r", (-0.18, 0, 1.23), (0.07, 0.12, 0.02), accent)
    else:
        block("bandana", (0, 0, 1.53), (0.28, 0.28, 0.06), trim)
        block("bandana_knot", (0, 0.16, 1.51), (0.07, 0.05, 0.08), trim)

    # Arms
    for side, sign in [("l", 1), ("r", -1)]:
        block(f"arm_upper_{side}", (sign * 0.21, 0, 1.10), (0.09, 0.09, 0.19), primary)
        block(f"arm_lower_{side}", (sign * 0.21, 0, 0.91), (0.08, 0.08, 0.17), primary)
        block(f"hand_{side}", (sign * 0.21, 0, 0.78), (0.07, 0.07, 0.08), skin)

    # Legs & Feet
    for side, sign in [("l", 1), ("r", -1)]:
        block(f"leg_upper_{side}", (sign * 0.09, 0, 0.54), (0.11, 0.12, 0.34), secondary)
        block(f"leg_lower_{side}", (sign * 0.09, 0, 0.22), (0.10, 0.11, 0.30), secondary)
        block(f"foot_{side}", (sign * 0.09, -0.03, 0.035), (0.11, 0.16, 0.07), leather)


if __name__ == "__main__":
    for role in ("police", "robber"):
        name = f"avatar_{role}"
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system = "METRIC"
        bpy.context.preferences.filepaths.save_version = 0
        avatar(role)
        save_model(name)
