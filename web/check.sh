#!/bin/bash
# Run on the Linode: rebuild the viewer, load it in the laptop's Chromium and save
# screenshots to /tmp/web_N.jpg. Needs the Chromium Felipe keeps open (check with
# `laptop-chromium`; never start one). Opens its tab in the background.
# Arguments: JS to run before each screenshot; a value it returns is printed.
set -e
laptop-chromium >/dev/null || { laptop-chromium; exit 1; }
node ~/microcosm/web/build.mjs
ssh laptop 'PATH=~/.local/bin:$PATH mutagen sync flush microcosm >/dev/null 2>&1'
node ~/microcosm-build/shot.mjs file:///home/felipe/Files/projects/microcosm/web/microcosm.html /tmp/web "$@"
