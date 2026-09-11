// ============================================================
// Character hook bundle used by server.js as CHAR_HOOKS[characterId].
// Most legacy character logic still lives in server.js; modules here are
// gradually extracted per character.
// ============================================================

const tohno = require("./tohno");
const temari = require("./temari");
const oberon = require("./oberon");
const takuto = require("./takuto");
const appleguy = require("./appleguy");
const nanaya = require("./nanaya");
const satoru = require("./satoru");
const shiki = require("./shiki");
const doomguy = require("./doomguy");
const oguri = require("./oguri");
const miyako = require("./miyako");
const tepeu = require("./tepeu");
const hikaru = require("./hikaru");
const phenex = require("./phenex");
const kotone = require("./kotone");
const bard = require("./bard");
const kai = require("./kai");
const mageslayer = require("./mageslayer");
const takumi = require("./takumi");
const bat_ben = require("./bat_ben");
const princess_shiki = require("./princess_shiki");
const ultraman_trigger = require("./ultraman_trigger");
const escanor = require("./escanor");
const hisakawa_sister = require("./hisakawa_sister");
const ignis = require("./ignis");
const eiji = require("./eiji");
const haruka = require("./haruka");
const conner = require("./conner");
const dan = require("./dan");
const shido = require("./shido");
const yui = require("./yui");
const ippo = require("./ippo");
const the_supplicant = require("./the_supplicant");
const brian = require("./brian");
const producer_lumi = require("./producer_lumi");
const muimi = require("./muimi");
const cayenne = require("./cayenne");
const daichi = require("./daichi");

const CHARACTER_MODULES = [
  tohno,
  temari,
  oberon,
  takuto,
  appleguy,
  nanaya,
  satoru,
  shiki,
  doomguy,
  oguri,
  miyako,
  tepeu,
  hikaru,
  phenex,
  kotone,
  bard,
  kai,
  mageslayer,
  takumi,
  bat_ben,
  princess_shiki,
  ultraman_trigger,
  escanor,
  hisakawa_sister,
  ignis,
  eiji,
  haruka,
  conner,
  dan,
  shido,
  yui,
  muimi,
  ippo,
  the_supplicant,
  brian,
  producer_lumi,
  cayenne,
  daichi,
];

const CHAR_HOOKS = {};
for (const mod of CHARACTER_MODULES) CHAR_HOOKS[mod.id] = mod;

module.exports = CHAR_HOOKS;
