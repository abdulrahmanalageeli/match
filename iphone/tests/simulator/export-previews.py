"""Give xcresult screenshots predictable names for the artifact."""
from pathlib import Path
import json
import shutil
import sys

root = Path(sys.argv[1])
attachments = root / "attachments"
names = {
    "notifications": "notifications",
    "discovery and luna": "discovery-and-luna",
    "luna expanded": "luna-expanded",
    "discovery profile": "discovery-profile",
}
manifest = attachments / "manifest.json"

def visit(node):
    if isinstance(node, list):
        for child in node:
            yield from visit(child)
    elif isinstance(node, dict):
        if "exportedFileName" in node:
            yield node
        for child in node.values():
            yield from visit(child)

exported = set()
if manifest.exists():
    for item in visit(json.loads(manifest.read_text(encoding="utf-8"))):
        file = attachments / item["exportedFileName"]
        if not file.is_file() or file.suffix.lower() != ".png":
            continue
        label = item.get("suggestedHumanReadableName", "").lower()
        for title, name in names.items():
            if label.startswith(title):
                shutil.copyfile(file, root / "screens" / (name + ".png"))
                exported.add(file)
                break

for file in attachments.glob("*.png"):
    if file not in exported:
        shutil.copyfile(file, root / "screens" / file.name)
if not list((root / "screens").glob("*.png")):
    raise SystemExit("No native preview screenshots were exported")

