#!/bin/bash
# Run on the Linode: renders on the laptop, headless, and waits for the results to sync back.
# Usage: blender/run.sh [lacrymaria.py options]
ssh laptop "PATH=~/.local/bin:\$PATH mutagen sync flush microcosm >/dev/null 2>&1; cd ~/Files/projects/microcosm && /mnt/bigdisk/Binaries/blender-*/blender -b --factory-startup -P blender/lacrymaria.py -- --out ~/Files/projects/microcosm/renders $* 2>&1 | grep -v -E '^Fra:|^$' | tail -25; PATH=~/.local/bin:\$PATH mutagen sync flush microcosm >/dev/null 2>&1"
