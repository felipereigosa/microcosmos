#!/bin/bash
# Run on the Linode: runs the tracker on the laptop. Usage: tracking/run.sh <clip> <out> [options]
ssh laptop "export PATH=~/.local/bin:\$PATH UV_CACHE_DIR=/mnt/bigdisk/.uv-cache; mutagen sync flush microcosm >/dev/null 2>&1; cd ~/Files/projects/microcosm && uv run -q --no-project --with opencv-python-headless --with scikit-image --with numpy tracking/track.py $* 2>&1 | tail -8; mutagen sync flush microcosm >/dev/null 2>&1"
