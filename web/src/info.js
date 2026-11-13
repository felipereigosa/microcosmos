// What the panel says about each organism when it is clicked. The figures are those of
// the living thing, from the same sources the models were built from (see each module);
// the dots in "look closer" are the colours the parts are drawn in.
const PINK = '#e6389e', BLUE = '#8cd9ff', ORANGE = '#ff6630', GOLD = '#ffc738', VIOLET = '#667aff', GREEN = '#99d940', AMBER = '#ff9e33', PALE = '#b9d6dc';

export const INFO = {
  lacrymaria: {
    accent: '#8fd3df',
    kind: 'Ciliate · hunter',
    name: 'Lacrymaria olor',
    tag: 'The "tear of a swan": one cell with a neck it can throw out many times its own length.',
    stats: [['1 cell', 'the whole animal'], ['30×', 'its body length, at full reach'], ['15', 'pleats wound round it']],
    text: [
      'It stays in one place and casts its neck out again and again, feeling through the debris for smaller cells to eat, then draws it in and swims on. The neck can go from nothing to over a millimetre in seconds, and the cell does this some 20,000 times in its life.',
      'The trick is in its skin. Fifteen pleats wind round the body as a helix, each stiffened by a band of microtubules; the folded surface unspools into the neck like curved origami and folds away again when it comes back.',
    ],
    look: [
      [PALE, 'Cilia', 'in rows along the pleats, with a ring of longer ones round the head that pulls the neck out'],
      [AMBER, 'Extrusomes', 'rods in the head, fired into prey on contact'],
      [PINK, 'Two macronuclei', 'with the small micronucleus between them'],
      [BLUE, 'Contractile vacuoles', 'fill with water and empty at a stroke'],
      [GREEN, 'Food vacuoles', 'earlier meals, being digested'],
      [ORANGE, 'Mitochondria', 'under the surface, with a basal body at the foot of every cilium'],
    ],
    model: 'Shape measured from footage by James Weiss (Journey to the Microcosmos); structure after Flaum & Prakash, Science 2024. Behaviour is modelled, not observed, and the organelles are coloured as in a textbook: in life they are colourless.',
  },
  desmodesmus: {
    accent: '#a5dc6e',
    kind: 'Green alga · colony',
    name: 'Desmodesmus communis',
    tag: 'A raft of sister cells joined side by side, with a spine at each corner.',
    stats: [['', 'cells in this colony'], ['8–23 µm', 'length of a cell'], ['4', 'spines, on the end cells']],
    text: [
      'It has no cilia or flagella and does not swim: it drifts and tumbles wherever the water takes it, living on light. Colonies come in rows of two, four or eight cells, all daughters of one mother cell, and are among the commonest algae of ponds and lakes.',
      'Each cell sits in a tough wall of several layers, the outermost a fine net held off the rest by tiny struts. The long spines are thought to slow its sinking and make it an awkward mouthful.',
    ],
    look: [
      ['#3fae2a', 'Chloroplast', 'one per cell, lining the wall like a cup, striped with thylakoids'],
      ['#ccf26b', 'Pyrenoid', 'where carbon dioxide is fixed, sheathed in starch plates'],
      [PINK, 'Nucleus', 'one in each cell'],
      [PALE, 'Wall', 'its net and rosettes show up close'],
      [GOLD, 'Oil and starch', 'the stores, as scattered grains'],
    ],
    model: 'Measurements after Hegewald & Braband, Fottea 2017. The net of the wall is drawn coarser than life so that it can be seen; the inside is generic green alga cell biology.',
  },
  vorticella: {
    accent: '#7fa2ff',
    kind: 'Ciliate · filter feeder',
    name: 'Vorticella',
    tag: 'A bell on a spring, fishing from where it stands.',
    stats: [['few ms', 'to coil its stalk'], ['seconds', 'to stretch out again'], ['1¼ turns', 'of cilia round the rim']],
    text: [
      'It lives fixed by a stalk to debris or plants. The wreath of cilia round the rim of the bell beats in waves and sets up a ring-shaped eddy in the water in front of it, which carries bacteria in to the funnel of the mouth.',
      'At a disturbance the band inside the stalk contracts and the stalk snaps into a coil, among the fastest movements of any living thing for its size, while the bell closes. Then it slowly uncoils and opens again. Drawn small here; in life the bell is 50 to 90 µm long.',
    ],
    look: [
      [BLUE, 'Stalk', 'a clear sheath with the contractile band, the spasmoneme, winding inside'],
      [PALE, 'Wreath of cilia', 'round the rim only; the body of the bell is bare, ringed with fine lines'],
      ['#e0d68c', 'Funnel', 'the mouth, leading from the edge of the disc down into the bell'],
      [PINK, 'Macronucleus', 'a long band bent into a C, with the small micronucleus beside it'],
      [BLUE, 'Contractile vacuole', 'beside the funnel, pumping water out'],
      [GREEN, 'Food vacuoles', 'and mitochondria'],
    ],
    model: 'Proportions as usually given for Vorticella convallaria (review: Ryu and others, Micromachines 2017). The specks in the eddy are there to show the current; they are not eaten.',
  },
  paramecium: {
    accent: '#c3cdf5',
    kind: 'Ciliate · grazer',
    name: 'Paramecium caudatum',
    tag: 'The slipper animalcule, rowing itself along with thousands of cilia.',
    stats: [['10–20', 'beats a second, each cilium'], ['1 mm/s', 'at full speed'], ['1 turn/s', 'rolling as it swims']],
    text: [
      'Its cilia beat in waves that run over the body like wind over wheat, driving it forward on a spiral. At a clump of debris it noses in and swings about, while the cilia of the groove along its side sweep bacteria down to the mouth.',
      'When it bumps into something it backs up for a moment, the cilia striking forward, pivots about its back end and sets off another way. The two here are drawn small; in life this species is 170 to 300 µm long.',
    ],
    look: [
      [PALE, 'Cilia', 'on a lattice in the pellicle, with trichocysts between them; drawn short here, in life about 10 µm long'],
      [PINK, 'Macronucleus', 'the big bean, with the micronucleus pressed against it'],
      [BLUE, 'Contractile vacuoles', 'two stars of canals that pump water out in turn'],
      ['#e0d68c', 'Gullet', 'the funnel at the end of the groove where food vacuoles form'],
      [GREEN, 'Food vacuoles', 'carried round the cell, browning as they are digested'],
      [ORANGE, 'Mitochondria', 'and a few Golgi stacks deeper in'],
    ],
    model: 'After Brette, eNeuro 2021, and videos by Alexander Klepnev (Wikimedia Commons, CC BY 4.0). Behaviour is modelled, not observed; the food vacuoles travel far faster than in life.',
  },
  oscillatoria: {
    accent: '#6fd08a',
    kind: 'Cyanobacterium · filament',
    name: 'Oscillatoria',
    tag: 'A long green thread of disc-shaped cells, stacked like a roll of coins.',
    stats: [['0', 'nuclei: it is a bacterium'], ['1 row', 'of cells, end to end'], ['2.4 bn yr', 'since its kin first filled the air with oxygen']],
    text: [
      'It looks like a plant but is a bacterium: each thin disc is one cell, with no nucleus and no chloroplast. The pigments that catch the light are spread through the whole cell, which is why the thread is evenly green.',
      'It grows by its cells dividing across the thread, and multiplies when a piece breaks off and glides away. In life the threads creep slowly and sway their tips from side to side, the oscillation they are named for; the ones here lie still.',
    ],
    look: [
      ['#3fae2a', 'Cross-walls', 'the fine dark lines every few micrometres, one between each pair of cells'],
      ['#8fe0a0', 'Sheath and wall', 'the brighter outline of the tube'],
      ['#2f8f3a', 'Grainy inside', 'pigment membranes and stores, with no organelles to pick out'],
    ],
    model: 'Shape after the Oscillatoria in footage by James Weiss (Journey to the Microcosmos): tubes 11 to 16 µm wide. The genus is a guess from their look; nothing inside is modelled beyond the cross-walls.',
  },
};
