// ============================================================
// ChatbotWidget.tsx  —  v4.0
// Drop-in floating chatbot for your EDI React app.
// Built from real page source code — every step is accurate.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from "react";

type Lang = "fr" | "en";

interface Permission {
  page_id: number;
  read: number;
  write: number;
  hide: number;
}
interface StoredUser {
  id_compte: number;
  profile_id: number;
  permissions: Permission[];
}
interface Message {
  role: "bot" | "user";
  text: string;
}

const LS_CONVO_KEY = "edi_chat_messages";
const LS_LANG_KEY  = "edi_chat_lang";
const SS_ALIVE_KEY = "edi_chat_session";
const PUBLIC_PAGES = [17];

const PAGES: Record<number, {
  name_fr: string; name_en: string;
  route: string;
  desc_fr: string; desc_en: string;
}> = {
  1:  { name_fr:"Tableau de bord",     name_en:"Dashboard",           route:"/",                       desc_fr:"Vue d'ensemble de vos statistiques et données principales.",                                                                                                    desc_en:"Overview of your main statistics and data." },
  2:  { name_fr:"Entités",             name_en:"Entities",            route:"/entite",                 desc_fr:"Gérez vos partenaires commerciaux, sociétés et contacts.",                                                                                                    desc_en:"Manage your commercial partners, companies and contacts." },
  3:  { name_fr:"Produits",            name_en:"Products",            route:"/produit",                desc_fr:"Mappings NMC, rayons et briques GPC pour vos produits. Ce n'est pas ici qu'on crée des fiches produits (voir Catalogue Complet).",                             desc_en:"NMC mappings, aisles and GPC bricks for your products. Product sheets are created in Full Catalog, not here." },
  4:  { name_fr:"Caractéristiques",    name_en:"Characteristics",     route:"/caracteristiques",       desc_fr:"Définissez et gérez les éléments techniques de vos produits.",                                                                                                desc_en:"Define and manage the technical elements of your products." },
  5:  { name_fr:"Opérations",          name_en:"Operations",          route:"/operations",             desc_fr:"Suivez vos appels d'offres (Phase 3 — en développement).",                                                                                                    desc_en:"Track your tenders (Phase 3 – under development)." },
  6:  { name_fr:"Commandes EDI",       name_en:"EDI Orders",          route:"/operation-edi/order",    desc_fr:"Créez et gérez vos commandes EDI avec multi-devises et multi-serveurs.",                                                                                      desc_en:"Create and manage EDI orders with multi-currency and multi-server support." },
  7:  { name_fr:"Factures EDI",        name_en:"EDI Invoices",        route:"/operation-edi/invoice",  desc_fr:"Consultez et gérez vos factures EDI.",                                                                                                                        desc_en:"View and manage your EDI invoices." },
  8:  { name_fr:"Tracking",            name_en:"Tracking",            route:"/operation-edi/tracking", desc_fr:"Suivez le statut de vos expéditions en temps réel.",                                                                                                          desc_en:"Track your shipments in real time." },
  9:  { name_fr:"Ordre de transport",  name_en:"Transport Order",     route:"/ordre-de-transport",     desc_fr:"Gérez les ordres de transport auprès de vos transporteurs (Phase 2).",                                                                                        desc_en:"Manage transport orders with your carriers (Phase 2)." },
  10: { name_fr:"Trafic",              name_en:"Traffic",             route:"/trafic",                 desc_fr:"Suivi du trafic EDI (Phase 2 — en développement).",                                                                                                           desc_en:"EDI traffic tracking (Phase 2 – under development)." },
  11: { name_fr:"Catalogue FP",        name_en:"FP Catalog",          route:"/catalogue",              desc_fr:"Catalogue fournisseur/producteur avec gestion des déclinaisons et briques.",                                                                                  desc_en:"Supplier/producer catalog with variant and brick management." },
  12: { name_fr:"Catalogue Complet",   name_en:"Full Catalog",        route:"/catalogueComplet",       desc_fr:"Importez des fiches produits en masse via des modèles basés sur les briques GPC.",                                                                             desc_en:"Mass-import product sheets via GPC brick-based templates." },
  13: { name_fr:"GPC",                 name_en:"GPC",                 route:"/gpc",                    desc_fr:"Gérez les codes GPC, rayons et modèles de données produits.",                                                                                                 desc_en:"Manage GPC codes, aisles and product data models." },
  14: { name_fr:"Générateur Modèle",   name_en:"Model Generator",     route:"/generateur-modele",      desc_fr:"Créez des modèles de fiches produits par brique GPC. Ces modèles servent à l'import dans Catalogue Complet.",                                                 desc_en:"Create product sheet templates per GPC brick. Used for import in Full Catalog." },
  15: { name_fr:"Vue Modèles",         name_en:"Model View",          route:"/vue-modeles",            desc_fr:"Visualisez et gérez vos modèles de fiches EDI enregistrés.",                                                                                                  desc_en:"View and manage your saved EDI file models." },
  16: { name_fr:"Flash Notifications", name_en:"Flash Notifications", route:"/flash",                  desc_fr:"Créez et diffusez des notifications flash multilingues vers les entités.",                                                                                    desc_en:"Create and broadcast multilingual flash notifications to entities." },
  17: { name_fr:"Tarification",        name_en:"Pricing",             route:"/tarification",           desc_fr:"Consultez les plans et tarifs disponibles (page publique, sans connexion).",                                                                                  desc_en:"View available plans and pricing (public page, no login required)." },
  18: { name_fr:"Profils",             name_en:"Profiles",            route:"/parametres/profils",     desc_fr:"Gérez les profils utilisateurs et leurs permissions par page.",                                                                                               desc_en:"Manage user profiles and their per-page permissions." },
  19: { name_fr:"Comptes",             name_en:"Accounts",            route:"/parametres/comptes",     desc_fr:"Gérez les comptes utilisateurs, rôles, certicodes et suspensions.",                                                                                           desc_en:"Manage user accounts, roles, certicodes and suspensions." },
  21: { name_fr:"GED",                 name_en:"Document Management", route:"/ged",                    desc_fr:"Gérez vos documents : upload, dossiers, aperçu, suppression et journal d'audit.",                                                                             desc_en:"Manage documents: upload, folders, preview, deletion and audit log." },
  22: { name_fr:"Mon Profil",          name_en:"My Profile",          route:"/EditProfile",            desc_fr:"Modifiez votre nom, email, mot de passe et avatar personnel.",                                                                                                desc_en:"Edit your name, email, password and personal avatar." },
};

const PAGE_KEYWORDS: Record<number, string[]> = {
  1:  ["tableau","dashboard","accueil","home","statistique","stat","index"],
  2:  ["entite","entites","entité","entités","compan","entreprise","societe","partner","contact","partenaire"],
  3:  ["nmc","rayon","mapping","produit page"],
  4:  ["caracteristique","characteristic","technique","element"],
  5:  ["operation","appel","offre","tender","phase 3"],
  6:  ["commande","order","achat","devise","currency"],
  7:  ["facture","invoice","billing","facturation"],
  8:  ["track","suivi","expedition","shipment","livraison","colis"],
  9:  ["transport","carrier","vehicule","chauffeur","driver","phase 2"],
  10: ["trafic","traffic","flux"],
  11: ["catalogue fp","fp catalog","fournisseur","producteur","declinaison"],
  12: ["catalogue complet","full catalog","fiche produit","fiches produits","mass upload","importer produit","import produit"],
  13: ["gpc","global product","classification","code gpc"],
  14: ["generateur","generator","modele edi","model generator","creer modele"],
  15: ["vue modele","model view","fichier edi","modeles enregistres"],
  16: ["flash","notif","broadcast","diffus","notification"],
  17: ["tarif","pricing","plan","abonnement","prix"],
  18: ["profil","profile","permission","role","droit"],
  19: ["compte","account","utilisateur","user","certicode"],
  21: ["ged","document","upload","dossier","fichier","folder","audit","media"],
  22: ["mon profil","my profile","mot de passe","password","avatar","edit profile"],
};

// ─── How-To guides (sourced from actual page code) ────────────
interface HowTo { triggers: string[]; fr: string; en: string; }

const HOW_TOS: HowTo[] = [
  // ── ADD ENTITY ──
  {
    triggers: [
      "ajouter entite","ajouter une entite","creer entite","creer une entite",
      "nouvelle entite","add entity","create entity","new entity","add an entity",
      "comment ajouter entite","comment ajouter une entite","how to add entity",
      "how do i add","ajouter un partenaire","creer un partenaire"
    ],
    fr: `<strong>Comment ajouter une entité</strong><br><br>
1️⃣ Allez sur <a href="/entite">Entités</a><br>
2️⃣ En haut à droite, cliquez le bouton <strong>« Actions »</strong> (bleu foncé, avec une flèche ▼)<br>
3️⃣ Dans le menu déroulant, choisissez <strong>« Ajouter entité »</strong><br>
4️⃣ Un formulaire <em>« Nouvelle entité — informations de base »</em> s'ouvre. Remplissez :<br>
&nbsp;&nbsp;• <strong>Raison sociale</strong> — obligatoire<br>
&nbsp;&nbsp;• <strong>Identifiant national</strong> — obligatoire<br>
&nbsp;&nbsp;• <strong>Personne de contact</strong> — obligatoire<br>
&nbsp;&nbsp;• <strong>Type d'opérateur</strong> — obligatoire (ex : Entreprise privée produits & services)<br>
&nbsp;&nbsp;• Email, téléphone, mobile, adresse, région… — facultatifs<br>
5️⃣ Cliquez <strong>Enregistrer</strong>. L'entité est créée et apparaît dans la liste.<br>
6️⃣ Cliquez sur la ligne pour l'ouvrir et compléter les infos étendues : segments, sites GLN, logo, titres multilingues (FR / AR / EN).<br><br>
💡 <em>Besoin d'importer plusieurs entités à la fois ? Utilisez <strong>« Ajouter plusieurs »</strong> dans le même menu Actions.</em><br>
⚠️ Accès <strong>lecture + écriture</strong> requis sur la page Entités.`,

    en: `<strong>How to add an entity</strong><br><br>
1️⃣ Go to <a href="/entite">Entities</a><br>
2️⃣ In the top-right, click the <strong>"Actions"</strong> button (dark blue, with a ▼ arrow)<br>
3️⃣ In the dropdown, choose <strong>"Ajouter entité"</strong> (Add entity)<br>
4️⃣ A form <em>"New entity — basic information"</em> opens. Fill in:<br>
&nbsp;&nbsp;• <strong>Company name</strong> (Raison sociale) — required<br>
&nbsp;&nbsp;• <strong>National identifier</strong> — required<br>
&nbsp;&nbsp;• <strong>Contact person</strong> — required<br>
&nbsp;&nbsp;• <strong>Operator type</strong> — required (e.g. Private company – products & services)<br>
&nbsp;&nbsp;• Email, phone, mobile, address, region… — optional<br>
5️⃣ Click <strong>Enregistrer (Save)</strong>. The entity is created and appears in the list.<br>
6️⃣ Click the row to open it and fill in extended info: segments, GLN sites, logo, multilingual titles (FR / AR / EN).<br><br>
💡 <em>Need to import many entities at once? Use <strong>"Ajouter plusieurs"</strong> in the same Actions menu.</em><br>
⚠️ <strong>Read + write</strong> access required on the Entities page.`,
  },

  // ── EDIT ENTITY ──
  {
    triggers: [
      "modifier entite","editer entite","modifier une entite","edit entity",
      "update entity","changer entite","mettre a jour entite"
    ],
    fr: `<strong>Comment modifier une entité</strong><br><br>
1️⃣ Allez sur <a href="/entite">Entités</a><br>
2️⃣ Utilisez la barre de recherche ou les filtres (Région, Délégation, Segment, Type) pour trouver l'entité<br>
3️⃣ Cliquez sur la ligne de l'entité pour l'expandre, ou cliquez sur le menu <strong>⋮ Actions</strong> à droite de la ligne<br>
4️⃣ Choisissez <strong>« Modifier »</strong> pour éditer les informations de base<br>
5️⃣ Modifiez les champs souhaités, puis cliquez <strong>Enregistrer</strong><br><br>
💡 <em>Depuis la ligne expandée, vous pouvez aussi modifier les sites GLN, le logo et les titres multilingues directement.</em>`,

    en: `<strong>How to edit an entity</strong><br><br>
1️⃣ Go to <a href="/entite">Entities</a><br>
2️⃣ Use the search bar or filters (Region, Delegation, Segment, Type) to find the entity<br>
3️⃣ Click the entity's row to expand it, or click the <strong>⋮ Actions</strong> menu on the right<br>
4️⃣ Choose <strong>"Modifier"</strong> to edit basic information<br>
5️⃣ Change the fields you need, then click <strong>Enregistrer (Save)</strong><br><br>
💡 <em>From the expanded row you can also edit GLN sites, logo and multilingual titles directly.</em>`,
  },

  // ── EXPORT ENTITIES / EXCEL ──
  {
    triggers: [
      "exporter entite","exporter excel","export excel","telecharger excel",
      "download excel","export xlsx","exporter liste","telecharger liste"
    ],
    fr: `<strong>Comment exporter les entités vers Excel</strong><br><br>
1️⃣ Allez sur <a href="/entite">Entités</a><br>
2️⃣ Appliquez les filtres souhaités si vous ne voulez exporter qu'une sélection<br>
3️⃣ Cliquez le bouton <strong>« Actions »</strong> en haut à droite<br>
4️⃣ Choisissez <strong>« Exporter »</strong><br>
5️⃣ Un fichier <code>entites_export.xlsx</code> se télécharge automatiquement dans votre navigateur<br><br>
💡 <em>L'export contient toutes les entités visibles après filtrage.</em>`,

    en: `<strong>How to export entities to Excel</strong><br><br>
1️⃣ Go to <a href="/entite">Entities</a><br>
2️⃣ Apply any filters if you only want a subset<br>
3️⃣ Click the <strong>"Actions"</strong> button in the top-right<br>
4️⃣ Choose <strong>"Exporter"</strong><br>
5️⃣ A file <code>entites_export.xlsx</code> downloads automatically in your browser<br><br>
💡 <em>The export contains all entities visible after filtering.</em>`,
  },

  // ── CREATE ORDER ──
  {
    triggers: [
      "creer commande","nouvelle commande","passer commande","create order",
      "new order","how to order","creer une commande","ajouter commande","how do i create an order"
    ],
    fr: `<strong>Comment créer une commande EDI</strong><br><br>
1️⃣ Allez sur <a href="/operation-edi/order">Commandes EDI</a><br>
2️⃣ Cliquez le menu <strong>« Actions »</strong> (en haut) → <strong>« Ajouter »</strong><br>
3️⃣ Le formulaire de commande s'ouvre avec plusieurs sections dépliables :<br>
&nbsp;&nbsp;• <strong>Numéro de commande</strong> : saisissez un préfixe (ex: CMD), un suffixe, ou cliquez <em>« Générer automatiquement »</em><br>
&nbsp;&nbsp;• <strong>Serveur</strong> : choisissez Tunisie, Sénégal ou Tous<br>
&nbsp;&nbsp;• <strong>Fournisseur</strong> : sélectionnez le partenaire destinataire<br>
&nbsp;&nbsp;• <strong>Dates de livraison</strong> : date demandée, au plus tôt, au plus tard<br>
&nbsp;&nbsp;• <strong>Monnaie</strong> : TND, EUR, USD ou XOF<br>
&nbsp;&nbsp;• <strong>Articles</strong> : ajoutez les lignes produits avec quantités<br>
4️⃣ Le bouton <strong>« Envoyer la Commande »</strong> (bleu foncé, en bas) s'active quand tous les champs requis sont remplis (N° commande + fournisseur + au moins 1 article)<br>
5️⃣ Cliquez <strong>« Envoyer la Commande »</strong> pour transmettre<br><br>
⚠️ Si le bouton reste grisé, vérifiez que le numéro de commande, le fournisseur et au moins un article sont renseignés.`,

    en: `<strong>How to create an EDI order</strong><br><br>
1️⃣ Go to <a href="/operation-edi/order">EDI Orders</a><br>
2️⃣ Click the <strong>"Actions"</strong> menu (top) → <strong>"Ajouter"</strong><br>
3️⃣ The order form opens with several collapsible sections:<br>
&nbsp;&nbsp;• <strong>Order number</strong>: enter a prefix (e.g. CMD), a suffix, or click <em>"Générer automatiquement"</em><br>
&nbsp;&nbsp;• <strong>Server</strong>: choose Tunisia, Senegal or All<br>
&nbsp;&nbsp;• <strong>Supplier</strong>: select the partner/recipient<br>
&nbsp;&nbsp;• <strong>Delivery dates</strong>: requested date, earliest, latest<br>
&nbsp;&nbsp;• <strong>Currency</strong>: TND, EUR, USD or XOF<br>
&nbsp;&nbsp;• <strong>Items</strong>: add product lines with quantities<br>
4️⃣ The <strong>"Envoyer la Commande"</strong> button (dark blue, bottom) activates when all required fields are filled (order number + supplier + at least 1 item)<br>
5️⃣ Click <strong>"Envoyer la Commande"</strong> to send<br><br>
⚠️ If the button stays greyed out, check that the order number, supplier and at least one item are filled in.`,
  },

  // ── PRODUCT SHEET / IMPORT ──
  {
    triggers: [
      "fiche produit","fiches produits","ajouter fiche","creer fiche",
      "ajouter un produit","importer produit","mass import","import produit",
      "add product sheet","create product sheet","product sheet",
      "comment ajouter produit","ajouter produit","importer des produits","how to add product"
    ],
    fr: `<strong>Comment ajouter / importer des fiches produits</strong><br><br>
⚠️ Les fiches produits se gèrent dans <a href="/catalogueComplet">Catalogue Complet</a> — <strong>pas</strong> dans la page Produits (qui ne gère que les mappings NMC/Rayon/Brick).<br><br>
<strong>Méthode 1 — Import en masse (recommandée)</strong><br>
1️⃣ Allez sur <a href="/generateur-modele">Générateur Modèle</a> et créez votre modèle (voir <em>"comment utiliser le générateur"</em>)<br>
2️⃣ Allez sur <a href="/catalogueComplet">Catalogue Complet</a><br>
3️⃣ En haut à droite, cliquez <strong>« Télécharger modèle »</strong> ou <strong>« Importer »</strong><br>
4️⃣ Dans la modale, onglet <strong>« Télécharger »</strong> : choisissez Segment → Famille → Classe → Brick → Rayon → Hiérarchies, puis téléchargez le fichier XLSX<br>
5️⃣ Remplissez le fichier XLSX avec vos données produits<br>
6️⃣ Revenez dans la modale, onglet <strong>« Importer »</strong> : sélectionnez votre XLSX rempli → cliquez <strong>Importer</strong><br>
7️⃣ Un rapport s'affiche avec le nombre de produits importés et les éventuelles erreurs (téléchargeables)<br><br>
<strong>Méthode 2 — Saisie individuelle</strong><br>
Dans <a href="/catalogueComplet">Catalogue Complet</a>, cliquez <strong>« Ajouter »</strong> (en haut à droite) pour saisir une fiche manuellement.<br><br>
⚠️ Accès <strong>lecture + écriture</strong> requis sur Catalogue Complet.`,

    en: `<strong>How to add / import product sheets</strong><br><br>
⚠️ Product sheets are managed in <a href="/catalogueComplet">Full Catalog</a> — <strong>not</strong> in the Products page (which only handles NMC/Aisle/Brick mappings).<br><br>
<strong>Method 1 — Mass import (recommended)</strong><br>
1️⃣ Go to <a href="/generateur-modele">Model Generator</a> and create your template (see <em>"how to use the generator"</em>)<br>
2️⃣ Go to <a href="/catalogueComplet">Full Catalog</a><br>
3️⃣ Top-right: click <strong>"Télécharger modèle"</strong> or <strong>"Importer"</strong><br>
4️⃣ In the modal, <strong>"Download"</strong> tab: pick Segment → Family → Class → Brick → Aisle → Hierarchies, then download the XLSX<br>
5️⃣ Fill in the XLSX file with your product data<br>
6️⃣ Back in the modal, <strong>"Import"</strong> tab: select your filled XLSX → click <strong>Importer</strong><br>
7️⃣ A report shows how many products were imported and any errors (downloadable)<br><br>
<strong>Method 2 — Individual entry</strong><br>
In <a href="/catalogueComplet">Full Catalog</a>, click <strong>"Ajouter"</strong> (top-right) to enter a product sheet manually.<br><br>
⚠️ <strong>Read + write</strong> access required on Full Catalog.`,
  },

  // ── MODEL GENERATOR ──
  {
    triggers: [
      "generateur modele","creer modele","creer un modele","comment utiliser generateur",
      "model generator","create model","how to use generator","generer modele",
      "comment generateur","utiliser generateur","how to use model generator"
    ],
    fr: `<strong>Comment utiliser le Générateur Modèle</strong><br><br>
Le Générateur Modèle crée des <strong>templates de fiches produits par brique GPC</strong> — ils servent ensuite à importer en masse dans <a href="/catalogueComplet">Catalogue Complet</a>.<br><br>
<strong>Étape 1 — Choisir la classification (panneau gauche)</strong><br>
&nbsp;&nbsp;• Sélectionnez : Segment → Famille → Classe → Brick → Rayon<br>
&nbsp;&nbsp;• Indiquez si le produit est <strong>transformé</strong> (Oui / Non)<br><br>
<strong>Étape 2 — Personnaliser le modèle (panneau droit)</strong><br>
&nbsp;&nbsp;• Les sections du modèle apparaissent (Identification, Données spécifiques, Conditionnement…)<br>
&nbsp;&nbsp;• Supprimez les champs inutiles avec le bouton <strong>✕</strong><br>
&nbsp;&nbsp;• Ajoutez un champ personnalisé avec le bouton vert <strong>« + Champ personnalisé »</strong><br>
&nbsp;&nbsp;• Configurez les <strong>Unités logistiques</strong> (PK, AP, CA, DS, PL, MX)<br>
&nbsp;&nbsp;• Cliquez <strong>« Afficher la section tarifaire »</strong> si nécessaire<br><br>
<strong>Étape 3 — Générer</strong><br>
&nbsp;&nbsp;• <strong>Bouton violet</strong> <em>« Générer la fiche produit »</em> → génère le modèle HTML pour la brique sélectionnée<br>
&nbsp;&nbsp;• <strong>Bouton vert</strong> <em>« Générer toutes les fiches produits »</em> → génère un ZIP de tous les modèles pour le segment Nourriture/Boisson<br><br>
🔁 Une fois votre modèle prêt, allez dans <a href="/catalogueComplet">Catalogue Complet</a> pour importer vos produits.`,

    en: `<strong>How to use the Model Generator</strong><br><br>
The Model Generator creates <strong>product sheet templates per GPC brick</strong> — used for mass import in <a href="/catalogueComplet">Full Catalog</a>.<br><br>
<strong>Step 1 — Choose the classification (left panel)</strong><br>
&nbsp;&nbsp;• Select: Segment → Family → Class → Brick → Aisle<br>
&nbsp;&nbsp;• Indicate whether the product is <strong>processed</strong> (Yes / No)<br><br>
<strong>Step 2 — Customize the template (right panel)</strong><br>
&nbsp;&nbsp;• Template sections appear (Identification, Specific Data, Packaging…)<br>
&nbsp;&nbsp;• Remove unused fields with the <strong>✕</strong> button<br>
&nbsp;&nbsp;• Add a custom field with the green <strong>"+ Custom field"</strong> button<br>
&nbsp;&nbsp;• Configure <strong>Logistics units</strong> (PK, AP, CA, DS, PL, MX)<br>
&nbsp;&nbsp;• Click <strong>"Afficher la section tarifaire"</strong> if needed<br><br>
<strong>Step 3 — Generate</strong><br>
&nbsp;&nbsp;• <strong>Purple button</strong> <em>"Générer la fiche produit"</em> → generates the HTML template for the selected brick<br>
&nbsp;&nbsp;• <strong>Green button</strong> <em>"Générer toutes les fiches produits"</em> → generates a ZIP of all templates for the Food/Drink segment<br><br>
🔁 Once your template is ready, go to <a href="/catalogueComplet">Full Catalog</a> to import your products.`,
  },

  // ── GED ──
  {
    triggers: [
      "uploader document","ajouter document","importer document","comment ged",
      "utiliser ged","upload document","add document","how ged works",
      "gestion document","document management","nouveau dossier","creer dossier"
    ],
    fr: `<strong>Comment utiliser le GED (Gestion Électronique de Documents)</strong><br><br>
<strong>Uploader un fichier</strong><br>
1️⃣ Allez sur <a href="/ged">GED</a><br>
2️⃣ La zone d'upload est en haut de la page — glissez-déposez votre fichier ou cliquez pour le parcourir<br>
3️⃣ Renseignez une <strong>catégorie</strong>, des <strong>tags</strong> (ex: mot1, mot2) et une <strong>description</strong> (facultatif)<br>
4️⃣ Cliquez <strong>« Charger »</strong> pour envoyer le fichier<br><br>
<strong>Organiser en dossiers</strong><br>
• Dans le panneau <strong>Dossiers</strong> (gauche), cliquez <strong>« + Nouveau dossier »</strong><br>
• Glissez vos fichiers dans les dossiers pour les organiser<br><br>
<strong>Rechercher & prévisualiser</strong><br>
• Utilisez la barre <strong>Rechercher…</strong> et le filtre par catégorie (panneau droit)<br>
• Cliquez sur un fichier pour le <strong>prévisualiser</strong><br><br>
<strong>Supprimer un fichier</strong><br>
• Sélectionnez le fichier et cliquez <strong>🗑️ Supprimer</strong><br><br>
<strong>Journal d'audit</strong><br>
• Toutes les actions sont tracées dans le journal d'audit accessible depuis la même page.`,

    en: `<strong>How to use the GED (Document Management)</strong><br><br>
<strong>Upload a file</strong><br>
1️⃣ Go to <a href="/ged">GED</a><br>
2️⃣ The upload area is at the top — drag and drop your file or click to browse<br>
3️⃣ Enter a <strong>category</strong>, <strong>tags</strong> (e.g. tag1, tag2) and a <strong>description</strong> (optional)<br>
4️⃣ Click <strong>"Charger"</strong> to upload<br><br>
<strong>Organize with folders</strong><br>
• In the <strong>Dossiers</strong> (Folders) panel (left), click <strong>"+ Nouveau dossier"</strong><br>
• Drag your files into folders to organize them<br><br>
<strong>Search & preview</strong><br>
• Use the <strong>Rechercher…</strong> bar and category filter (right panel)<br>
• Click a file to <strong>preview</strong> it<br><br>
<strong>Delete a file</strong><br>
• Select the file and click <strong>🗑️ Supprimer</strong><br><br>
<strong>Audit log</strong><br>
• All actions are tracked in the audit log accessible from the same page.`,
  },

  // ── FLASH NOTIFICATIONS ──
  {
    triggers: [
      "flash notification","creer notification","envoyer notification",
      "diffuser notification","create notification","send notification",
      "broadcast notification","ajouter notification","nouvelle notification"
    ],
    fr: `<strong>Comment créer une Flash Notification</strong><br><br>
⚠️ Seuls les <strong>administrateurs</strong> voient le bouton de création.<br><br>
1️⃣ Allez sur <a href="/flash">Flash Notifications</a><br>
2️⃣ Cliquez le bouton <strong>« Ajouter une Notification »</strong> (fond sombre, en haut)<br>
3️⃣ Une modale s'ouvre avec 3 colonnes de langue :<br>
&nbsp;&nbsp;• <strong>Titre Arabe + Texte Arabe</strong><br>
&nbsp;&nbsp;• <strong>Titre Français + Texte Français</strong><br>
&nbsp;&nbsp;• <strong>Titre Anglais + Texte Anglais</strong><br>
&nbsp;&nbsp;Les champs texte utilisent un éditeur riche (gras, italique, listes…)<br>
4️⃣ Remplissez les 6 champs (tous requis)<br>
5️⃣ Assignez la notification aux <strong>entités cibles</strong> dans la section dédiée<br>
6️⃣ Cliquez <strong>Enregistrer</strong> — la notification est diffusée immédiatement aux entités sélectionnées<br><br>
💡 <em>Les notifications actives apparaissent dans toute l'application pour les entités ciblées.</em>`,

    en: `<strong>How to create a Flash Notification</strong><br><br>
⚠️ Only <strong>administrators</strong> see the create button.<br><br>
1️⃣ Go to <a href="/flash">Flash Notifications</a><br>
2️⃣ Click <strong>"Ajouter une Notification"</strong> (dark button, at the top)<br>
3️⃣ A modal opens with 3 language columns:<br>
&nbsp;&nbsp;• <strong>Arabic Title + Arabic Text</strong><br>
&nbsp;&nbsp;• <strong>French Title + French Text</strong><br>
&nbsp;&nbsp;• <strong>English Title + English Text</strong><br>
&nbsp;&nbsp;Text fields use a rich editor (bold, italic, lists…)<br>
4️⃣ Fill all 6 fields (all required)<br>
5️⃣ Assign the notification to <strong>target entities</strong> in the dedicated section<br>
6️⃣ Click <strong>Enregistrer</strong> — the notification is immediately broadcast to selected entities<br><br>
💡 <em>Active notifications appear throughout the app for targeted entities.</em>`,
  },

  // ── PERMISSIONS ──
  {
    triggers: [
      "modifier permission","changer permission","ajouter permission",
      "gerer profil utilisateur","edit permission","change permission",
      "manage user profile","user permissions","creer profil","nouveau profil",
      "gestion permissions","gestion des droits"
    ],
    fr: `<strong>Comment gérer les permissions d'un profil</strong><br><br>
1️⃣ Allez dans <a href="/parametres/profils">Profils</a><br>
2️⃣ Sélectionnez un profil existant ou cliquez <strong>« + Nouveau profil »</strong><br>
3️⃣ Choisissez le type de profil :<br>
&nbsp;&nbsp;• <strong>Modèle</strong> — profil global réutilisable<br>
&nbsp;&nbsp;• <strong>Société</strong> — profil lié à une entité spécifique<br>
4️⃣ Pour chaque page, configurez les cases à cocher :<br>
&nbsp;&nbsp;• <strong>Lire</strong> — l'utilisateur voit la page<br>
&nbsp;&nbsp;• <strong>Éditer</strong> — l'utilisateur peut créer/modifier<br>
&nbsp;&nbsp;• <strong>Masquer</strong> — la page n'apparaît pas dans le menu<br>
&nbsp;&nbsp;• Pour GED : options supplémentaires Aperçu, Upload, Supprimer, Dossier<br>
5️⃣ Cliquez <strong>« Sélectionner tout »</strong> pour tout cocher d'un coup<br>
6️⃣ Cliquez <strong>Enregistrer</strong> pour appliquer les changements<br><br>
💡 <em>Les utilisateurs associés à ce profil verront les changements immédiatement.</em>`,

    en: `<strong>How to manage profile permissions</strong><br><br>
1️⃣ Go to <a href="/parametres/profils">Profiles</a><br>
2️⃣ Select an existing profile or click <strong>"+ New profile"</strong><br>
3️⃣ Choose the profile type:<br>
&nbsp;&nbsp;• <strong>Model</strong> — global reusable profile<br>
&nbsp;&nbsp;• <strong>Company</strong> — profile linked to a specific entity<br>
4️⃣ For each page, configure the checkboxes:<br>
&nbsp;&nbsp;• <strong>Lire (Read)</strong> — user can see the page<br>
&nbsp;&nbsp;• <strong>Éditer (Write)</strong> — user can create/edit<br>
&nbsp;&nbsp;• <strong>Masquer (Hide)</strong> — page doesn't appear in the menu<br>
&nbsp;&nbsp;• For GED: extra options — Preview, Upload, Delete, Folder<br>
5️⃣ Click <strong>"Sélectionner tout"</strong> to check everything at once<br>
6️⃣ Click <strong>Enregistrer</strong> to apply changes<br><br>
💡 <em>Users linked to this profile will see changes immediately.</em>`,
  },

  // ── TRACKING ──
  {
    triggers: [
      "suivre expedition","suivre colis","tracking expedition","comment tracking",
      "track shipment","track package","how tracking","trouver expedition","chercher expedition"
    ],
    fr: `<strong>Comment suivre une expédition</strong><br><br>
1️⃣ Allez sur <a href="/operation-edi/tracking">Tracking</a><br>
2️⃣ Saisissez l'<strong>identifiant d'expédition</strong> (Shipment ID) dans le champ de recherche<br>
3️⃣ Filtrez si besoin par : <strong>Code événement</strong>, <strong>Libellé événement</strong>, <strong>Date/heure</strong>, <strong>Localisation</strong><br>
4️⃣ Les événements s'affichent avec localisation, code, horodatage en temps réel<br><br>
💡 <em>Combinez plusieurs filtres pour affiner les résultats.</em>`,

    en: `<strong>How to track a shipment</strong><br><br>
1️⃣ Go to <a href="/operation-edi/tracking">Tracking</a><br>
2️⃣ Enter the <strong>Shipment ID</strong> in the search field<br>
3️⃣ Filter if needed by: <strong>Event Code</strong>, <strong>Event Label</strong>, <strong>Date/Time</strong>, <strong>Location</strong><br>
4️⃣ Events display with location, code, and real-time timestamps<br><br>
💡 <em>Combine multiple filters to narrow results.</em>`,
  },

  // ── PASSWORD ──
  {
    triggers: [
      "changer mot de passe","modifier mot de passe","reinitialiser mot de passe",
      "change password","reset password","update password","mot de passe oublié",
      "oublié mot de passe","nouveau mot de passe"
    ],
    fr: `<strong>Comment changer votre mot de passe</strong><br><br>
1️⃣ Allez dans <a href="/EditProfile">Mon Profil</a><br>
2️⃣ Trouvez la section <strong>Sécurité / Mot de passe</strong><br>
3️⃣ Saisissez votre <strong>ancien mot de passe</strong><br>
4️⃣ Saisissez le <strong>nouveau mot de passe</strong> et confirmez-le<br>
5️⃣ Un <strong>Certicode</strong> peut être envoyé par email pour valider le changement<br>
6️⃣ Cliquez <strong>Enregistrer</strong><br><br>
💡 <em>Vous pouvez aussi modifier votre nom, email et avatar depuis Mon Profil.</em>`,

    en: `<strong>How to change your password</strong><br><br>
1️⃣ Go to <a href="/EditProfile">My Profile</a><br>
2️⃣ Find the <strong>Security / Password</strong> section<br>
3️⃣ Enter your <strong>old password</strong><br>
4️⃣ Enter the <strong>new password</strong> and confirm it<br>
5️⃣ A <strong>Certicode</strong> may be sent by email to validate the change<br>
6️⃣ Click <strong>Enregistrer (Save)</strong><br><br>
💡 <em>You can also update your name, email and avatar from My Profile.</em>`,
  },

  // ── PAGE GREYED OUT / NO ACCESS ──
  {
    triggers: [
      "page grisee","page inaccessible","page bloquee","acces refuse",
      "page greyed","no access","page locked","pas acces","cannot access",
      "pourquoi je peux pas","pourquoi inaccessible"
    ],
    fr: `<strong>Pourquoi une page est grisée ou inaccessible ?</strong><br><br>
Votre profil utilisateur n'a pas les droits pour cette page. Voici comment résoudre ça :<br><br>
1️⃣ Contactez votre <strong>administrateur</strong><br>
2️⃣ Il doit aller dans <a href="/parametres/profils">Profils</a><br>
3️⃣ Trouver votre profil, et activer la case <strong>« Lire »</strong> pour la page concernée<br>
4️⃣ Si la case <strong>« Masquer »</strong> est cochée, la page n'apparaît même pas dans le menu — il faut la décocher<br><br>
💡 <em>Si vous êtes admin, allez directement dans Paramètres → Profils pour modifier les droits.</em>`,

    en: `<strong>Why is a page greyed out or inaccessible?</strong><br><br>
Your user profile doesn't have the rights for that page. Here's how to fix it:<br><br>
1️⃣ Contact your <strong>administrator</strong><br>
2️⃣ They need to go to <a href="/parametres/profils">Profiles</a><br>
3️⃣ Find your profile, and check the <strong>"Lire" (Read)</strong> box for the relevant page<br>
4️⃣ If <strong>"Masquer" (Hide)</strong> is checked, the page won't even show in the menu — it must be unchecked<br><br>
💡 <em>If you're an admin, go directly to Settings → Profiles to change rights.</em>`,
  },

  // ── MANAGE ACCOUNTS ──
  {
    triggers: [
      "creer compte","ajouter compte","nouveau compte","suspendre compte",
      "create account","add account","new account","suspend account",
      "gerer compte","manage account","gestion comptes"
    ],
    fr: `<strong>Comment gérer les comptes utilisateurs</strong><br><br>
1️⃣ Allez dans <a href="/parametres/comptes">Comptes</a><br>
2️⃣ La liste des comptes s'affiche avec leur rôle, entité et statut<br><br>
<strong>Créer un compte</strong><br>
• Cliquez <strong>« + Nouveau compte »</strong>, renseignez email, profil et entité<br><br>
<strong>Suspendre / réactiver un compte</strong><br>
• Cliquez sur les <strong>⋮ Actions</strong> du compte → <strong>Suspendre</strong> ou <strong>Réactiver</strong><br>
• Une confirmation est demandée avant toute action<br><br>
<strong>Certicode</strong><br>
• Un certicode peut être envoyé à l'utilisateur pour valider certaines actions sensibles (changement de mot de passe…)<br><br>
⚠️ Accès administrateur requis.`,

    en: `<strong>How to manage user accounts</strong><br><br>
1️⃣ Go to <a href="/parametres/comptes">Accounts</a><br>
2️⃣ The account list shows each user's role, entity and status<br><br>
<strong>Create an account</strong><br>
• Click <strong>"+ New account"</strong>, fill in email, profile and entity<br><br>
<strong>Suspend / reactivate an account</strong><br>
• Click the <strong>⋮ Actions</strong> on the account → <strong>Suspend</strong> or <strong>Reactivate</strong><br>
• A confirmation is required before any action<br><br>
<strong>Certicode</strong><br>
• A certicode can be sent to the user to validate sensitive actions (password change…)<br><br>
⚠️ Administrator access required.`,
  },
];

// ─── Translations ─────────────────────────────────────────────
const T: Record<Lang, Record<string, string>> = {
  fr: {
    welcome:          "Bonjour ! Je suis votre assistant EDI. Posez-moi une question sur n'importe quelle page ou demandez-moi comment faire quelque chose — j'ai lu toutes les pages du code source pour vous donner des réponses précises.",
    noAccess:         "Vous n'avez pas accès à cette page. Contactez votre administrateur pour qu'il active les droits dans Paramètres → Profils.",
    noIdea:           "Je n'ai pas trouvé de réponse à ça. Essayez : <em>« comment ajouter une entité »</em>, <em>« créer une commande EDI »</em>, <em>« importer des fiches produits »</em>, <em>« utiliser le générateur modèle »</em>, <em>« page grisée »</em>…",
    pageDesc:         "Voici ce que fait cette page :",
    canAccess:        "Vous avez accès à cette page.",
    noAccess2:        "Vous n'avez pas accès à cette page.",
    myPages:          "Vos pages accessibles",
    goTo:             "Accéder →",
    hint_access:      "Mes pages accessibles",
    hint_faq:         "FAQ",
    hint_help:        "Aide générale",
    hint_edi:         "Qu'est-ce que l'EDI ?",
    subtitle:         "Assistant en ligne",
    ediExplain:       "L'EDI (Electronic Data Interchange) est l'échange électronique standardisé de données commerciales entre partenaires (commandes, factures, expéditions…). Cette plateforme vous permet de gérer tout le cycle : entités, produits, commandes EDI, factures, tracking, GED — de façon dématérialisée et automatisée.",
    generalHelp:      "Je peux vous aider avec :<br>• <strong>Tutoriels pas à pas</strong> basés sur le code réel des pages<br>• <strong>Navigation</strong> : quelle page fait quoi<br>• <strong>Résolution de problèmes</strong> : page grisée, bouton inactif…<br><br>Exemples :<br>→ <em>« comment ajouter une entité »</em><br>→ <em>« importer des fiches produits »</em><br>→ <em>« créer une commande EDI »</em><br>→ <em>« utiliser le générateur modèle »</em><br>→ <em>« page grisée »</em>",
    writeAccess:      "Vous avez un accès lecture + écriture.",
    readOnly:         "Vous avez un accès lecture seule.",
    publicPage:       "Cette page est publique — accessible sans connexion.",
    inputPlaceholder: "Posez une question…",
    noPageAccess:     "Aucune page accessible trouvée pour votre profil.",
    resetConvo:       "Réinitialiser la conversation",
    resetConfirm:     "✅ Conversation réinitialisée. Comment puis-je vous aider ?",
  },
  en: {
    welcome:          "Hello! I'm your EDI platform assistant. Ask me about any page or how to do something — I've read the actual source code of all pages to give you accurate step-by-step answers.",
    noAccess:         "You don't have access to this page. Ask your administrator to enable the rights in Settings → Profiles.",
    noIdea:           "I couldn't find an answer to that. Try: <em>\"how to add an entity\"</em>, <em>\"create an EDI order\"</em>, <em>\"import product sheets\"</em>, <em>\"use the model generator\"</em>, <em>\"greyed out page\"</em>…",
    pageDesc:         "Here's what this page does:",
    canAccess:        "You have access to this page.",
    noAccess2:        "You don't have access to this page.",
    myPages:          "Your accessible pages",
    goTo:             "Go →",
    hint_access:      "My accessible pages",
    hint_faq:         "FAQ",
    hint_help:        "General help",
    hint_edi:         "What is EDI?",
    subtitle:         "Assistant online",
    ediExplain:       "EDI (Electronic Data Interchange) is the standardized electronic exchange of business data between partners (orders, invoices, shipments…). This platform lets you manage the full cycle: entities, products, EDI orders, invoices, tracking, document management — fully digital and automated.",
    generalHelp:      "I can help you with:<br>• <strong>Step-by-step tutorials</strong> based on the real page code<br>• <strong>Navigation</strong>: which page does what<br>• <strong>Troubleshooting</strong>: greyed out page, inactive button…<br><br>Examples:<br>→ <em>\"how to add an entity\"</em><br>→ <em>\"import product sheets\"</em><br>→ <em>\"create an EDI order\"</em><br>→ <em>\"use the model generator\"</em><br>→ <em>\"greyed out page\"</em>",
    writeAccess:      "You have read + write access.",
    readOnly:         "You have read-only access.",
    publicPage:       "This is a public page — accessible without login.",
    inputPlaceholder: "Ask a question…",
    noPageAccess:     "No accessible pages found for your profile.",
    resetConvo:       "Reset conversation",
    resetConfirm:     "✅ Conversation reset. How can I help you?",
  },
};

// ─── FAQ ──────────────────────────────────────────────────────
const FAQ: Record<Lang, { q: string; a: string }[]> = {
  fr: [
    { q: "Comment ajouter une entité ?",                   a: "Allez sur Entités → bouton « Actions » (haut droite) → « Ajouter entité ». Remplissez raison sociale, identifiant national, contact et type d'opérateur (tous requis), puis Enregistrer." },
    { q: "Comment importer des fiches produits ?",          a: "Dans Catalogue Complet, cliquez « Télécharger modèle » ou « Importer » → téléchargez le XLSX pour votre brique GPC → remplissez → importez dans l'onglet Importer. Pas dans la page Produits." },
    { q: "Comment créer une commande EDI ?",                a: "Commandes EDI → Actions → Ajouter. Remplissez N° de commande, serveur, fournisseur, dates, devise et articles. Le bouton « Envoyer la Commande » s'active quand tous les champs requis sont remplis." },
    { q: "Comment exporter les entités vers Excel ?",       a: "Entités → bouton « Actions » → « Exporter ». Le fichier entites_export.xlsx se télécharge directement. Appliquez d'abord des filtres si vous voulez un export partiel." },
    { q: "Comment changer mon mot de passe ?",              a: "Mon Profil (/EditProfile) → section Sécurité → ancien mot de passe → nouveau → confirmer → Enregistrer. Un Certicode peut être envoyé par email." },
    { q: "Comment uploader un document dans le GED ?",      a: "GED → zone d'upload en haut → glissez votre fichier ou cliquez → renseignez catégorie/tags → cliquez Charger." },
    { q: "À quoi sert le Générateur Modèle ?",              a: "Il crée des templates de fiches produits par brique GPC (sélectionnez Segment → Famille → Classe → Brick → Rayon, personnalisez les champs, cliquez le bouton violet « Générer »). Ces templates servent ensuite à l'import dans Catalogue Complet." },
    { q: "Pourquoi une page est grisée ?",                  a: "Votre profil n'a pas les droits. L'admin doit aller dans Paramètres → Profils → votre profil → cocher « Lire » pour la page concernée et décocher « Masquer »." },
    { q: "Comment suivre une expédition ?",                 a: "Tracking → entrez le Shipment ID → les événements s'affichent en temps réel. Filtrez par code événement, libellé, date ou localisation." },
    { q: "Comment créer une notification flash ?",          a: "Flash Notifications → bouton « Ajouter une Notification » (admin seulement) → remplissez les 6 champs (titre + texte × 3 langues) → assignez les entités cibles → Enregistrer." },
  ],
  en: [
    { q: "How do I add an entity?",                         a: "Entities → 'Actions' button (top right) → 'Ajouter entité'. Fill in company name, national ID, contact and operator type (all required), then Save." },
    { q: "How do I import product sheets?",                 a: "In Full Catalog, click 'Télécharger modèle' or 'Importer' → download the XLSX for your GPC brick → fill it in → import in the Import tab. Not in the Products page." },
    { q: "How do I create an EDI order?",                   a: "EDI Orders → Actions → Ajouter. Fill in order number, server, supplier, dates, currency and items. The 'Envoyer la Commande' button activates when all required fields are complete." },
    { q: "How do I export entities to Excel?",              a: "Entities → 'Actions' button → 'Exporter'. The entites_export.xlsx downloads automatically. Apply filters first if you want a partial export." },
    { q: "How do I change my password?",                    a: "My Profile (/EditProfile) → Security section → enter old password → new password → confirm → Save. A Certicode may be sent by email." },
    { q: "How do I upload a document in the GED?",          a: "GED → upload area at the top → drag your file or click to browse → set category/tags → click Charger." },
    { q: "What is the Model Generator for?",                a: "It creates product sheet templates per GPC brick (pick Segment → Family → Class → Brick → Aisle, customize fields, click the purple 'Générer' button). Templates are then used for import in Full Catalog." },
    { q: "Why is a page greyed out?",                       a: "Your profile doesn't have the rights. An admin must go to Settings → Profiles → your profile → check 'Lire' for the page and uncheck 'Masquer'." },
    { q: "How do I track a shipment?",                      a: "Tracking → enter the Shipment ID → events display in real time. Filter by event code, label, date or location." },
    { q: "How do I create a flash notification?",           a: "Flash Notifications → 'Ajouter une Notification' button (admin only) → fill 6 fields (title + text × 3 languages) → assign target entities → Save." },
  ],
};

// ─── Styles ───────────────────────────────────────────────────
const STYLES = `
  #edi-chat-fab{position:fixed;bottom:28px;right:28px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1e40af 0%,#172554 100%);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(23,37,84,.45);z-index:9999;transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s;}
  #edi-chat-fab:hover{transform:scale(1.1);box-shadow:0 8px 28px rgba(23,37,84,.55);}
  .edi-badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#ef4444;font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(239,68,68,.4);}
  .edi-window{position:fixed;bottom:96px;right:28px;width:420px;max-width:calc(100vw - 40px);background:#fff;border:1px solid #dbeafe;border-radius:20px;display:flex;flex-direction:column;z-index:9998;overflow:hidden;box-shadow:0 12px 48px rgba(23,37,84,.18),0 2px 8px rgba(23,37,84,.08);font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;animation:ediSlideIn .22s cubic-bezier(.34,1.56,.64,1);}
  @keyframes ediSlideIn{from{opacity:0;transform:translateY(16px) scale(.95);}to{opacity:1;transform:translateY(0) scale(1);}}
  .edi-header{background:linear-gradient(135deg,#1e40af 0%,#172554 100%);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;position:relative;overflow:hidden;}
  .edi-header::before{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;background:rgba(255,255,255,.05);border-radius:50%;pointer-events:none;}
  .edi-avatar{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
  .edi-title{color:#fff;font-size:14px;font-weight:700;}
  .edi-subtitle{color:rgba(255,255,255,.65);font-size:11px;margin-top:2px;display:flex;align-items:center;gap:5px;}
  .edi-online-dot{width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 2px rgba(74,222,128,.3);animation:ediPulse 2s infinite;display:inline-block;flex-shrink:0;}
  @keyframes ediPulse{0%,100%{box-shadow:0 0 0 2px rgba(74,222,128,.3);}50%{box-shadow:0 0 0 4px rgba(74,222,128,.15);}}
  .edi-controls{display:flex;align-items:center;gap:6px;position:relative;z-index:1;}
  .edi-lang-select{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#fff;font-size:12px;padding:5px 8px;cursor:pointer;outline:none;font-family:inherit;font-weight:500;}
  .edi-lang-select option{color:#1e293b;background:#fff;}
  .edi-icon-btn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:8px;color:rgba(255,255,255,.85);cursor:pointer;font-size:14px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;transition:all .15s;padding:0;line-height:1;}
  .edi-icon-btn:hover{background:rgba(255,255,255,.22);color:#fff;}
  .edi-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:220px;max-height:400px;scrollbar-width:thin;scrollbar-color:#bfdbfe transparent;background:#f8faff;}
  .edi-messages::-webkit-scrollbar{width:4px;}
  .edi-messages::-webkit-scrollbar-thumb{background:#bfdbfe;border-radius:4px;}
  .edi-msg{max-width:92%;padding:10px 14px;font-size:13px;line-height:1.7;border-radius:16px;word-break:break-word;animation:ediFadeUp .18s ease;}
  @keyframes ediFadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  .edi-msg.bot{background:#fff;color:#1e293b;border-radius:4px 16px 16px 16px;align-self:flex-start;border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(23,37,84,.06);}
  .edi-msg.user{background:linear-gradient(135deg,#1e40af 0%,#172554 100%);color:#fff;border-radius:16px 16px 4px 16px;align-self:flex-end;box-shadow:0 2px 8px rgba(30,64,175,.3);}
  .edi-msg a{color:#1e40af;text-decoration:none;font-weight:600;border-bottom:1px solid #bfdbfe;}
  .edi-msg a:hover{border-color:#1e40af;}
  .edi-msg.user a{color:#bfdbfe;border-bottom-color:rgba(191,219,254,.4);}
  .edi-msg ol{padding-left:0;margin:4px 0;list-style:none;}
  .edi-quick-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 12px;border-bottom:1px solid #eff6ff;flex-shrink:0;background:#fff;}
  .edi-qbtn{background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:5px 13px;font-size:11.5px;color:#1e40af;cursor:pointer;transition:all .15s;font-family:inherit;font-weight:500;}
  .edi-qbtn:hover{background:#1e40af;color:#fff;border-color:#1e40af;transform:translateY(-1px);box-shadow:0 2px 8px rgba(30,64,175,.25);}
  .edi-input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #eff6ff;flex-shrink:0;align-items:center;background:#fff;}
  .edi-input{flex:1;border:1.5px solid #e2e8f0;border-radius:24px;padding:9px 16px;font-size:13px;color:#1e293b;background:#f8faff;outline:none;font-family:inherit;transition:all .18s;}
  .edi-input:focus{border-color:#1e40af;background:#fff;box-shadow:0 0 0 3px rgba(30,64,175,.08);}
  .edi-input::placeholder{color:#94a3b8;}
  .edi-send-btn{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1e40af 0%,#172554 100%);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .18s;box-shadow:0 2px 8px rgba(30,64,175,.3);}
  .edi-send-btn:hover{transform:scale(1.08);}
  .edi-typing{display:flex;gap:4px;align-items:center;padding:11px 16px;align-self:flex-start;background:#fff;border:1px solid #e2e8f0;border-radius:4px 16px 16px 16px;box-shadow:0 1px 4px rgba(23,37,84,.06);}
  .edi-typing span{width:7px;height:7px;border-radius:50%;background:#93c5fd;animation:ediDot 1.3s infinite;display:block;}
  .edi-typing span:nth-child(2){animation-delay:.2s;}
  .edi-typing span:nth-child(3){animation-delay:.4s;}
  @keyframes ediDot{0%,80%,100%{opacity:.25;transform:scale(.8);}40%{opacity:1;transform:scale(1.1);}}
`;

function norm(s: string) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'");
}
function pname(p: typeof PAGES[number], l: Lang) { return p[`name_${l}`]; }
function pdesc(p: typeof PAGES[number], l: Lang) { return p[`desc_${l}`]; }

const ChatbotWidget: React.FC = () => {
  const [open, setOpen]     = useState(false);
  const [lang, setLang]     = useState<Lang>(() => {
    try { return (localStorage.getItem(LS_LANG_KEY) as Lang) || "fr"; } catch { return "fr"; }
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const alive = sessionStorage.getItem(SS_ALIVE_KEY);
      if (!alive) {
        localStorage.removeItem(LS_CONVO_KEY);
        sessionStorage.setItem(SS_ALIVE_KEY, "1");
        return [];
      }
      const saved = localStorage.getItem(LS_CONVO_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput]   = useState("");
  const [typing, setTyping] = useState(false);
  const [badge, setBadge]   = useState(() => {
    try { return !sessionStorage.getItem(SS_ALIVE_KEY + "_seen"); } catch { return true; }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const windowRef      = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(LS_CONVO_KEY, JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { try { localStorage.setItem(LS_LANG_KEY, lang); } catch {} }, [lang]);

  useEffect(() => {
    if (!document.getElementById("edi-chat-styles")) {
      const s = document.createElement("style");
      s.id = "edi-chat-styles"; s.textContent = STYLES;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const fab = document.getElementById("edi-chat-fab");
      if (windowRef.current && !windowRef.current.contains(e.target as Node) && fab && !fab.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const t = useCallback((k: string) => T[lang][k] || T.fr[k] || k, [lang]);

  const getPerms = (): Record<number, { read: number; write: number; hide: number }> => {
    try {
      const raw = localStorage.getItem("currentUser"); if (!raw) return {};
      const user: StoredUser = JSON.parse(raw);
      const map: Record<number, { read: number; write: number; hide: number }> = {};
      (user.permissions || []).forEach((p) => { map[p.page_id] = { read: p.read, write: p.write, hide: p.hide }; });
      return map;
    } catch { return {}; }
  };
  const canAccess = (pid: number) => {
    if (PUBLIC_PAGES.includes(pid)) return true;
    const p = getPerms()[pid];
    return !!(p && p.read === 1 && p.hide === 0);
  };
  const accessibleIds = () => Object.keys(PAGES).map(Number).filter(canAccess);

  const openChat = () => {
    setOpen(true); setBadge(false);
    try { sessionStorage.setItem(SS_ALIVE_KEY + "_seen", "1"); } catch {}
    if (messages.length === 0) setMessages([{ role: "bot", text: t("welcome") }]);
  };
  const addMsg = (role: "bot" | "user", text: string) =>
    setMessages((p) => [...p, { role, text }]);

  const handleSend = () => { const v = input.trim(); if (!v) return; setInput(""); handleInput(v); };
  const handleInput = (text: string) => {
    addMsg("user", text);
    setTyping(true);
    setTimeout(() => { setTyping(false); addMsg("bot", generateReply(norm(text))); }, 400);
  };
  const resetConvo = () => {
    const msg = t("resetConfirm");
    setMessages([{ role: "bot", text: msg }]);
    try { localStorage.setItem(LS_CONVO_KEY, JSON.stringify([{ role: "bot", text: msg }])); } catch {}
  };

  const generateReply = (q: string): string => {
    // 1. How-to guides
    for (const ht of HOW_TOS)
      if (ht.triggers.some((tr) => q.includes(norm(tr))))
        return lang === "fr" ? ht.fr : ht.en;

    // 2. My pages
    if (q.includes(norm(t("hint_access"))) || q.includes("mes page") || q.includes("my page") || q.includes("accessible"))
      return myPagesReply();

    // 3. EDI explainer
    if (q.includes("edi") && (q.includes("qu") || q.includes("what") || q.includes("c'est") || q.includes("is") || q.includes("explique") || q.includes("explain")))
      return t("ediExplain");

    // 4. FAQ
    if (q.includes("faq") || q.includes("frequente") || q.includes("frequently") || q === norm(t("hint_faq")))
      return faqListReply();

    // 5. General help
    if (q === norm(t("hint_help")) || q === "aide" || q === "help" || q.includes("comment tu peux") || q.includes("what can you"))
      return t("generalHelp");

    // 6. Page match
    const pid = findPageMatch(q);
    if (pid) return pageInfoReply(pid);

    // 7. FAQ fuzzy
    const faqHit = findFaqMatch(q);
    if (faqHit) return faqHit;

    return t("noIdea");
  };

  const myPagesReply = () => {
    const ids = accessibleIds(); if (ids.length === 0) return t("noPageAccess");
    const perms = getPerms();
    let s = `<strong>${t("myPages")} (${ids.length})</strong><br><br>`;
    ids.forEach((pid) => {
      const p = PAGES[pid]; const pm = perms[pid];
      const icon = PUBLIC_PAGES.includes(pid) ? "🌐" : pm?.write ? "✏️" : "👁️";
      s += `${icon} <a href="${p.route}"><strong>${pname(p, lang)}</strong></a> — <small style="color:#64748b">${pdesc(p, lang).substring(0, 68)}…</small><br>`;
    });
    return s;
  };

  const faqListReply = () => {
    let s = `<strong>FAQ</strong><br><br>`;
    FAQ[lang].forEach((f, i) => { s += `<strong>${i + 1}. ${f.q}</strong><br><small style="color:#475569">${f.a}</small><br><br>`; });
    return s;
  };

  const pageInfoReply = (pid: number) => {
    const p = PAGES[pid]; const accessible = canAccess(pid);
    const pm = getPerms()[pid]; const isPublic = PUBLIC_PAGES.includes(pid);
    let s = `<strong>${pname(p, lang)}</strong><br><br>${t("pageDesc")}<br>${pdesc(p, lang)}<br><br>`;
    if (accessible) {
      s += `✅ ${t("canAccess")}<br>`;
      if (isPublic) s += `🌐 ${t("publicPage")}`;
      else if (pm) s += pm.write ? `✏️ ${t("writeAccess")}` : `👁️ ${t("readOnly")}`;
      s += `<br><br><a href="${p.route}">${t("goTo")}</a>`;
    } else {
      s += `🔒 ${t("noAccess2")}<br><small style="color:#64748b">${t("noAccess")}</small>`;
    }
    return s;
  };

  const findPageMatch = (q: string): number | null => {
    for (const pid of Object.keys(PAGES).map(Number)) {
      const p = PAGES[pid];
      for (const l of ["fr", "en"] as Lang[])
        if (q.includes(norm(p[`name_${l}`]))) return pid;
    }
    for (const [pidStr, kws] of Object.entries(PAGE_KEYWORDS))
      if (kws.some((kw) => q.includes(norm(kw)))) return Number(pidStr);
    return null;
  };

  const findFaqMatch = (q: string): string | null => {
    for (const l of ["fr", "en"] as Lang[]) {
      for (const f of FAQ[l]) {
        const words = norm(f.q + " " + f.a).split(/\s+/).filter((w) => w.length > 4);
        if (words.filter((w) => q.includes(w)).length >= 2)
          return `<strong>${f.q}</strong><br>${f.a}`;
      }
    }
    return null;
  };

  return (
    <>
      <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999 }}>
        <button id="edi-chat-fab" onClick={openChat} title="Assistant EDI">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.03 2 11c0 2.7 1.18 5.1 3.07 6.82L4 22l4.54-1.54C9.6 20.8 10.77 21 12 21c5.52 0 10-4.03 10-9S17.52 2 12 2zm1 13H7v-2h6v2zm3-4H7V9h9v2z" />
          </svg>
          {badge && <div className="edi-badge">1</div>}
        </button>
      </div>

      {open && (
        <div className="edi-window" ref={windowRef}>
          {/* Header */}
          <div className="edi-header">
            <div style={{ display: "flex", alignItems: "center", gap: 11, position: "relative", zIndex: 1 }}>
              <div className="edi-avatar">💬</div>
              <div>
                <div className="edi-title">Assistant EDI</div>
                <div className="edi-subtitle"><span className="edi-online-dot" />{t("subtitle")}</div>
              </div>
            </div>
            <div className="edi-controls">
              <select className="edi-lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                <option value="fr">🇫🇷 FR</option>
                <option value="en">🇬🇧 EN</option>
              </select>
              <button className="edi-icon-btn" title={t("resetConvo")} onClick={resetConvo}>↺</button>
              <button className="edi-icon-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="edi-messages">
            {messages.map((m, i) => (
              <div key={i} className={`edi-msg ${m.role}`} dangerouslySetInnerHTML={{ __html: m.text }} />
            ))}
            {typing && <div className="edi-typing"><span /><span /><span /></div>}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick hints */}
          <div className="edi-quick-wrap">
            {(["hint_access", "hint_faq", "hint_help", "hint_edi"] as const).map((key) => (
              <button key={key} className="edi-qbtn" onClick={() => handleInput(t(key))}>{t(key)}</button>
            ))}
          </div>

          {/* Input */}
          <div className="edi-input-row">
            <input
              className="edi-input"
              placeholder={t("inputPlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button className="edi-send-btn" onClick={handleSend}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;