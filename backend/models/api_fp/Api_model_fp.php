<?php
#[AllowDynamicProperties]
class Api_model_fp extends CI_Model {


	public function __construct()
	{
        // Call the CI_Model constructor
		parent::__construct();

	}
	
	function fiche_produit_gtin($gtin)
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.subBrand,fiche_produit.libelle as productName,fiche_produit.short_libelle as shortName,fiche_produit.gtin,pays.libelle as countryOfOrigin,brickgpc.libelleBrique as libelleBrique_fr,brickgpc.libelleBrique_ar,brickgpc.libelleBrique_en,fiche_produit.prix_min as prixMin,fiche_produit.prix_max as prixMax,fiche_produit.code_cader as codeCader,producteur.raison_socialle as companyName,producteur.gln,producteur.adresse,producteur.telephone,producteur.email,producteur.site")
		->from('fiche_produit')
		//->join('nourriture_boisson n','n.id_FP=fiche_produit.id')
		->join('producteur','producteur.id_producteur=fiche_produit.idEntreprise')
	    ->join('pays','pays.isoNumeric=fiche_produit.countryOfOrigin')
		->join('brickgpc','brickgpc.codeBrique=fiche_produit.codebrique')
		// ->where('fiche_produit.gtin',$gtin)
		->like('fiche_produit.gtin', $gtin, 'before')
		->where('fiche_produit.status',2)
		->get();			
		return $this->query->row_array();
	}
	
	/*function fiche_produit_brand($brand)
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.subBrand,fiche_produit.libelle as productName,fiche_produit.short_libelle as shortName,fiche_produit.gtin,pays.libelle as countryOfOrigin,brickgpc.libelleBrique as libelleBrique_fr,brickgpc.libelleBrique_ar,brickgpc.libelleBrique_en,fiche_produit.prix_min as prixMin,fiche_produit.prix_max as prixMax,fiche_produit.code_cader as codeCader,n.netContent,n.netContent_measurementUnitCode as unitCodeNetContent,producteur.raison_socialle as companyName,producteur.gln,producteur.adresse,producteur.telephone,producteur.email,producteur.site")
		->from('fiche_produit')
		->join('nourriture_boisson n','n.id_FP=fiche_produit.id')
		->join('producteur','producteur.id_producteur=fiche_produit.idEntreprise')
	    ->join('pays','pays.isoNumeric=fiche_produit.countryOfOrigin')
		->join('brickgpc','brickgpc.codeBrique=fiche_produit.codebrique')
		->like('fiche_produit.brand', $brand, 'both')
		->where('fiche_produit.status',2)
		->group_by('fiche_produit.brand')
		->get();			
		return $this->query->result_array();
	}*/
	
	function fiche_produit_name_brand($brand)
	{
		$this->query = $this->db->select("f.id,f.brand as nameBrand")
		->from('fiche_produit f')
		->like('f.brand', $brand, 'both')
		//->where_in('fiche_produit.brand',$brand)
		->where('f.status',2)
		->group_by('f.brand')
		->get();			
		return $this->query->result_array();
	}
	
	function marque_categorie_by_brand($brand)
	{
		$this->query = $this->db->select("brickgpc.libelleBrique as libelleBrique_fr,brickgpc.libelleBrique_en,brickgpc.libelleBrique_ar,brickgpc.codeBrique")
		->from('fiche_produit f')
		->join('brickgpc','brickgpc.codeBrique=f.codebrique')
		->like('f.brand', $brand)
		->where('f.status',2)
		->group_by('brickgpc.codeBrique')//->group_by('brickgpc.libelleBrique')
		->get();			
		return $this->query->result_array();
	}
	
	function marque_categorie_by_brand_ext($brand)
	{
		$this->query = $this->db->select("brickgpc.libelleBrique as libelleBrique_fr,brickgpc.libelleBrique_en,brickgpc.libelleBrique_ar,brickgpc.codeBrique")
		->from('fiche_produit f')
		->join('brickgpc','brickgpc.codeBrique=f.codebrique')
		->like('f.brand', $brand, 'none')
		->where('f.status',2)
		->group_by('brickgpc.codeBrique')//->group_by('brickgpc.libelleBrique')
		->get();			
		return $this->query->result_array();
	}
	
	function count_total_fiche_produit_categoryCode_brand($brand,$categoryCode)
	{
		$this->query = $this->db->select("count(id) as totalFP")
		->from('fiche_produit')
		->where('brand', $brand)
		->where('status',2)
		->where('codebrique',$categoryCode)
		//->group_by('codebrique')
		->get();		
		return $this->query->row_array();
	}
	function fiche_produit_categoryCode_brand_sans_limit($brand,$categoryCode)
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.subBrand,fiche_produit.libelle as productName,fiche_produit.short_libelle as shortName,fiche_produit.gtin,pays.libelle as countryOfOrigin,producteur.raison_socialle as companyName,brickgpc.libelleBrique,brickgpc.codeBrique")
		->from('fiche_produit')
		->join('producteur','producteur.id_producteur=fiche_produit.idEntreprise')
	    ->join('pays','pays.isoNumeric=fiche_produit.countryOfOrigin')
		->join('brickgpc','brickgpc.codeBrique=fiche_produit.codebrique')
		->where('fiche_produit.brand', $brand)
		->where('fiche_produit.status',2)
		->where('fiche_produit.codebrique',$categoryCode)
		->order_by('fiche_produit.libelle', 'desc')
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_categoryCode_brand_with_limit($brand,$categoryCode,$start,$pageSize)
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.subBrand,fiche_produit.libelle as productName,fiche_produit.short_libelle as shortName,fiche_produit.gtin,pays.libelle as countryOfOrigin,producteur.raison_socialle as companyName,brickgpc.libelleBrique,brickgpc.codeBrique")
		->from('fiche_produit')
		->join('producteur','producteur.id_producteur=fiche_produit.idEntreprise')
	    ->join('pays','pays.isoNumeric=fiche_produit.countryOfOrigin')
		->join('brickgpc','brickgpc.codeBrique=fiche_produit.codebrique')
		->where('fiche_produit.brand', $brand)
		->where('fiche_produit.status',2)
		->where('fiche_produit.codebrique',$categoryCode)
		->limit($pageSize, $start)
		->order_by('fiche_produit.libelle', 'desc')
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_by_categorie_cader($cader,$codeBrique)
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.subBrand,fiche_produit.libelle as productName,fiche_produit.short_libelle as shortName,fiche_produit.gtin,pays.libelle as countryOfOrigin,fiche_produit.prix_min as prixMin,fiche_produit.prix_max as prixMax,producteur.raison_socialle as companyName")
		->from('fiche_produit')
		//->join('nourriture_boisson n','n.id_FP=fiche_produit.id')
		->join('producteur','producteur.id_producteur=fiche_produit.idEntreprise')
	    ->join('pays','pays.isoNumeric=fiche_produit.countryOfOrigin')
		->join('brickgpc','brickgpc.codeBrique=fiche_produit.codebrique')
		->group_start()
		//->like('fiche_produit.code_cader', $cader)
		->like('fiche_produit.code_cader', 'Encadre')
		->or_like('fiche_produit.code_cader', 'Subventionne')
		->group_end()
		->where('fiche_produit.status',2)
		->where('fiche_produit.codebrique',$codeBrique)
		->order_by('fiche_produit.libelle', 'desc')
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_by_categorie_art($codeBrique)
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.subBrand,fiche_produit.libelle as productName,fiche_produit.short_libelle as shortName,fiche_produit.gtin,pays.libelle as countryOfOrigin,fiche_produit.prix_min as prixMin,fiche_produit.prix_max as prixMax,producteur.raison_socialle as companyName")
		->from('fiche_produit')
		//->join('nourriture_boisson n','n.id_FP=fiche_produit.id')
		->join('producteur','producteur.id_producteur=fiche_produit.idEntreprise')
	    ->join('pays','pays.isoNumeric=fiche_produit.countryOfOrigin')
		->join('brickgpc','brickgpc.codeBrique=fiche_produit.codebrique')
		->where('fiche_produit.status',2)
		->where('fiche_produit.codebrique',$codeBrique)
		->order_by('fiche_produit.libelle', 'desc')
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_segment_cader($cader)
	{
		$this->query = $this->db->select("s.codeSegment,s.libelleSegment as libelleSegment_fr,s.libelleSegment_a as libelleSegment_ar,s.libelleSegment_e as libelleSegment_en")
		->from('segmentgpc s')
		->join('classegpc c','c.codeSeg=s.codeSegment')
	    ->join('fiche_produit f','f.codeClasse=c.codeClasse')
		->group_start()
		//->like('f.code_cader', $cader)
		->like('f.code_cader', 'Encadre')
		->or_like('f.code_cader', 'Subventionne')
		->group_end()
		->where('f.status',2)
		->group_by('s.codeSegment')
		//->where_in('fiche_produit.brand',$brand)
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_segment_art($codeSegment)
	{
		$this->query = $this->db->select("s.codeSegment,s.libelleSegment as libelleSegment_fr,s.libelleSegment_a as libelleSegment_ar,s.libelleSegment_e as libelleSegment_en")
		->from('segmentgpc s')
		->join('classegpc c','c.codeSeg=s.codeSegment')
	    ->join('fiche_produit f','f.codeClasse=c.codeClasse')
		->where('f.status',2)
		->where('s.codeSegment',$codeSegment)
		->group_by('s.codeSegment')
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_segment_categorie_cader($cader,$segment)
	{
		$this->query = $this->db->select("b.codeBrique,b.libelleBrique as libelleBrique_fr,b.libelleBrique_ar,b.libelleBrique_en")
		->from('brickgpc b')
		->join('classegpc c','c.codeClasse=b.codeClasse')
		->join('segmentgpc s','s.codeSegment=c.codeSeg')
	    ->join('fiche_produit f','f.codebrique=b.codeBrique')
		->group_start()
		//->like('f.code_cader', $cader)
		->like('f.code_cader', 'Encadre')
		->or_like('f.code_cader', 'Subventionne')
		->group_end()
		->where('f.status',2)
		->where('s.codeSegment',$segment)
		->group_by('b.codeBrique')
		//->where_in('fiche_produit.brand',$brand)
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_produit_segment_categorie_art($segment)
	{
		$this->query = $this->db->select("b.codeBrique,b.libelleBrique as libelleBrique_fr,b.libelleBrique_ar,b.libelleBrique_en")
		->from('brickgpc b')
		->join('classegpc c','c.codeClasse=b.codeClasse')
		->join('segmentgpc s','s.codeSegment=c.codeSeg')
	    ->join('fiche_produit f','f.codebrique=b.codeBrique')
		->where('f.status',2)
		->where('s.codeSegment',$segment)
		->group_by('b.codeBrique')
		//->where_in('fiche_produit.brand',$brand)
		->get();			
		return $this->query->result_array();
	}
	
	function all_notif_active()
	{
		$this->query = $this->db->select("id_notif as idNotif,titre_notif_ar,texte_notif_ar,titre_notif_fr,texte_notif_fr,titre_notif_en,texte_notif_en,date_notif as dateNotif")
		->from('notif')
		->where('status',1)
		->get();			
		return $this->query->result_array();
	}

	function fiche_produit()
	{
		$this->query = $this->db->select("fiche_produit.images,fiche_produit.brand,fiche_produit.libelle,fiche_produit.gtin,fiche_produit.description,fiche_produit.id_pays,fiche_produit.idEntreprise,fiche_produit.codeClasse,fiche_produit.brique,inco.infos_techniques,inco.ingredientDesc,inco.isBio,inco.nutriments,inco.n_confinement,inco.netContent,inco.p_origine,inco.urlImage,inco.urlOwner,industriel.idEntreprise,entreprises.id_entreprise,entreprises.adresse,entreprises.email,entreprises.nom,entreprises.password,entreprises.prenom,industriel.raison,industriel.adresse,industriel.site,industriel.email_rep,industriel.pays")
		->from('fiche_produit')
		->join('entreprises','entreprises.id_entreprise=fiche_produit.idEntreprise')
	    ->join('industriel','industriel.idEntreprise=fiche_produit.idEntreprise')
		->join('inco','inco.id=fiche_produit.idInco')
		->get();			
		return $this->query->result_array();
	}	

	
	function all_sponsors()
	{
		$this->query = $this->db->select("url")
		->from('sponsor')
		->where('status',1)
		->get();			
		return $this->query->result_array();
	}	
	
	function get_titres_menu()
	{
		$this->query = $this->db->select("*")
		->from('titres_menu')
		->where('id_titre',1)
		->get();
		return $this->query->row_array();
	}
	
	/***************************** service *********************************************/
	public function fiche_service_id($id_s)
		{
			 $this->query = $this->db->select('services.images_services as images,services.titre_service_ar as titreService_ar,services.titre_service_fr as titreService_fr,services.titre_service_en as titreService_en,services.texte_service_ar as texteService_ar,services.texte_service_fr as texteService_fr,services.texte_service_en as texteService_en,pays.libelle as countryOfOrigin,brickgpc.libelleBrique as libelleBrique_fr,brickgpc.libelleBrique_ar,brickgpc.libelleBrique_en,producteur.raison_socialle as companyName,producteur.gln,producteur.adresse,producteur.telephone,producteur.email,producteur.site')
			->from('services')
			->join('producteur', 'producteur.id_producteur = services.id_producteur')
			->join('pays', 'pays.isoNumeric = services.CountryOfOrigin_service')
			->join('brickgpc', 'brickgpc.codeBrique = services.codebrique_service')
			->where('services.id',$id_s)
			->where('services.status',2)
			->get();
			return $this->query->row_array();
		}
		
	public function get_segment_service($codeSegment)
	{
		$this->query = $this->db->select("s.codeSegment,s.libelleSegment as libelleSegment_fr,s.libelleSegment_a as libelleSegment_ar,s.libelleSegment_e as libelleSegment_en")
		->from('segmentgpc s')
		->where('s.codeSegment',$codeSegment)
		->get();			
		return $this->query->row_array();
	}
	
	public function fiche_service_segment_categorie_service($codeSegment)
	{
		$this->query = $this->db->select("b.codeBrique,b.libelleBrique as libelleBrique_fr,b.libelleBrique_ar,b.libelleBrique_en")
		->from('brickgpc b')
		->join('classegpc c','c.codeClasse=b.codeClasse')
		->join('segmentgpc s','s.codeSegment=c.codeSeg')
	    ->join('services ser','ser.codebrique_service=b.codeBrique')
		->where('ser.status',2)
		->where('s.codeSegment',$codeSegment)
		->group_by('b.codeBrique')
		->get();			
		return $this->query->result_array();
	}
	
	function fiche_service_by_brique($codeBrique)
	{
		$this->query = $this->db->select("services.id,images_services as images,services.titre_service_ar as titreService_ar,services.titre_service_fr as titreService_fr,services.titre_service_en as titreService_en,pays.libelle as countryOfOrigin,producteur.raison_socialle as companyName")
		->from('services')
		->join('producteur','producteur.id_producteur=services.id_producteur')
	    ->join('pays','pays.isoNumeric=services.CountryOfOrigin_service')
		->join('brickgpc','brickgpc.codeBrique=services.codebrique_service')
		->where('services.status',2)
		->where('services.codebrique_service',$codeBrique)
		->order_by('services.id', 'desc')
		->get();			
		return $this->query->result_array();
	}
	
	/***************************** Fin service *********************************************/

}