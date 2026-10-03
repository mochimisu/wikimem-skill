"""Zip a built plugin with its manifest at the archive root (no credentials)."""
import pathlib
import sys
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
if not (root / "plugin.json").is_file():
    raise SystemExit("Expected a built plugin directory")
if target.is_relative_to(root):
    raise SystemExit("Write the archive outside the plugin directory")
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob("*")):
        if file.is_symlink():
            raise SystemExit("Plugin symlinks are not allowed")
        if file.is_file():
            archive.write(file, file.relative_to(root))
print(target)
