# Microcosmos

A drop of pond water you can fly through: an interactive 3D simulation of
microscopic life that runs in the browser, and in a VR headset.

Microscope videos are wonderful but limited: one viewpoint, a shallow depth
of field, one playback speed. This project fakes a perfect microscope, where
everything is in focus, full of detail, and can be seen from any angle at any
speed.

## What is in the water

- **Lacrymaria olor**, the ciliate with the neck that stretches to many times
  its body length. It hunts, catches and swallows its prey.
- **Halteria**, the small red ciliates it hunts, which jump away.
- **Paramecium caudatum**, two of them, grazing along the debris.
- **Vorticella**, a bell on a stalk that snaps into a coil.
- **Desmodesmus communis**, rafts of green algae with boxy cell walls.
- Flocs of debris, filaments of Oscillatoria, drifting motes, and the eye of
  a sewing needle for scale.

Everything is procedural: there are no mesh files or textures. Each organism
is a JavaScript module that builds its geometry and shaders from published
measurements, and its motion is a periodic function of time, so the whole
scene loops without a seam. Come close to an organism and its organelles
appear, drawn the way a textbook draws them.

## Running it

Download `web/microcosm.html` and open it in a browser. It is one
self-contained file of about 900 KB. To hear the music, keep `web/music.mp3`
next to it.

| | |
|---|---|
| Drag | orbit |
| Scroll | zoom |
| Click an organism | follow it and read about it |
| Escape, or click open water | let go |
| Slider | speed, from paused to 2x |
| Space | pause |
| F | frame rate |

In a headset (tried on a Quest 2), the "Enter VR" button appears. The left
stick flies, the right stick turns and zooms, the trigger picks the organism
you point at, and holding the grip while moving the right hand sideways
changes the speed.

## Building

The source is in `web/src`; `web/build.mjs` bundles it with three.js into
`web/microcosm.html`:

```
mkdir ~/microcosm-build && cd ~/microcosm-build && npm i three esbuild
node web/build.mjs
```

## How it was made

The whole project was made in two days of conversation between Felipe
Reigosa and Claude (Anthropic's model, in Claude Code): Felipe directed and
judged, Claude wrote the code.

- `conversations/` has those conversations: Felipe's prompts and Claude's
  replies, in order.
- `PLAN.md` is the working notebook: what was tried, what was rejected, and
  why. It also describes paths and tools on Felipe's own machines.
- `blender/` and `tracking/` are from the first stage: a Blender model of
  the Lacrymaria, and the tracking of a real one in microscope footage.

## Credits

- Music: "Dreams Become Real" by Kevin MacLeod (incompetech.com), licensed
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The Lacrymaria's measurements and the timing of its neck come from
  tracking footage by James Weiss in the *Journey to the Microcosmos* episode
  "Lacrymaria: Vicious Long-Necked Predators". No footage is included here.
- Flaum and Prakash, "Curved crease origami and topological singularities
  enable hyperextensibility of *L. olor*", *Science* 384 (2024).
- Hegewald and Braband, "A taxonomic revision of *Desmodesmus* serie
  *Desmodesmus*", *Fottea* 17 (2017).
- Brette, "Integrative neuroscience of *Paramecium*, a 'swimming neuron'",
  *eNeuro* 8 (2021).
- Paramecium videos on Wikimedia Commons by Alexander Klepnev and Jon
  Houseman, used as reference for the motion.
- [three.js](https://threejs.org) (MIT), bundled into `web/microcosm.html`.

## License

The code is under the GNU General Public License v3.0, see `LICENSE`. The
music keeps its own licence, above.
