#!/bin/bash
# Run on the Linode: renders a tracked clip on the laptop and builds the videos.
# Usage: blender/animate.sh <name> <t0 in clip> <frames> [animate.py options]
#   e.g. blender/animate.sh clipA 9.2 204 --step 2
# Frames go to the laptop's /mnt/bigdisk/microcosm-footage/<name>_anim (not synced);
# the videos land in renders/.
name=$1; t0=$2; nframes=$3; shift 3
step=2; for ((i=1;i<=$#;i++)); do [ "${!i}" = "--step" ] && { j=$((i+1)); step=${!j}; }; done
ssh laptop "export PATH=~/.local/bin:\$PATH; mutagen sync flush microcosm >/dev/null 2>&1
cd ~/Files/projects/microcosm && O=/mnt/bigdisk/microcosm-footage/${name}_anim && rm -rf \$O && mkdir -p renders
/mnt/bigdisk/Binaries/blender-*/blender -b --factory-startup -P blender/animate.py -- --pose tracking/${name}_pose.npz --out \$O $* 2>&1 | grep -E '^frame .*[05]/|Error|Traceback|File ' | tail -30
fps=\$(echo \"60000/1001/$step\" | bc -l)
# original | reconstruction, same framing
ffmpeg -v error -y -ss $t0 -i footage/${name}.mp4 -framerate \$fps -i \$O/match/%04d.png -filter_complex \"[0:v]fps=\$fps,scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack=shortest=1\" -frames:v \$(ls \$O/match | wc -l) -c:v libx264 -crf 17 -pix_fmt yuv420p renders/${name}_compare.mp4
ffmpeg -v error -y -framerate \$fps -i \$O/orbit/%04d.png -c:v libx264 -crf 17 -pix_fmt yuv420p renders/${name}_orbit.mp4
# quarter speed, frames blended in between
ffmpeg -v error -y -framerate \$fps -i \$O/orbit/%04d.png -vf \"setpts=4*PTS,minterpolate=fps=30:mi_mode=blend\" -c:v libx264 -crf 17 -pix_fmt yuv420p renders/${name}_orbit_slow.mp4
ls -la renders/*.mp4; mutagen sync flush microcosm >/dev/null 2>&1"
