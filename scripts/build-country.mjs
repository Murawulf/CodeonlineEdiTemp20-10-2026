import { spawnSync } from "node:child_process";
import process from "node:process";

const rawArgument = process.argv.slice(2).find((argument) => argument && !argument.startsWith("--country="));
const countryArgument = process.argv.find((argument) => argument.startsWith("--country="))?.split("=")[1] ?? rawArgument;
const aliases = {
  tunisia: "tunisia",
  tunisie: "tunisia",
  tn: "tunisia",
  senegal: "senegal",
  sn: "senegal",
  cote_ivoire: "cote_ivoire",
  "cote-ivoire": "cote_ivoire",
  "cote d'ivoire": "cote_ivoire",
  "côte d'ivoire": "cote_ivoire",
  civ: "cote_ivoire",
};

const country = aliases[String(countryArgument ?? "").trim().toLowerCase()];
if (!country) {
  console.error("Usage: npm run build -- <tunisia|senegal|cote_ivoire>");
  process.exit(1);
}

console.log(`Building frontend for country: ${country}`);
const result = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_BUILD_COUNTRY: country },
  }
);

process.exit(result.status ?? 1);
