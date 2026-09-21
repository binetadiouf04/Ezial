export interface CountryDialCode {
  name: string;
  iso2: string;
  dialCode: string;
}

// Common flag emoji trick: each ISO-3166 alpha-2 letter maps to a Unicode
// regional indicator symbol (base 0x1F1E6 = 'A').
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

// Sénégal first (the app's default market), then West Africa, then the rest
// — alphabetical within each group. Not exhaustive, but covers every
// country an Ezial customer or seller is realistically dialing from/to.
export const countryDialCodes: CountryDialCode[] = [
  { name: 'Sénégal', iso2: 'SN', dialCode: '221' },
  { name: 'Mali', iso2: 'ML', dialCode: '223' },
  { name: 'Mauritanie', iso2: 'MR', dialCode: '222' },
  { name: 'Gambie', iso2: 'GM', dialCode: '220' },
  { name: 'Guinée', iso2: 'GN', dialCode: '224' },
  { name: 'Guinée-Bissau', iso2: 'GW', dialCode: '245' },
  { name: 'Côte d\'Ivoire', iso2: 'CI', dialCode: '225' },
  { name: 'Burkina Faso', iso2: 'BF', dialCode: '226' },
  { name: 'Niger', iso2: 'NE', dialCode: '227' },
  { name: 'Togo', iso2: 'TG', dialCode: '228' },
  { name: 'Bénin', iso2: 'BJ', dialCode: '229' },
  { name: 'Ghana', iso2: 'GH', dialCode: '233' },
  { name: 'Nigéria', iso2: 'NG', dialCode: '234' },
  { name: 'Cap-Vert', iso2: 'CV', dialCode: '238' },
  { name: 'Cameroun', iso2: 'CM', dialCode: '237' },
  { name: 'Gabon', iso2: 'GA', dialCode: '241' },
  { name: 'Congo-Kinshasa (RDC)', iso2: 'CD', dialCode: '243' },
  { name: 'Congo-Brazzaville', iso2: 'CG', dialCode: '242' },
  { name: 'Tchad', iso2: 'TD', dialCode: '235' },
  { name: 'Maroc', iso2: 'MA', dialCode: '212' },
  { name: 'Algérie', iso2: 'DZ', dialCode: '213' },
  { name: 'Tunisie', iso2: 'TN', dialCode: '216' },
  { name: 'Égypte', iso2: 'EG', dialCode: '20' },
  { name: 'Afrique du Sud', iso2: 'ZA', dialCode: '27' },
  { name: 'France', iso2: 'FR', dialCode: '33' },
  { name: 'Belgique', iso2: 'BE', dialCode: '32' },
  { name: 'Suisse', iso2: 'CH', dialCode: '41' },
  { name: 'Italie', iso2: 'IT', dialCode: '39' },
  { name: 'Espagne', iso2: 'ES', dialCode: '34' },
  { name: 'Portugal', iso2: 'PT', dialCode: '351' },
  { name: 'Allemagne', iso2: 'DE', dialCode: '49' },
  { name: 'Royaume-Uni', iso2: 'GB', dialCode: '44' },
  { name: 'États-Unis / Canada', iso2: 'US', dialCode: '1' },
  { name: 'Émirats arabes unis', iso2: 'AE', dialCode: '971' },
  { name: 'Arabie saoudite', iso2: 'SA', dialCode: '966' },
  { name: 'Chine', iso2: 'CN', dialCode: '86' },
  { name: 'Inde', iso2: 'IN', dialCode: '91' },
  { name: 'Brésil', iso2: 'BR', dialCode: '55' },
];

export const DEFAULT_COUNTRY = countryDialCodes[0]; // Sénégal, +221
