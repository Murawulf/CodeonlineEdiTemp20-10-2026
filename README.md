# Codeonline EDI 
 
## Installation 
 
Apr�s avoir clon� le projet, supprimez le dossier node_modules s'il existe puis r�installez les d�pendances. 
 
### Windows 
npm install 
 
### Linux / macOS 
rm -rf node_modules 
npm install 
 
## Lancer le projet 
npm run dev 

## Construire le frontend par pays

Le pays doit etre indique au moment du build frontend. Ce choix determine le drapeau affiche dans la navbar et le logo associe. Il ne depend pas du backend.

### Tunisie
npm run build -- tunisia

### Senegal
npm run build -- senegal

### Cote d'Ivoire
npm run build -- cote_ivoire

Le build accepte aussi les alias `tn`, `sn`, `civ`, `tunisie` et `cote-ivoire`.
 
## Important 
- Ne pas envoyer les fichiers .env 
- V�rifiez que Node.js est install� 
- Version recommand�e de Node.js : 18+ 
