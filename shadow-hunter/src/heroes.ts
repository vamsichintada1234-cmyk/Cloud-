/** Playable characters sold in the shop. Stats are multipliers on the base ninja unless noted. */
export interface Hero {
  id: string;
  name: string;
  price: number;
  blurb: string;
  /** Movement speed in px/s. */
  speed: number;
  maxHp: number;
  /** How close you must get to take a guard out, in px. */
  killRange: number;
  /** Multiplier on how far guards can spot you (lower is sneakier). */
  stealth: number;
  look: {
    body: number;
    legs: number;
    head: number;
    band: number;
    blade: number;
    scale: number;
    /** Below 1 makes the whole model see-through. */
    opacity: number;
  };
}

export const HEROES: Hero[] = [
  {
    id: "shadow",
    name: "Shadow",
    price: 0,
    blurb: "The original. Balanced and quiet.",
    speed: 165,
    maxHp: 100,
    killRange: 29,
    stealth: 1,
    look: { body: 0x22252e, legs: 0x16181e, head: 0x15161b, band: 0xd42a3c, blade: 0xe6ecf5, scale: 1, opacity: 1 },
  },
  {
    id: "swift",
    name: "Swift",
    price: 150,
    blurb: "25% faster on its feet, but fragile.",
    speed: 206,
    maxHp: 75,
    killRange: 29,
    stealth: 1,
    look: { body: 0x1f4f8f, legs: 0x15233d, head: 0x13213a, band: 0x4fd1ff, blade: 0xd8f6ff, scale: 0.92, opacity: 1 },
  },
  {
    id: "brute",
    name: "Brute",
    price: 400,
    blurb: "Shrugs off bullets. A little slower.",
    speed: 148,
    maxHp: 175,
    killRange: 31,
    stealth: 1,
    look: { body: 0x5a3a22, legs: 0x2b1d12, head: 0x3a2618, band: 0xf0a030, blade: 0xb9bcc4, scale: 1.18, opacity: 1 },
  },
  {
    id: "ghost",
    name: "Ghost",
    price: 800,
    blurb: "Guards only spot you from 70% as far away.",
    speed: 170,
    maxHp: 90,
    killRange: 29,
    stealth: 0.7,
    look: { body: 0xcfd8ff, legs: 0x8f97c4, head: 0xe9edff, band: 0x9f6bff, blade: 0xf3f0ff, scale: 1, opacity: 0.6 },
  },
  {
    id: "ronin",
    name: "Ronin",
    price: 1500,
    blurb: "Tough and long-reaching blade.",
    speed: 172,
    maxHp: 140,
    killRange: 40,
    stealth: 0.9,
    look: { body: 0x2a1418, legs: 0x170b0d, head: 0x1a0d10, band: 0xf2c14e, blade: 0xfff2c0, scale: 1.06, opacity: 1 },
  },
];

export const DEFAULT_HERO = HEROES[0];

export function heroById(id: string | null): Hero {
  return HEROES.find((h) => h.id === id) ?? DEFAULT_HERO;
}

// For the shop's stat bars: each stat scaled against the best in the roster.
const maxOf = (f: (h: Hero) => number) => Math.max(...HEROES.map(f));
export function heroBars(h: Hero): { label: string; value: number }[] {
  return [
    { label: "Speed", value: h.speed / maxOf((x) => x.speed) },
    { label: "Health", value: h.maxHp / maxOf((x) => x.maxHp) },
    { label: "Stealth", value: (1 / h.stealth) / maxOf((x) => 1 / x.stealth) },
    { label: "Reach", value: h.killRange / maxOf((x) => x.killRange) },
  ];
}
