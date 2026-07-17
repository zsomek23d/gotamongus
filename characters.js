// GoT karakterek. A lista az anapioficeandfire.com API-ból származó adatokon alapul,
// beépítve, hogy a játék internet nélkül is fusson.
const CHARACTERS = [
  { name: 'Jon Havas',            house: 'Stark',     color: '#8a9aa8', sigil: '🐺' },
  { name: 'Daenerys Targaryen',   house: 'Targaryen', color: '#c0392b', sigil: '🐉' },
  { name: 'Tyrion Lannister',     house: 'Lannister', color: '#d4af37', sigil: '🦁' },
  { name: 'Cersei Lannister',     house: 'Lannister', color: '#d4af37', sigil: '🦁' },
  { name: 'Arya Stark',           house: 'Stark',     color: '#8a9aa8', sigil: '🐺' },
  { name: 'Sansa Stark',          house: 'Stark',     color: '#8a9aa8', sigil: '🐺' },
  { name: 'Jaime Lannister',      house: 'Lannister', color: '#d4af37', sigil: '🦁' },
  { name: 'Tarthi Brienne',       house: 'Tarth',     color: '#3b6ea5', sigil: '🌙' },
  { name: 'Petyr Baelish',        house: 'Baelish',   color: '#5e6b3a', sigil: '🐦' },
  { name: 'Varys',                house: 'A Pók',     color: '#7d6b91', sigil: '🕷️' },
  { name: 'Theon Greyjoy',        house: 'Greyjoy',   color: '#2f4f4f', sigil: '🦑' },
  { name: 'Stannis Baratheon',    house: 'Baratheon', color: '#e8a33d', sigil: '🦌' },
  { name: 'Margaery Tyrell',      house: 'Tyrell',    color: '#4e8d4e', sigil: '🌹' },
  { name: 'Olenna Tyrell',        house: 'Tyrell',    color: '#4e8d4e', sigil: '🌹' },
  { name: 'Oberyn Martell',       house: 'Martell',   color: '#c96a1b', sigil: '☀️' },
  { name: 'Sandor Clegane',       house: 'Clegane',   color: '#6b6b6b', sigil: '🐕' },
  { name: 'Davos Seaworth',       house: 'Seaworth',  color: '#37698f', sigil: '⛵' },
  { name: 'Samwell Tarly',        house: 'Tarly',     color: '#7a8450', sigil: '🏹' },
  { name: 'Melisandre',           house: 'Asshai',    color: '#a01818', sigil: '🔥' },
  { name: 'Ramsay Bolton',        house: 'Bolton',    color: '#7c2d3c', sigil: '⚔️' }
];

const CRISES = [
  { title: 'A Mások serege átkelt a Falon!', desc: 'Északi hollók jelentik: a holtak menetelnek. A Tanácsnak sereget kell küldenie.' },
  { title: 'Éhínség Királyvárban', desc: 'Üres a magtár, a nép zúgolódni kezd. Gabonát kell szerezni Essosból.' },
  { title: 'Lázadás készül a Vas-szigeteken', desc: 'A Greyjoy flotta a partok felé tart. Meg kell erősíteni a kikötőket.' },
  { title: 'A Vasbank behajtja az adósságot', desc: 'Braavos nem vár tovább. Aranyat kell előkeríteni, különben zsoldosokat küldenek.' },
  { title: 'Sárkánytűz a Feketevízen', desc: 'Egy elszabadult sárkány falvakat perzsel. Vadászokat kell felfogadni.' },
  { title: 'Pestis a Bolhavégben', desc: 'Terjed a szürkehély. A mestereknek gyógyszer kell, különben a város elesik.' },
  { title: 'A hegyi törzsek fosztogatnak', desc: 'A Völgy karavánjait kifosztják. Kíséretet kell szervezni.' },
  { title: 'Összeesküvés a Hit Harcosai közt', desc: 'A Fő Veréb túl nagy hatalomra tett szert. Le kell csillapítani a vallási feszültséget.' },
  { title: 'Tél közeleg: befagyott a Királyi út', desc: 'Az ellátmány nem jut el Északra. Jégtörő expedíciót kell indítani.' },
  { title: 'Merénylet a Kéz Tornyában', desc: 'A Király Keze megmérgezve fekszik. Nyomozást és védelmet kell finanszírozni.' }
];

const BOT_NAMES = ['Maester Aemon', 'Bronn', 'Podrick', 'Gendry', 'Missandei', 'Szürke Féreg', 'Tormund', 'Yara', 'Hodor', 'Jorah'];

module.exports = { CHARACTERS, CRISES, BOT_NAMES };
