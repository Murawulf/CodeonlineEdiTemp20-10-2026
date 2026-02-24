import os
import re
import json
from pathlib import Path

# 📂 dossier des pages
PAGES_DIR = Path("pages")

# 📂 fichier de sortie
OUTPUT_FILE = Path("src/translations.tsx")

# Regex pour capturer des chaînes "hardcodées" dans JSX
STRING_REGEX = re.compile(r'>([^<>{}0-9][^<>{}]*)<|"(.*?)"|\'(.*?)\'')

translations = {
    "fr": {},
    "en": {},
    "ar": {}
}

def extract_strings_from_file(filepath):
    found = set()
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

        for match in STRING_REGEX.findall(content):
            # Le regex donne 3 groupes possibles
            text = next((m for m in match if m.strip()), None)
            if not text:
                continue
            text = text.strip()
            # filtre : ignorer les trop courts ou variables
            if len(text) < 2 or text.startswith("{") or text.endswith("}"):
                continue
            found.add(text)
    return found

def translate_dummy(text, lang):
    """⚠️ Dummy translate function
       Ici tu peux brancher DeepL API, Google Translate API
       Pour le moment juste retourne le texte identique.
    """
    if lang == "fr":
        return text  # Texte d'origine considéré FR
    elif lang == "en":
        return text  # TODO: mettre vraie traduction
    elif lang == "ar":
        return text  # TODO: mettre vraie traduction
    return text

def main():
    all_strings = set()
    for root, _, files in os.walk(PAGES_DIR):
        for file in files:
            if file.endswith(".tsx") or file.endswith(".ts") or file.endswith(".jsx") or file.endswith(".js"):
                path = Path(root) / file
                found = extract_strings_from_file(path)
                all_strings.update(found)

    print(f"✅ {len(all_strings)} chaînes trouvées dans pages/")

    for text in sorted(all_strings):
        for lang in translations.keys():
            translations[lang][text] = translate_dummy(text, lang)

    # Générer le fichier TSX
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("export const translations = ")
        json.dump(translations, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"✅ Fichier généré : {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
