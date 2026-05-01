import argparse
import os
import sys

import bpy


def parse_args():
    argv = sys.argv
    passthrough = argv[argv.index("--") + 1 :] if "--" in argv else []

    parser = argparse.ArgumentParser(
        description="Bake evaluated cloth puff frames into glTF morph targets."
    )
    parser.add_argument("--object", default="Text", help="Source object name")
    parser.add_argument(
        "--frames",
        default="0,50,101,150,200,250",
        help="Comma-separated frame list. First frame becomes the Basis.",
    )
    parser.add_argument(
        "--quality",
        choices=("light", "full"),
        default="light",
        help="light disables Subdivision before sampling; full keeps all modifiers.",
    )
    parser.add_argument("--out", required=True, help="Output .glb path")
    return parser.parse_args(passthrough)


def evaluated_mesh_for_frame(obj, frame):
    scene = bpy.context.scene
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(
        evaluated, depsgraph=depsgraph, preserve_all_data_layers=True
    )
    return mesh


def copy_materials(source, target):
    target.data.materials.clear()
    for material in source.data.materials:
        target.data.materials.append(material)


def clear_scene_except(obj):
    for scene_obj in list(bpy.context.scene.objects):
        if scene_obj != obj:
            bpy.data.objects.remove(scene_obj, do_unlink=True)


def add_puff_shape_keys(target, source, frames):
    basis = target.shape_key_add(name="Basis")

    for frame in frames[1:]:
        mesh = evaluated_mesh_for_frame(source, frame)
        if len(mesh.vertices) != len(target.data.vertices):
            raise RuntimeError(
                f"Frame {frame} has {len(mesh.vertices)} vertices, "
                f"but Basis has {len(target.data.vertices)}."
            )

        key = target.shape_key_add(name=f"Puff_{frame:03d}")
        for index, vertex in enumerate(mesh.vertices):
            key.data[index].co = vertex.co

        bpy.data.meshes.remove(mesh)

    return basis


def add_preview_animation(target, frames):
    """Create a simple sequential morph animation for quick validation in viewers."""
    if not target.data.shape_keys:
        return

    key_blocks = target.data.shape_keys.key_blocks
    for key in key_blocks:
        key.value = 0.0

    for shape_index, frame in enumerate(frames[1:], start=1):
        current = key_blocks[shape_index]
        previous = key_blocks[shape_index - 1] if shape_index > 1 else None

        if previous:
            previous.value = 1.0
            previous.keyframe_insert("value", frame=max(frames[0], frame - 1))

        current.value = 0.0
        current.keyframe_insert("value", frame=max(frames[0], frame - 1))
        current.value = 1.0
        current.keyframe_insert("value", frame=frame)

        if previous:
            previous.value = 0.0
            previous.keyframe_insert("value", frame=frame)


def export_glb(target, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_animations=True,
        export_materials="EXPORT",
    )


def main():
    args = parse_args()
    frames = [int(frame.strip()) for frame in args.frames.split(",") if frame.strip()]
    if len(frames) < 2:
        raise ValueError("Provide at least a basis frame and one puff frame.")

    source = bpy.data.objects.get(args.object)
    if source is None:
        raise ValueError(f"Object not found: {args.object}")

    original_subdivision_visibility = {}
    if args.quality == "light":
        for modifier in source.modifiers:
            if modifier.type == "SUBSURF":
                original_subdivision_visibility[modifier.name] = modifier.show_viewport
                modifier.show_viewport = False

    basis_mesh = evaluated_mesh_for_frame(source, frames[0])
    target = bpy.data.objects.new(f"{source.name}_PuffMorphs_{args.quality}", basis_mesh)
    bpy.context.collection.objects.link(target)
    target.matrix_world = source.matrix_world.copy()
    copy_materials(source, target)

    add_puff_shape_keys(target, source, frames)
    add_preview_animation(target, frames)

    for name, visible in original_subdivision_visibility.items():
        source.modifiers[name].show_viewport = visible

    clear_scene_except(target)
    export_glb(target, os.path.abspath(args.out))

    print(
        f"Exported {args.quality} morph GLB with {len(frames) - 1} puff targets: "
        f"{os.path.abspath(args.out)}"
    )


if __name__ == "__main__":
    main()
