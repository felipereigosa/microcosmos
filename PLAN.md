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
  **Organelles with parts, close up (2026-11-13, first try, awaiting
  Felipe's verdict):** his idea: from a distance the cell stays as it was,
  and coming closer the blobs gain parts, as a textbook draws them rather
  than as they look in life. `makeDetail` in `web/src/main.js` adds, in the
  same see-through style: pores, chromatin and nucleoli in the macronuclei
  with sheets of rough reticulum beside them, a dense core in the
  micronucleus, 52 mitochondria with cristae, 6 Golgi stacks with vesicles,
  canals round the contractile vacuoles, prey and lysosomes at the food
  vacuoles, a basket of rods in the head, and a basal body under every
  cilium. All of it fades in with distance from the camera (`LOD_MID`: none
  beyond 230 um, all there within 90; `LOD_NEAR` for the basal bodies), so
  the default view is unchanged (checked by screenshot). One change shows at
  any distance: the contractile vacuoles now pulse (`vacFill`: fill slowly,
  empty at a stroke, every 4.6 and 6.1 s of the animal's time), and their
  canals swell as they empty. All surfaces are one mesh and all dots one
  point cloud (53,000 triangles, 4,800 points); each part rides at a fixed
  place in the cell's frame. Placement is checked against the nuclei,
  vacuoles and each other in straight-body coordinates. Cost: not
  measurable in the test Chromium (39 to 47 fps close up with or without,
  noisy); not measured in Firefox. `viewer.look(t, dist, az, el, along)`
  sets up a close view for `web/check.sh` (`along` can be `'head'`).
  Not done: the granule beads are as before and hide a good deal up close.
  **Click to set the pivot (2026-11-13, his request):** a left click on the
  animal (not a drag) slides the view until that spot is in the middle and
  makes it the orbit pivot (`pick` in `web/src/main.js`). The click is
  tested against the centreline rings on the CPU, with a margin for the
  cilia. The pivot stays put; it does not follow the animal. A click on
  open water does nothing. Checked with simulated clicks in the test
  Chromium. **Replaced the same day, see the next point.**
  **Click to select, follow and explain (2026-11-13, his request; no verdict
  yet).** A click on any organism selects it (`hitTest`, `select`,
  `anchorOf` in `web/src/main.js`): the pivot slides to the clicked spot and
  then rides with it (camera and pivot are moved by the same step every
  frame, so the orbit and zoom he has set are kept), and a panel opens with
  what `web/src/info.js` says about that species: name, three figures, two
  paragraphs, a "look closer" list whose dots are the colours the organelles
  are drawn in, and a line on sources and on what is modelled. On the
  Lacrymaria the followed spot keeps its place counted from the tail on the
  body and from the head on the neck, so a click on the head rides the head
  as the neck is thrown. A click on open water or Escape lets go; the cross
  only hides the panel. This reverses the earlier "the camera must not
  follow" for a selected organism, at his request; with nothing selected the
  view is still fixed. Removed at the same time, as he asked: the title, the
  instructions and the credits line on the page. **The credits now appear
  only in the panels' last line** (see Rights before publishing). Under
  640 px wide the panel is a sheet at the bottom and hides the speed slider;
  that layout has not been looked at on a phone. The `<title>` tag still
  says "Lacrymaria olor" (his goal "change the title" is open).
  **The green filaments too (same day, after he asked whether they should):**
  a click on one of the three thick filaments opens an "Oscillatoria" panel
  and puts the pivot on the clicked spot of its centreline
  (`userData.line`); they lie still, so there is nothing to follow. The
  panel says the genus is a guess from their look. The fine filaments, the
  flocs and the orange cells are not clickable.
  To do: his `goals.txt` (flickering is crossed off there, see step 7):
  more complex organelles, other organisms (paramecium, algae
  with walls), removing the play controls, a GitHub project, hosting,
  making sure the Linode is safe once it is public, and sharing. Before anything is published: the repo ignores
  everything taken from the episode or the paper (see Rights), and the
  Oscillatoria do not sway or glide yet.

## Second subject: *Desmodesmus communis*

Felipe asked (2026-11-13) for an alga with boxy cell walls, see-through green,
tumbling about, and picked Desmodesmus (the old "Scenedesmus quadricauda").
**First version built 2026-11-13, awaiting his verdict.**

- **Reference.** `references/desmodesmus/hegewald-braband-2017-fottea.pdf`:
  Hegewald and Braband, "A taxonomic revision of Desmodesmus serie
  Desmodesmus", *Fottea* 17(2): 191 to 208 (2017), open access. Figure pages
  as images in `pages/`, three light micrographs from Wikimedia Commons in
  `photos/` (the look was matched to `maximus1.jpg`). What it gives: cells
  9.6 to 19.3 um long on average (7.6 to 23.1), 2.5 to 3.5 times as long as
  wide, in flat rows of 2, 4 or 8; four spines of 8 to 15 um, about a cell
  length or shorter, on the poles of the outer cells, each a bundle of tubes;
  an outer wall layer with an irregular net, held off the three inner layers
  by tube-like spacers; rosettes of 4 or 5 tubes about 0.5 um across, through
  which bristles are pushed out. The paper is about the wall, not the inside:
  one chloroplast lining the wall with one pyrenoid is the genus description,
  and the rest of the inside (nucleus, Golgi, mitochondria, vacuoles, starch,
  oil) is generic green-alga cell biology placed by hand. Not obtained
  (paywalled): Staehelin and Pickett-Heaps, *J. Phycol.* 11: 163 to 185
  (1975), the classic ultrastructure paper, which would settle the inside.
- **Model.** `web/src/desmodesmus.js`, built straight in the viewer (no
  Blender model, no footage, no tracking: it does not move by itself). Each
  cell is a superellipsoid (`BOX` sets how boxy), outer cells a little
  narrower at the poles. Four meshes per raft: wall, chloroplast (the same
  shell at 0.84, lobed, open along one side), everything else with a surface
  (spines, rosettes, pyrenoid with starch plates, nucleus, Golgi,
  mitochondria, vacuoles), and point sprites for starch grains and oil.
  Close up (`LOD`: all there within 30 um, gone beyond 100) the wall shows
  its net, the chloroplast its thylakoids as lines, and the small organelles
  appear. The net is drawn several times too coarse so that it can be seen.
  Not modelled: the outer layer bridging between cells, the spacers, the
  bristles.
- **In the scene.** `RAFTS` lists four (4, 8, 4 and 2 cells), in the
  `animal` scene, so no glow. The motion is invented and periodic (wander
  about a spot, turn over about a leaning axis, whole cycles per loop), so
  the loop still closes. Passive drifting is what the real thing does; no
  footage was looked at for it. A click on one sets the pivot.
  `viewer.lookAlga(t, k, dist[, az, el])` frames raft k for `web/check.sh`
  (face on when az and el are left out). `~/microcosm-build/algae.js`, passed
  to `web/check.sh`, prints each raft's clearance from flocs, thick filaments
  and the animal over the loop, and the seam: rerun after changing `RAFTS`
  or `SITES`. The page title still says only "Lacrymaria olor".

## Third subject: *Paramecium caudatum*

Felipe asked (2026-11-13) for two paramecia with beautiful cilia, modelled like
the Lacrymaria and moving as in a video. **Built 2026-11-13. He saw the
first version and asked only for them to be smaller (done, see "Shrunk");
no verdict yet on the look or the motion, and he had not seen the shrunk
version when the session ended.**

- **References.** `references/paramecium/brette-2021-eneuro.pdf`: Brette,
  "Integrative neuroscience of Paramecium, a 'swimming neuron'", *eNeuro* 8(3),
  2021, open access (CC BY): a large species, about 200 um, pointed at the
  back; thousands of cilia about 10 um long beating at 10 to 20 Hz, power
  stroke to the rear and right, in metachronal waves that spiral round the
  body; about 1 mm/s, turning over to the left about once a second on a spiral
  wider than the cell, oral groove towards the spiral's axis; the avoiding
  reaction (back up for a fraction of a second, swing the front round with the
  back end still, go on). Videos: five clips from Wikimedia Commons, on the
  laptop in `/mnt/bigdisk/microcosm-footage/paramecium/` (k6, k7, k9, k0 by
  Alexander Klepnev, CC BY 4.0 or BY-SA; h4 by Jon Houseman). Sheets of them
  in `references/paramecium/video/`. `k7` (DIC, free in the water) gave the
  outline; `k6` (grazing along a floc) gave the behaviour.
  `tracking/paramecium_track.py` tracks the cell by colour with the stage's
  motion taken out; it only half works (the mask merges with the debris), but
  the heading over time is clear (`track_k6_plot.png`): the cell keeps its
  front in the floc and swings about it through some 100 degrees and back
  every 7 s or so, creeping, with short jerks backwards at 0.7 to 1.5 body
  lengths a second; in `k7` it noses a crumb for seconds, then is out of frame
  in under a second.
- **Model.** `web/src/paramecium.js`, built in the viewer. A rigid body from a
  hand-drawn width profile with the oral groove pressed into it; about 7,800
  and 6,300 cilia on 96 rows, 2 um apart, each drawn as a line of 8 pieces
  with a three-dimensional beat worked out in the vertex shader (straight
  power stroke, low recovery stroke with a bend running out to the tip),
  phased as waves 11.5 um long that wind four times round the cell; longer
  cilia in a tuft at the back; in the groove they beat towards the mouth.
  Inside: macronucleus and micronucleus, two contractile vacuoles with canals
  beating in turn, the gullet with its three bands, 11 food vacuoles carried
  round and digested (one born every 4.5 s, far faster than life), granules
  and crystals. Close up (`LOD`, as for the Lacrymaria): the lattice of the
  pellicle, trichocysts, basal bodies, nucleoli, mitochondria, Golgi. The
  inside is textbook cell biology placed by hand, not from the paper.
- **Behaviour.** Invented from the above, periodic, so the loop still closes
  (`plan` in the module). Each cell goes round three grazing stops (`SPECS`):
  at each, front end in the fringe of a floc, body swinging about it, a jerk
  back now and then; then back up, turn about the back end, dart to the next
  at up to 900 um/s on a slight spiral. The cilia speed up and their stroke
  swings to the front when it backs up. Stops were chosen to lie in the
  default view and timed around the Lacrymaria. `~/microcosm-build/para.js`,
  passed to `web/check.sh`, prints each stretch's clearance from flocs, thick
  filaments, the Lacrymaria, the algae and the other cell (already less a
  margin; negative only for the floc it is nosing into), and the seam: rerun
  after changing `SPECS`, `SITES` or `RAFTS`. `~/microcosm-build/proj.mjs`
  says where a point falls in the default view. `viewer.lookPara(t, k, dist,
  az, el, along)` frames cell k for `web/check.sh`. A click on one sets the
  pivot. Cost: not measurable in the test Chromium (47 fps with or without).
- **Shrunk (2026-11-13, Felipe's request).** He found them too big: he wants
  the Lacrymaria bigger than the paramecia, and chose "just shrink the
  paramecia" over rescaling the rest. They are now 85 and 75 um, drawn at
  `UNIT` = 1/1.7 scene units per um, so 50 and 44 units against the
  Lacrymaria's body of 59. This reads the scene's unit as 1.7 um: the
  Lacrymaria becomes a large individual of 100 um and the paramecia small ones
  (the *P. aurelia* group and *P. bursaria* go down to about 80 um; figure
  from memory, not checked). The cell is built in real um, so cilia stay 10 um
  and look longer on the smaller body; about 1,900 and 1,600 cilia on 48 rows
  now. Not done: the shape is still *P. caudatum*'s (pointed back, one
  micronucleus), and at this reading the alga's cells would be about 30 um,
  over the paper's 23. All um figures elsewhere in this file are scene units.
- **Open.** At the usual 1/4 speed a dart lasts about 4 s and a swing half a
  minute. The page title still says only "Lacrymaria olor".

## Ideas for more, offered 2026-11-13

Felipe asked what would take "the wow factor to 11". Offered, in this order;
**he has not chosen** (the session ended there). Recommended starting with
the first two, since they improve what is already in the scene.

1. The Lacrymaria catches something: a few small, fast ciliates about the
   debris; once per loop the neck strikes one, the head swells round it and
   the lump travels down the neck to become a food vacuole. Look at real
   footage of a Lacrymaria feeding first. **Chosen by Felipe, parked:** see
   "Next: the Lacrymaria eats" below.
2. Depth of field with the focal plane on the pivot, so a click pulls focus
   to the organism.
3. Water that moves: the motes swept by the paramecia's cilia and swirled at
   the Lacrymaria's head.
4. One reactive organism: Vorticella on a green filament, snapping into a
   coil when something passes (or a Stentor drawing a vortex).
5. One animal: a rotifer. A tardigrade would be far bigger than the rest and
   break "the Lacrymaria is the biggest".
6. Touch: a tap near a paramecium sets off its avoiding reaction; a first
   step towards his "turn it into a game?".
7. Smaller: the Oscillatoria glide and sway, a scale bar that follows the
   zoom, an opening shot falling in from a whole drop, gliding diatoms.

## Microscope focus (built 2026-11-13, awaiting Felipe's verdict)

His goal "toggle microscope focus". A round button by the speed slider (or
the m key) turns on a shallow depth of field: only a thin plane through the
pivot of the view is sharp, so clicking an organism pulls the focus onto it,
and a long one (the Lacrymaria with its neck out) is sharp only in part.

- **How** (`web/src/lens.js`). Nothing in the scene writes depth, so a blur
  from a depth buffer is not possible. A weight patched into every shader by
  `fitLens` sorts what it draws by how blurred it is to be: the sharp part is
  drawn once as before; the rest is drawn once more into five layers (one
  render with five targets) for blurs of 3 to 48 px, each layer is spread
  into discs at its own reduced size (mipmaps) and added on top. Nothing
  changes from frame to frame, so the blur keeps still.
- **Rejected first version.** Drawing the scene several times a frame from
  points across a lens and averaging over frames: Felipe saw the blurred
  things "vibrating like crazy" (the points changed every frame) and found
  it too strong at 0.1. Do not go back to anything that varies in time.
- **Numbers.** `lens.full` 0.045: a thing d out of the focal plane blurs to
  a radius of 0.045 d, at every zoom, so on the screen the blur grows as the
  view is zoomed in; it stops growing at 48 px. Costs about 5 fps on the
  test Chromium (Intel UHD, about 39 fps plain that day).
- **Known limits.** A resolution lowered while the lens was on stays
  lowered after it is turned off. On a phone the button hides with the
  slider while the info panel is open. The granules are now drawn as a
  see-through material that covers fully (same look, needed for the layers).
- **Open.** His verdict on the strength (`viewer.lens.full`) and on the
  look in motion, which stills cannot show.

## Next: the Lacrymaria eats (talked through 2026-11-13, not started)

Felipe asked how hard it would be to add a few smallish things for the
Lacrymaria to eat, realistically. Agreed so far, in talk only; he wants two
basic features first, then this.

- **Prey.** 4 or 5 small ciliates near the flocs, modelled on Cyclidium
  (really 15 to 30 um, sits still and now and then jumps). Size is his
  call: about twice the Lacrymaria's head, because the scene is getting
  busy. The head is about 11 by 6.5 scene units, so the prey is about 20
  long by 10 wide, under half a paramecium (drawn at about 50 and 44).
  Pale, in the family of the debris, so they add no colour. Smaller prey
  (flagellates of 5 to 10 um) was offered and set aside: the swallow would
  hardly show. He has not confirmed the species, only the size.
- **The catch.** One per loop to start. The throws are a scripted table
  (`SITES`, `BOUTS` in `web/src/main.js`) and the prey's path would be
  scripted too, so one throw is aimed to meet a prey at the right moment.
  Real sequence: the head touches, toxicysts paralyse the prey, the mouth
  stretches far wider than the head, the lump goes down the neck into the
  body and ends as a food vacuole (those already exist in the close-up
  detail, `makeDetail`).
- **The hard parts.** The swallow needs a bulge travelling along the body
  profile (`profiles`, `updateRings`) that the pleats and cilia follow; its
  look is the risk, and motion can only be judged by him. The loop: the
  eaten one must be back by the restart, simplest with a replacement
  swimming in from outside the frame later in the loop.
- **Order of work.** Find real feeding footage first and copy the timing
  and the stretch of the mouth; show him stills of the strike and the
  swallow early; add an `info.js` entry and hit test for the prey.
- **Size of the job.** About the same as the paramecia: one session.

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

- `web/`: the viewer. `src/main.js` (Lacrymaria, scenery, the loop), `src/desmodesmus.js` (the algae), `src/paramecium.js` (the paramecia), `template.html`,
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
