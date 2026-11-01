"""Use the Node.js runtime from the geo conda environment to serve the TS project."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def find_geo_node() -> Path:
    override = os.environ.get("GEO_NODE")
    if override:
        candidate = Path(override)
        if candidate.is_file():
            return candidate
        raise RuntimeError("GEO_NODE does not point to a Node.js executable.")
    conda = os.environ.get("CONDA_EXE") or shutil.which("conda")
    if not conda:
        raise RuntimeError("Conda was not found. Set GEO_NODE to your geo environment's node executable.")
    result = subprocess.run([conda, "env", "list", "--json"], capture_output=True, text=True, check=True)
    envs = json.loads(result.stdout)["envs"]
    for env in envs:
        if Path(env).name.lower() == "geo":
            node = Path(env) / ("node.exe" if os.name == "nt" else "bin/node")
            if node.is_file():
                return node
    raise RuntimeError("Node.js was not found in the geo conda environment.")


def main() -> int:
    node = find_geo_node()
    env = os.environ.copy()
    env["PATH"] = str(node.parent) + os.pathsep + env.get("PATH", "")
    npm = node.parent / "node_modules/npm/bin/npm-cli.js"
    if not npm.is_file():
        npm = node.parent.parent / "lib/node_modules/npm/bin/npm-cli.js"
    if not npm.is_file():
        raise RuntimeError("npm was not found next to the geo Node.js runtime.")
    print(f"Node.js: {node}", flush=True)
    if not (ROOT / "node_modules/typescript").is_dir() or not (ROOT / "node_modules/@types/node").is_dir():
        subprocess.run([str(node), str(npm), "ci" if (ROOT / "package-lock.json").exists() else "install"], cwd=ROOT, env=env, check=True)
    subprocess.run([str(node), str(npm), "run", "build"], cwd=ROOT, env=env, check=True)
    server = subprocess.Popen([str(node), "dist/backend/server.js"], cwd=ROOT, env=env)
    try:
        return server.wait()
    except KeyboardInterrupt:
        if server.poll() is None:
            server.terminate()
        server.wait()
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(f"Startup failed: {error}", file=sys.stderr)
        sys.exit(1)
