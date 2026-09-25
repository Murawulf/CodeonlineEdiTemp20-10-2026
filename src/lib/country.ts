// src/lib/country.ts
// Pays du build (npm run build -- tunisia | cote_ivoire | senegal), lu depuis
// getCurrentCountryInfo() — même source que le drapeau de la navbar.
// Accepte le code / les alias (tn, tunisie, civ, cote-ivoire, sn…), le nom du
// pays, ou à défaut le nom de fichier du drapeau (ex. ".../ci.png").
export type CountryKey = "tunisia" | "cote_ivoire" | "senegal";

const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Pays détecté, ou null si rien ne correspond.
export const detectCountryKey = (info: any): CountryKey | null => {
  const fields = [info?.code, info?.key, info?.id, info?.iso, info?.isoCode, info?.country, info?.name]
    .map(normalize)
    .filter(Boolean);
  const flagFile = normalize(String(info?.flagUrl ?? "").split("/").pop()?.split(".")[0]);

  const isCI = (s: string) => /(cote|ivoire|^civ$|^ci$|^cote_ivoire$|^cote-ivoire$)/.test(s);
  const isSN = (s: string) => /(senegal|^sn$|^sen$)/.test(s);
  const isTN = (s: string) => /(tunisi|^tn$|^tun$)/.test(s);

  for (const s of fields) {
    if (isCI(s)) return "cote_ivoire";
    if (isSN(s)) return "senegal";
    if (isTN(s)) return "tunisia";
  }
  if (flagFile) {
    if (isCI(flagFile)) return "cote_ivoire";
    if (isSN(flagFile)) return "senegal";
    if (isTN(flagFile)) return "tunisia";
  }
  return null;
};

// Pays détecté, Tunisie par défaut (pour les logos : jamais d'image vide).
export const resolveCountryKey = (info: any): CountryKey => detectCountryKey(info) ?? "tunisia";
