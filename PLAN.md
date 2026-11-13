# Microcosm: a perfect microscope, faked

## The idea

Microscope videos of living things (for example the YouTube channel
*Journey to the Microcosmos*, footage by James Weiss) are wonderful but
limited: one fixed viewpoint, a very shallow depth of field, blur, and
whatever playback speed the camera gave us.

This project fakes a perfect microscope: a drop of water that can be viewed
from any angle, at any speed, completely in focus and full of detail. It
stays honest by being driven by real footage:

- **The behaviour comes from the video.** We track how a real organism moved
  in a real clip and use that motion to drive a 3D model.
- **The detail comes from the model.** Fine structure (cilia, membrane folds,
  internal organelles, translucency) is built in Blender from scientific
  references, not recovered from the blurry footage.

Output: **an interactive simulation in the browser** (`web/microcosm.html`,
three.js), to orbit, zoom and change speed freely. This was first planned as
a later extra after Cycles animations; since 2026-11-13 it is the project, and
Cycles rendering is dropped (see step 8). Felipe views it in Firefox on the
laptop. His own list of what he wants next is `goals.txt` (his file: read
it, never edit it).

## First subject: *Lacrymaria olor*

The ciliate with the extensible neck ("swan's tear"). Chosen because it is
both spectacular and unusually well suited to this:

- **Simple, low-dimensional shape.** A teardrop body, a neck, a small head.
  Its pose is basically one curve (the neck centreline) plus body position,
  orientation and neck length.
- **Mostly planar motion.** Under a coverslip it moves mostly in the focal
  plane, so 2D tracking gives most of the motion; depth can be invented
  plausibly (and defocus blur hints at how far the neck leaves the plane).
- **Procedural structure.** Its surface is regular (helical pleats with rows
  of cilia), which suits scripted, procedural modelling in Blender.
- **Excellent reference.** See below.

### What the reference article tells us

`references/lacrymaria-science-adk5511.pdf`: Flaum and Prakash, "Curved
crease origami and topological singularities enable hyperextensibility of
L. olor", *Science* 384, eadk5511 (2024). Key facts for the model and the
motion (the text extraction shows "mm" where the paper means micrometres):

- The cell body is about **40 µm**; the neck can extend to **more than 30
  times the body length** (over 1200 µm) in **under 7 to 30 s**, at speeds
  up to about **1000 to 1400 µm/s**, and retracts about as fast. It does
  this over 20,000 times in its life.
- Extension is **non-affine**: the body does not stretch uniformly. Folded
  material in the body unspools into the neck through a **transition zone**,
  where the pleated, folded surface flattens into the smooth neck.
- The surface carries **15 contiguous helical membrane pleats** (left-handed
  helix). Each pleat holds a band of 14 microtubules. The helix angle varies
  along the cell (about 20° at the tail up to 60° on the body in the
  contracted state; in elongated cells up to 80° then dropping to 20° in the
  neck). Diameter goes from about 40 µm on the body to about 10 µm on the
  neck.
- **Cilia** sit in pits at the bottom of the pleats and cover the body and
  neck uniformly. The **head (anterior) has a ring of longer, specialised
  cilia** that beat or pause together; ciliary beating powers extension and
  ciliary reversals accompany retraction.
- Cytoplasm with small granules; per other sources, two macronuclei, one
  micronucleus, and a contractile vacuole at each end.
- Behaviour: it alternates active hunting (neck sweeping around for prey)
  with resting retracted.
- The paper's **supplementary movies** (S1 to S3 and more, on science.org)
  are high quality reference footage of extension and of the cytoskeleton.
  Worth getting.

## Pipeline

As first planned. What was actually built differs in places and is recorded
under the steps below: tracking needed no neural net, the model is rebuilt
per frame instead of keyed, and the viewer runs the model itself instead of
a baked export.

1. **Footage.** Pick a clip: 5 to 15 s, one continuous shot, organism mostly
   in focus, no zoom changes. Stabilise against the background if the slide
   is panned. Download for private study only (yt-dlp).
2. **Model and look (the still).** Build Lacrymaria in Blender: body, neck as
   a tube along a curve, head, helical pleats, cilia (geometry nodes / hair),
   translucent materials, internal structures. Render in microscope styles
   (brightfield, darkfield, DIC-like relief) and in an "impossible" fully
   sharp style.
3. **Tracking.** Segment the organism in every frame (SAM 2 or similar, on
   the laptop GPU), skeletonise the mask to get the neck centreline, fit a
   smooth curve, track body position and angle. Fallback: hand-place a few
   points on keyframes and interpolate.
4. **Drive the model.** Key the neck curve, neck length and body pose from
   the tracking. The pleats unfold at the transition zone as the neck
   lengthens (non-affine extension, as in the paper). Cilia beat in
   metachronal waves procedurally; head cilia beat or pause in sync.
5. **Render.** New camera angles, slow motion (the motion is curves, so
   retiming is smooth), side by side with the original.
6. **Optional: interactive viewer.** Export baked animation (glTF) to a
   three.js page.

## Steps and validation, in order

Each step is a cheap test of the riskiest open question before investing in
the next.

- [ ] **1. Reference gathering.** Article (done: in `references/`, figure
  pages as images in `references/pages/`). Still to get: supplementary movies, SEM and microscopy images, the Journey to the
  Microcosmos episode "Lacrymaria: Vicious Long-Necked Predators".
- [x] **2. Still model and look development.** *Felipe's main concern: can
  Claude build a great model?* Build a static Lacrymaria and render a few
  angles next to real images. If it is not striking, fall back to: a bought or
  downloaded base mesh, Felipe sculpting the base shape, or a stylised look.
  Go/no-go point for the whole project.
  **Built 2026-11-13 and approved by Felipe** ("very strong start"), so the
  fallbacks were not needed:
  `blender/lacrymaria.py` builds the whole cell procedurally (pleated wall
  with 15 helical grooves, about 6,900 cilia as hair curves, head crown,
  nuclei, vacuoles, granules, extrusomes) in a "fluorescence glow" look.
  `blender/run.sh --views top,hero,body,head` renders on the laptop
  (headless, RTX 3060 via OptiX; about 20 s per 1080p frame at 160 samples)
  into `renders/`; `blender/lacrymaria_still.blend` is the saved scene.
  The pose is yaw and pitch along arc length, ready to be driven by
  tracking. Known weak points: nuclei look flat, no water or background
  particles yet, only one look (no brightfield or DIC style).
- [x] **3. Pick the clip.** Done 2026-11-13. The episode is YouTube
  `rWtMIQguUOo` (1080p, 60 fps), kept on the laptop in
  `/mnt/bigdisk/microcosm-footage/` (outside the mirror), with two short
  extra clips (`iUxWmk_E6BA` Science News, `ZquzlvEEZq8` Nikon Small World).
  Contact sheets with timestamps: `footage/sheets/`. Chosen shot: **1:01.45
  to 1:31.5, darkfield, 200x**, cut out as `footage/clipA.mp4`. It is one
  continuous take: the camera pans to follow the neck while the body stays
  almost still. Its scale bar gives **3.89 px per um**. The quote text
  covers it from about 18 s in. Other candidates: 3:01 to 3:24 (DIC, teal,
  whole animal in frame, a second ciliate nearby), 2:08 to 2:32.
- [x] **4. Tracking test.** Done 2026-11-13, classical vision, no neural
  net needed for darkfield. `tracking/track.py` (run with
  `tracking/run.sh footage/clipA.mp4 tracking/clipA --t0 0 --t1 18 --seed 1300,600`):
  thresholds the animal against the dark background, skeletonises it, takes
  the longest path as the centreline tail to head, and measures the camera
  pan by phase correlation of the background (checked: the body's world
  position stays put while its image position moves 500 px). Writes
  `tracking/clipA.npz` and `clipA_overlay.mp4`. About 0.18 s per frame.
  Works well when the neck is in focus. **Fails when** the neck leaves the
  frame, goes far out of focus (faint, drops below the threshold: around
  14.5 s), or touches another particle (2.6 s). `tracking/prepare.py` cleans
  a time range into `clipA_pose.npz`: world coordinates in um, bad frames
  bridged, light smoothing in time, plus this individual's measured shape
  (body radius 11.3 um, body 59 um long, neck radius 1.5 um: much smaller
  than the paper's cell).
- [x] **5. Rough motion test.** Done 2026-11-13, with the
  full model instead of a grey one, since rendering is cheap. The pose and
  position match the footage frame for frame. The full run took 40 minutes
  for 102 frames (24 s per frame for two 720p views; long necks cost more).
  To improve: the orbit camera sits too far away, the motion is flat (one
  plane), and there is no water or background around the animal.
  `blender/animate.py` rebuilds the cell for every frame from that frame's
  centreline and length (about 9 s per frame for two 720p views).
  `blender/animate.sh clipA 9.2 204 --step 2` renders clip seconds 9.2 to
  12.6 (one full extend and retract) and writes `renders/clipA_compare.mp4`
  (original next to the reconstruction in the same framing),
  `clipA_orbit.mp4` and `clipA_orbit_slow.mp4`. The model lengthens only
  at the neck, as the paper describes; body cilia are anchored from the
  tail and neck cilia from the head. Still flat: the motion is in one
  plane, with no depth from focus blur yet.
- **6. Full animation in Cycles: dropped** 2026-11-13 in favour of the
  interactive viewer. `blender/animate.sh` still works if a rendered clip is
  ever wanted; it lacks the depth and surroundings of step 8.
- [x] **7. Interactive viewer, first version.** Done 2026-11-13, ahead of
  step 6 at Felipe's request. `web/microcosm.html` is one self-contained
  file (750 KB, three.js and the tracked motion inside) that opens straight
  from disk. Not a baked export: the model is rebuilt on the GPU every
  frame from the tracked centreline (`web/src/main.js` is a port of
  `blender/lacrymaria.py` to shaders), so it plays at any speed with smooth
  in-between poses. Orbit, zoom, play and pause, scrub, speed 1/32x to 2x.
  Additive glow plus bloom, close to the Cycles look. Lowers its own
  resolution if the frame rate drops. Build: `node web/build.mjs` (packages
  in `~/microcosm-build` on the Linode, outside the mirror);
  `web/check.sh` rebuilds and screenshots it in the laptop's Chromium. Checked by screenshot only: frame rate could not be
  measured at first because the test window was not visible.
  **Browser and graphics card (2026-11-13):** Felipe uses Firefox only, on
  the laptop; the phone is dropped. In Firefox the page runs at about 78 fps
  on the Intel chip, which he finds fine. Firefox does reach the RTX 3060,
  under Wayland, when started with `__NV_PRIME_RENDER_OFFLOAD=1
  __GLX_VENDOR_LIBRARY_NAME=nvidia __VK_LAYER_NV_optimus=NVIDIA_only`
  (144 fps, the screen's refresh rate; confirmed with nvidia-smi). GNOME's
  right-click "Launch using Discrete Graphics Card" sets the same variables.
  Not made permanent: kept for more demanding projects. Testing uses the
  Chromium Felipe keeps open in the background (`web/check.sh`; it never
  starts a browser and opens its tab in the background). Chrome was
  uninstalled.
  **Distance fix:** lines and tiny points are never drawn thinner than a
  pixel, so from far away the cilia added up to a star-like glow. Their
  brightness now falls with their real width on screen.
  **Flicker fix (2026-11-13):** the whole screen went black for single
  frames, mostly seen from above. Cause: `pow()` of a rim term (one minus
  how much a surface faces the camera) that rounding pushes just below zero
  where a surface faces the camera dead on. That gives a NaN pixel, and the
  bloom smears one NaN over the whole frame. It was in the pellicle (so it
  was there before the filaments, as Felipe remembered), the shells and the
  thick filaments, which made it more frequent. Every such base is now
  clamped: do the same in any new shader. Also redraws at once after a
  quality drop. Measured with `~/microcosm-build/flicker.js` passed to
  `web/check.sh`: it sweeps the camera, reads each frame back, and when one
  is black hides objects in turn to name the culprit. Before: 2 black frames
  in 4438 without the filaments, about 5 in 3000 with them; after: 0 in
  9179. It drives the frames itself, because the covered test tab can drop
  to about one animation frame a second. Chromium on the Intel chip only;
  not tested in Firefox.

- [ ] **8. Depth and surroundings.** In the web viewer.
  **Decision 2026-11-13: Cycles is dropped; the project is the interactive
  simulation.** `blender/` stays as the reference model and for stills.
  **Depth is invented**, by Felipe's decision: from above the pose must match
  the footage, and from the side it only needs to look interesting. Each
  centreline point moves straight up or down (`inventDepth` in
  `web/src/main.js`). First try (waves up to 17% of the neck length that
  passed through zero) still read as flat. Now the body noses up a little
  and the neck always climbs away from it, to about a third to a half of its
  own length at the head, with a slow S-bend on top.
  **Surroundings are procedural** (`makeSurroundings`), from a fixed seed,
  modelled on frames of real debris kept in `references/debris/`. First
  try, clumps of hard shaded balls, looked terrible. Real flocs are soft
  clouds 80 to 300 um across: a dark dense core, an amber body, a pale
  ragged fringe with glinting grains, and things caught in them. So each
  floc is now a noise-shaped cloud of soft see-through puffs in three
  layers drawn in a fixed order (pale fringe added, amber body blended over
  it, dark core over that, so no sorting is needed), plus fine grit, glints
  that twinkle, round orange cells, needles and loose crumbs. Two big flocs
  sit near the animal as in the footage, seven more around and below. Also:
  three thick green filaments, 16 fine filaments, the drifting motes. The
  thick ones were chains of beads at first, which Felipe rejected even when
  see-through; they now follow the Oscillatoria in the episode (0:36 and
  6:02, frames in `references/filaments/`): long, nearly straight, smooth
  tubes 11 to 16 um wide with fine cross-walls every few um, a brighter
  wall and a grainy inside, drawn as see-through meshes. Built in the viewer, not in Blender: a mesh would give hard
  surfaces again. The final image is dithered (no more banded haze).
  **Felipe's verdicts, 2026-11-13:** debris "look amazing now", thick
  filaments "looks good", thin filaments ok, and the stronger depth "is good
  now" (the first, weaker version he called still flat).
  **Less glowy organism (2026-11-13; Felipe saw it and moved on to the
  behaviour without objecting, no explicit verdict):** he found
  the animal too contrasting with the debris and wanted no glow if the
  detail survives. Two changes. The animal is now in its own scene
  (`animal`), drawn by a second render pass after the bloom, so it gets no
  halo at all; this is safe because nothing in the surroundings writes depth
  or is drawn after it. And the pellicle and cilia went from saturated cyan
  to a pale grey-blue with a faint haze for the body, after the ciliate in
  `references/debris/darkfield_0014.jpg`, which is the same pale family as
  the debris fringe. Organelles unchanged. All the detail is still there.
  **Long looping behaviour (2026-11-13; after the second version Felipe
  only asked for the speed slider back, no explicit verdict on the motion):** at his suggestion the footage is now only the inspiration, so
  the tracker did not need extending. The behaviour is invented and written
  as periodic functions of time ("behaviour" in `web/src/main.js`), so it
  loops with no seam (checked: the pose at the end matches the start to
  0.0003 um). The animal stops at three places (`SITES`); at each it throws
  its neck out three or four times in hand-picked directions in 3D (out in
  about a second, a few quick part-retractions, back in under a second, the
  timing of the tracked clip; neck up to 186 um), creeping and turning a
  little meanwhile; then it pulls the neck in and swims along a curve to the
  next place, spinning about its axis. One loop is 50 s of its own time,
  shown at 0.3x, so about 165 s. The frame along the cell is carried without
  twist, so the neck can point anywhere. The play bar is gone: space pauses,
  f shows the frame rate. A speed slider is back (2026-11-13, his request): 1/16x to 2x, default 1/4x, and all the way left pauses.
  **Felipe rejected the first version** for two things. (1) The camera
  followed the animal, so it did not look as if it moved: the camera is now
  fixed and frames all three places. (2) The neck was "all wobbly with
  waves" (a buckling wave on retraction, noise along the neck, a flicking
  head). Plotting the tracked centrelines over time showed what the real
  neck does: it is a smooth curve that turns where it leaves the body and
  is nearly straight beyond, it goes out along a line and comes back along
  itself, it sways only as a gentle arc when long, and it swings about with
  a curled tip when short. The neck is now built exactly that way. Lesson:
  look at the tracked data before inventing motion, as with the scenery.
  `~/microcosm-build/clearance.js`, passed to `web/check.sh`, checks that no
  part of the animal comes within a floc or near a thick filament, and the
  loop seam: rerun it after changing `SITES`. `clipA.json` now only supplies
  the cell's measurements and the box the scenery keeps clear.
  `web/check.sh` steps use `viewer.state.t` (seconds), not `state.frame`.
  Not rerun since these changes: the flicker sweep (`flicker.js`). It was
  written when the animal was in the main scene, so check how it walks the
  scene before trusting it; the animal is now drawn after the bloom, so a
  NaN in its shaders can no longer spread over the frame anyway.
  To do: his `goals.txt` (flickering is crossed off there, see step 7):
  more complex organelles, other organisms (paramecium, algae
  with walls), removing the play controls, a GitHub project, hosting,
  making sure the Linode is safe once it is public, and sharing. Before anything is published: the repo ignores
  everything taken from the episode or the paper (see Rights), and the
  Oscillatoria do not sway or glide yet.

## Later subjects

### Tardigrade

The Sketchfab model suggested
(https://sketchfab.com/3d-models/tardigrade-febbf05ea80e432297a5d4864787e44f,
"Tardigrade" by sculptorg, about 780k faces, not rigged) is **not
downloadable** and has no licence: we can't use it. Options: find a
downloadable model with a licence that allows use (CC-BY or similar), buy
one, or build one. Harder than Lacrymaria: eight stubby legs with claws, a
soft segmented body, and footage where the legs are often blurry or hidden, so
pose tracking is harder. Needs a rig.

### Insects

Idea: insect models are much easier to find (many downloadable and rigged),
and there is lots of insect footage. Trade-offs:

- **Easier:** models, rigs and textures exist; insects are made of rigid
  segments with joints, which is what pose-tracking tools handle well
  (DeepLabCut and similar tools are used on flies and ants in research).
- **Harder:** insects move in full 3D, fast, often in handheld footage with
  a moving camera, so recovering 3D pose from one camera is much harder than
  for a nearly flat microscope slide. Leg motion is fast and gets motion
  blur. Best footage: a static camera, insect walking on a flat surface
  (that brings back the "nearly planar" advantage).
- Insects don't give the "perfect microscope" fantasy, but they make a good
  test of the tracking-to-3D pipeline with an off-the-shelf model.

## Rights

- Behaviour seen in footage is a natural fact and not copyrightable; driving
  our own model with motion extracted from a clip makes a new work. The grey
  area is closely reproducing the original shot itself; we do the opposite
  (new angles, detail, speed).
- Downloading YouTube videos breaks YouTube's terms of service (not
  copyright); keep clips private, in `footage/`, out of anything published.
- If anything is published: credit the source ("motion based on footage by
  James Weiss / Journey to the Microcosmos") and preferably ask them first.
- Third-party 3D models only with a licence that allows our use.

## Machines

- **Laptop (`predator`)**: RTX 3060 Laptop GPU (6 GB), 16 cores, 14 GB RAM,
  Blender with its MCP (port 9876 through the tunnel). Tracking, modelling
  and rendering run here, over `ssh laptop`.
- **Linode**: 1 CPU, 2 GB RAM, no GPU, no Blender. Coordination, downloads,
  light scripting only.
- This folder is a two-way Mutagen mirror of the laptop's
  `~/Files/projects/microcosm`. Large files (footage, renders, frame dumps)
  should go in `.syncignore`d folders or stay on the laptop.

## Layout

- `web/`: the viewer. `src/main.js` (all of it), `template.html`,
  `build.mjs`, `check.sh`, `clipA.json` (the tracked clip: now used only
  for the cell's measurements and the box the scenery keeps clear), and the built
  `microcosm.html`. Packages are in `~/microcosm-build` on the Linode.
- `blender/`: `lacrymaria.py` (the reference model), `animate.py`, the
  `run.sh` and `animate.sh` wrappers, a saved `.blend` (not in git).
- `tracking/`: `track.py`, `prepare.py`, `export_json.py`, `stats.py`,
  `run.sh`, and the tracked data (`clipA.npz`, `clipA_pose.npz`).
- Not in git, because they hold other people's material (frames of the
  episode, the paper) or are large and regenerable: `references/`,
  `footage/`, `renders/`, `tracking/check/` and the overlay video. They are
  still in the folder and on the laptop.
- `goals.txt`: Felipe's own list. Not in git; never edit it.
