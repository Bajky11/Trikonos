export interface ProductImage {
  src?: string;
  x?: number;
  y?: number;
  zoom?: number;
  label: string;
}
export interface Product {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  category: string | null;
  top: boolean;
  imported: boolean;
  images: ProductImage[];
}
export const filters = [
  ["all", "Všechna trička"],
  ["top", "Top"],
  ["bitcoin", "Bitcoin"],
  ["parova", "Párová"],
  ["retro", "Retro"],
  ["moudra", "Moudrá"],
  ["sportovni", "Sportovní"],
  ["narozeninova", "Narozeninová"],
  ["filmova", "Filmová"],
  ["auto-moto", "Auto-moto"],
  ["sprosta", "Sprostá"],
  ["damska", "Dámská"],
  ["detska", "Dětská"],
  ["merch", "Merch"],
] as const;
export const shirtTypes = [
  { id: "male", label: "Pánské", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { id: "female", label: "Dámské", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  {
    id: "children",
    label: "Dětské",
    sizes: ["98/104", "110/116", "122/128", "134/140", "146/152"],
  },
];
export const shirtColors = [
  { name: "Bílá", hex: "#ffffff" },
  { name: "Černá", hex: "#252b28" },
  { name: "Přírodní bílá", hex: "#e8dfca" },
  { name: "Tmavě zelená", hex: "#244c3e" },
  { name: "Modrá", hex: "#416681" },
  { name: "Rezavá", hex: "#ad593e" },
];
export const customColors = [
  { name: "Bílá", hex: "#ffffff" },
  { name: "Černá", hex: "#252b28" },
  { name: "Lesní zelená", hex: "#0e584d" },
  { name: "Modrá", hex: "#246a9b" },
  { name: "Červená", hex: "#c64d48" },
  { name: "Písková", hex: "#dec69d" },
  { name: "Šedá", hex: "#89928c" },
  { name: "Námořnická", hex: "#1e304f" },
  { name: "Vínová", hex: "#7c3446" },
  { name: "Růžová", hex: "#df9db3" },
  { name: "Hořčicová", hex: "#dfb744" },
  { name: "Terakota", hex: "#ba6942" },
];
const imports: [string, string, string, number, string, string, number][] = [
  ["1260", "Bohunka box", "vrátila se silnější", 428, "bohunka-box", "png", 2],
  ["1261", "Marx & Spencer", "Kdo by neznal známou dvojku…", 431, "marx-spencer", "png", 3],
  ["1222", "Tančící Bukáček", "z Buků", 428, "tancici-bukacek", "jpg", 3],
  ["1224", "Dvoubarevná Betynka", "z Buků", 447, "dvoubarevna-betynka", "jpg", 3],
  ["1218", "Služka", "budu sloužit dětem", 454, "sluzka", "jpg", 2],
  ["1213", "Another week", "being famous", 459, "another-week", "jpg", 2],
  ["1257", "Nemůžeš mě tisknout", "heč!", 477, "nemuzes-me-tisknout", "jpg", 3],
  [
    "1253",
    "Štěstí si nekoupíš",
    "ale můžeš si koupit bitcoin",
    462,
    "stesti-si-nekoupis",
    "jpg",
    2,
  ],
];
export const importedProducts: Product[] = imports.map(
  ([id, name, subtitle, price, file, ext, count]) => ({
    id: `trikonos-${id}`,
    name,
    subtitle,
    price,
    category: null,
    top: false,
    imported: true,
    images: Array.from({ length: count }, (_, i) => ({
      src: `/assets/products-trikonos/${file}-${i + 1}.${ext}`,
      label: `Náhled ${i + 1}`,
    })),
  }),
);
const categories: [string, string, string[]][] = [
  [
    "bitcoin",
    "…tričko pro bitcoinovou partu",
    ["Hodl klub", "Digitální zlato", "Blok za blokem", "Satoshi tým"],
  ],
  [
    "parova",
    "…párové tričko",
    ["Spolu na cestě", "Moje druhá půlka", "Lepší ve dvou", "Dokonalá dvojka"],
  ],
  [
    "retro",
    "…tričko s retro náladou",
    ["Zpátky do osmdesátek", "Kazetový klub", "Analogová duše", "Staré dobré časy"],
  ],
  [
    "moudra",
    "…tričko s myšlenkou",
    ["Všechno má čas", "Méně je více", "Klid v duši", "Dnes je ten den"],
  ],
  [
    "sportovni",
    "…tričko pro aktivní dny",
    ["Ještě jeden kilometr", "Na vrchol", "Běžecká duše", "Síla v pohybu"],
  ],
  [
    "narozeninova",
    "…narozeninové tričko",
    ["Limitovaná edice", "Legenda slaví", "Nejlepší ročník", "Věk je jen číslo"],
  ],
  [
    "filmova",
    "…tričko pro filmové fanoušky",
    ["Ještě jeden záběr", "Filmový večer", "Hlavní role", "Po titulcích"],
  ],
  [
    "auto-moto",
    "…tričko pro milovníky motorů",
    ["Na plný plyn", "Dvě kola stačí", "Garážový klub", "Cesta je cíl"],
  ],
  [
    "sprosta",
    "…tričko bez servítek",
    ["Dnes mě neštvi", "Mám to na háku", "Sakra dobrý den", "Bez filtru"],
  ],
  ["damska", "…dámské tričko", ["Sama sebou", "Divoká a svobodná", "Káva a klid", "Moje tempo"]],
  [
    "detska",
    "…tričko pro malé dobrodruhy",
    ["Malý dobrodruh", "Lesní průzkumník", "Parta z hřiště", "Velké malé sny"],
  ],
  [
    "merch",
    "…tričko z horské party",
    ["Trikonoš klub", "Z hor na každý den", "Horská parta", "Základní tábor"],
  ],
];
export const products: Product[] = [
  ...importedProducts,
  ...categories.flatMap(([category, subtitle, names], categoryIndex) =>
    Array.from({ length: 16 }, (_, index) => {
      const image = (categoryIndex + index) % 6;
      return {
        id: `${category}-${index + 1}`,
        name: `${names[index % 4]}${index >= 4 ? ` / ${Math.floor(index / 4) + 1}` : ""}`,
        subtitle,
        price: [590, 649, 690, 749, 790][index % 5]!,
        category,
        top: index < 4,
        imported: false,
        images: [1, 1.3, 1.65].map((zoom, i) => ({
          x: (image % 3) * 50,
          y: image >= 3 ? 100 : 0,
          zoom,
          label: ["Celý náhled", "Detail ilustrace", "Přiblížení ilustrace"][i]!,
        })),
      };
    }),
  ),
];
export const designs = [
  "exec-b0dc95ca-7a61-4dc0-a834-047e90b497fe.png",
  "exec-ff03d2c4-003b-4d42-b991-7f3ec1a15006.png",
  "exec-2e94d129-f556-40db-9c33-daf742a8508a.png",
  "exec-0e333bb4-82c9-488e-9988-79341364877b.png",
  "exec-294f0fca-e649-4bd8-aa80-1924fdbcd222.png",
].map((file, i) => ({ src: `/assets/designs/${file}`, name: `Motiv ${i + 1}` }));

export const money = (amount: number) => `${amount.toLocaleString("cs-CZ")} Kč`;
export const filterProducts = (filter: string) =>
  products.filter(
    (product) => filter === "all" || (filter === "top" ? product.top : product.category === filter),
  );
export function stripProducts(filter: string): Product[] {
  const visible = filterProducts(filter);
  const selection = visible.filter((product) => product.imported).slice(0, 8);
  const demos = visible.filter((product) => !product.imported);
  const remaining = Math.min(8 - selection.length, demos.length);
  return [
    ...selection,
    ...Array.from(
      { length: remaining },
      (_, i) => demos[Math.floor((i * demos.length) / remaining)]!,
    ),
  ];
}
