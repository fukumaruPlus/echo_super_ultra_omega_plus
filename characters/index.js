// ============================================================
// Character hook bundle used by server.js as CHAR_HOOKS[characterId].
// Most legacy character logic still lives in server.js; modules here are
// gradually extracted per character.
// ============================================================

const tohno = require("./tohno");
const temari = require("./temari");
const kuwagata = require("./kuwagata");
const eva13 = require("./eva13");
const oberon = require("./oberon");
const takuto = require("./takuto");
const appleguy = require("./appleguy");
const nanaya = require("./nanaya");
const satoru = require("./satoru");
const shiki = require("./shiki");
const doomguy = require("./doomguy");
const oguri = require("./oguri");
const hakuno = require("./hakuno");
const miyako = require("./miyako");
const banagher = require("./banagher");
const riddhe = require("./riddhe");
const tepeu = require("./tepeu");
const shrade_elan = require("./shrade_elan");
const hikaru = require("./hikaru");
const phenex = require("./phenex");
const kotone = require("./kotone");
const gambler = require("./gambler");
const broadband_man = require("./broadband_man");
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
const yuuki = require("./yuuki");
const eiji = require("./eiji");
const haruka = require("./haruka");
const byleth = require("./byleth");
const conner = require("./conner");

const CHARACTER_MODULES = [
  tohno,
  temari,
  kuwagata,
  eva13,
  oberon,
  takuto,
  appleguy,
  nanaya,
  satoru,
  shiki,
  doomguy,
  oguri,
  hakuno,
  miyako,
  banagher,
  riddhe,
  tepeu,
  shrade_elan,
  hikaru,
  phenex,
  kotone,
  gambler,
  broadband_man,
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
  yuuki,
  eiji,
  haruka,
  byleth,
  conner,
];

const CHAR_HOOKS = {};
for (const mod of CHARACTER_MODULES) CHAR_HOOKS[mod.id] = mod;

module.exports = CHAR_HOOKS;
