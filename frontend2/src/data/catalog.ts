export const shirtTypes = [
  { id: "male", label: "Pánské", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { id: "female", label: "Dámské", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  {
    id: "children",
    label: "Dětské",
    sizes: ["98/104", "110/116", "122/128", "134/140", "146/152"],
  },
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
// Static seasonal gallery only, not a product catalog or a source for orders.
const photos: [string, string, string, string, number][] = [
  ["1260", "Bohunka box", "bohunka-box", "png", 2],
  ["1261", "Marx & Spencer", "marx-spencer", "png", 3],
  ["1222", "Tančící Bukáček", "tancici-bukacek", "jpg", 3],
  ["1224", "Dvoubarevná Betynka", "dvoubarevna-betynka", "jpg", 3],
  ["1218", "Služka", "sluzka", "jpg", 2],
  ["1213", "Another week", "another-week", "jpg", 2],
  ["1257", "Nemůžeš mě tisknout", "nemuzes-me-tisknout", "jpg", 3],
  ["1253", "Štěstí si nekoupíš", "stesti-si-nekoupis", "jpg", 2],
];
export const seasonalProducts = photos.map(([id, name, file, ext, count]) => ({
  id: `trikonos-${id}`,
  name,
  images: Array.from({ length: count }, (_, i) => ({
    src: `/assets/products-trikonos/${file}-${i + 1}.${ext}`,
    label: `Náhled ${i + 1}`,
  })),
}));
export const designs = [
  "exec-b0dc95ca-7a61-4dc0-a834-047e90b497fe.png",
  "exec-ff03d2c4-003b-4d42-b991-7f3ec1a15006.png",
  "exec-2e94d129-f556-40db-9c33-daf742a8508a.png",
  "exec-0e333bb4-82c9-488e-9988-79341364877b.png",
  "exec-294f0fca-e649-4bd8-aa80-1924fdbcd222.png",
].map((file, i) => ({ src: `/assets/designs/${file}`, name: `Motiv ${i + 1}` }));

export const money = (amount: number) => `${amount.toLocaleString("cs-CZ")} Kč`;
