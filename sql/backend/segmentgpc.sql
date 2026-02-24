;
;
;
;




CREATE TABLE segmentgpc (
  codeSegment TEXT NOT NULL,
  ordre_segment INTEGER NOT NULL,
  libelleSegment TEXT DEFAULT NULL,
  libelleSegment_a TEXT  DEFAULT NULL,
  libelleSegment_e TEXT DEFAULT NULL,
  url_icon_segment TEXT DEFAULT NULL,
  status_s INTEGER NOT NULL DEFAULT '1'
)  ;


INSERT INTO segmentgpc (codeSegment, ordre_segment, libelleSegment, libelleSegment_a, libelleSegment_e, url_icon_segment, status_s) VALUES
('10000000', 23, 'Nourriture/Soins pour animal', 'المأكولات للحـيوانات', 'Pet Care/Food', NULL, 1),
('120000000', 50, 'Ingénierie & Services', 'الهندسة  والخدمــــات', 'Engineering & Services', NULL, 1),
('47000000', 2, 'Produits d'' Entretien/Nettoyage', 'الـتـنـظيف والصيانة', 'Cleaning/Hygiene Products', '/assets/img/icon_segment/entretien_nettoyage.png', 1),
('50000000', 1, 'Nourriture/Boisson', 'المأكولات والمشروبات', 'Food/Beverage', '/assets/img/icon_segment/alimentation_nourriture_boisson.png', 1),
('51000000', 23, 'Santé', 'صحة', 'Healthcare', NULL, 1),
('53000000', 3, 'Beauté/Soin Personnel/Hygiène', 'العناية الشخصية بالنظافة', 'Beauty/Personal Care/Hygiene', '/assets/img/icon_segment/beaute_soin_personnel_hygiene.png', 1),
('54000000', 4, 'Soins Bébé Puériculture', 'رعاية الأطفال', 'Baby Nursery Care', '/assets/img/icon_segment/soins_du_bebe.png', 1),
('58000000', 23, 'Inter–Segment', NULL, NULL, NULL, 0),
('60000000', 16, 'Oeuvres Textuelles/Imprimées/De Référence', 'القرطاسية ومستلزمات المكتب', 'Textual/Printed/Reference Materials', '/assets/img/icon_segment/fournitures_papeterie.png', 1),
('61000000', 22, 'Musique', '', 'Music', '/assets/img/icon_segment/musique.png', 0),
('62000000', 23, 'Fournitures Occasionnelles/Machines de Bureau', NULL, 'Stationery/Office Machinery/Occasion Supplies', NULL, 0),
('63000000', 6, 'Chaussures', 'الٱحــذيــة', 'shoes', '/assets/img/icon_segment/chaussures.png', 1),
('64000000', 7, 'Accessoires Corporels', 'ملحقات الهيكل', 'Personal Accessories', '/assets/img/icon_segment/accessoires_corporels.png', 1),
('65000000', 14, 'Informatique', 'الإلكترونيات', 'Computing', '/assets/img/icon_segment/informatique.png', 0),
('66000000', 23, 'Communications', NULL, 'Communications', NULL, 0),
('67000000', 5, 'Vêtements Habillement Textile', 'الـمـلابـــس', 'Clothing', '/assets/img/icon_segment/vetements.png', 1),
('68000000', 21, 'Audiovisuel/Photographie', '', 'Audio Visual/Photography', '/assets/img/icon_segment/audiovisuel_photographie.png', 0),
('70000000', 23, 'Arts Plastiques/Loisirs Créatifs/Travaux d’Aiguille', NULL, 'Arts/Crafts/Needlework', NULL, 0),
('71000000', 15, 'Equipements Sportifs', 'المعدات الرياضية', 'Sports Equipment', '/assets/img/icon_segment/equipements_sportifs.png', 1),
('72000000', 10, 'Equipement de la Maison', 'معدات المنزل', 'Home Appliances', '/assets/img/icon_segment/equipement_de_la_maison.png', 1),
('73000000', 8, 'Ustensiles de Cuisine et Art de la Table', ' أدوات الـمطـبــخ', 'Kitchenware and Tableware', '/assets/img/icon_segment/ustensiles_de_cuisine.png', 1),
('74000000', 23, 'Camping', NULL, 'Camping', NULL, 0),
('75000000', 20, 'Meubles Domestiques/De Bureau/Ameublement', 'أثاث منزلي/ مكتبي', 'Household/Office Furniture/Furnishings', '/assets/img/icon_segment/meubles_domestiques_bureau_ameublement.png', 0),
('77000000', 17, 'Composants, Outils et Consommables Auto et autres véhicules', 'المواد المستهلكة للسيارات', 'Vehicle', '/assets/img/icon_segment/automobile.png', 1),
('78000000', 9, 'Matériels Electriques', 'المعدات الكهربائية', 'Electrical Supplies', '/assets/img/icon_segment/materiels_electriques.png', 1),
('79000000', 11, 'Plomberie/Chauffage/Ventilation/Climatisation', 'السباكة التدفئة  تكييف الهواء', 'Plumbing/Heating/Ventilation/Air Conditioning', '/assets/img/icon_segment/climatisation.png', 1),
('80000000', 23, 'Outillages/Equipements Manuels', NULL, 'Tools/Equipment - Hand', NULL, 1),
('81000000', 23, 'Fournitures pour Jardins', NULL, 'Lawn/Garden Supplies', NULL, 0),
('82000000', 23, 'Outils/Equipements à Moteur', NULL, 'Tools/Equipment - Power', NULL, 1),
('83000000', 12, 'Produits de Construction', 'مـنـتـجـات البـنـاء', 'Building Products', '/assets/img/icon_segment/produits_de_construction.png', 1),
('84000000', 23, 'Rangements pour l''Outillage – Mobiliers d''Atelier', NULL, 'Tool Storage/Workshop Aids', NULL, 1),
('85000000', 19, 'Sécurité/Protection – Bricolage', 'أدوات معدات المحرك', 'Safety/Protection - DIY', '/assets/img/icon_segment/bricolage.png', 1),
('86000000', 13, 'Jouets/Jeux', 'الألعـاب والُّلعـَـب', 'Toys/Games', '/assets/img/icon_segment/jeux_jouets.png', 1),
('87000000', 23, 'Carburants/Gaz', NULL, 'Fuel/Gas', NULL, 1),
('88000000', 23, 'Lubrifiants', 'زيوت التشحيم', 'Lubricants', NULL, 1),
('89000000', 23, 'Animaux Vivants', NULL, 'Live Animals', NULL, 0),
('91000000', 18, 'Sûreté/Sécurité/Surveillance', 'الأمن والمراقبة', 'Safety/Security/Surveillance', '/assets/img/icon_segment/securite_surveillance.png', 1),
('92000000', 23, 'Conteneurs de Stockage/Transport', NULL, 'Storage/Haulage Containers', NULL, 0),
('93000000', 23, 'Plantes Horticoles', NULL, 'Horticulture Plants', NULL, 1),
('94000000', 23, 'Cultures', 'زراعـة', 'Crops', NULL, 1),
('95000000', 23, 'Services/Distributeurs Automatique', NULL, 'Services/Vending Machines', NULL, 0),
('96000000', 23, 'Monnaies/Certificats', NULL, 'Monetary Assets', NULL, 0),
('99000000', 41, 'Métiers d''Art - Série Limitée', 'إبــداعــات حـرفـيــة', 'Artistics Designs - Limited Edition', NULL, 1);


ALTER TABLE segmentgpc
  ADD PRIMARY KEY (codeSegment),
  ADD KEY codeSegment (codeSegment),
  ADD KEY codeSegment_2 (codeSegment);

;
;
;