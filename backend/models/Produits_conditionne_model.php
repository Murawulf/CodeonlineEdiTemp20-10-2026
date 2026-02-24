<?php
#[AllowDynamicProperties]
class Produits_conditionne_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        public function get_all_produits_conditionne_model()
        {
		   $data =false;
		   $this->query = $this->db->select('fp.*,e.adresse,e.email,e.nom,p.libelle as lib_pays,i.urlImage')
			->from('fiche_produit fp')
			->join('entreprises e', 'e.id_entreprise = fp.idEntreprise')
			->join('pays p', 'p.id = fp.id_pays')
			->join('inco i', 'i.id = fp.idInco')
			->order_by("fp.date_mis_a_jour_fp", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{					
				$btn='';
				//if($this->session->userdata('profil')=='1')
				//{
					//$btn='<a href="javascript:;" onclick="msgbox_confirm_fp_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;';

					$btn='<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatepfModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				//}
				$data[] = array(
				'gtin' => $row['gtin'],
				'imag1' => '<a class="lightbox-type" href="'.base_url().$row['urlImage'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.base_url().$row['urlImage'].' ></a>',
				'libelle_pf' => $row['libelle'],
				'lib_pays' => $row['lib_pays'],
				'fabricant' => $row['nom'],
				'brand' => $row['brand'],
				'prix_min' => $row['prix_min'],
				'prix_max' => $row['prix_max'],				
				'info_inco' => '<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
				'btn_detail_fp' => $btn
			 );
			//array_push($data,$data1);
			}
			return $data;
        }
		
		public function get_all_produits_conditionne_by_producteur_model($id_ind)
		{
		$data =[];
			 //$data[] = false;
			 $this->query = $this->db->select('fp.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('pays p', 'p.isoNumeric = fp.countryOfOrigin')
			//->join('nourriture_boisson i', 'i.id_FP = fp.id')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->where('fp.idEntreprise',$id_ind)
			->order_by("fp.date_mis_a_jour_fp", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				
				$btn='';
				/*if($this->session->userdata('profil')=='1')
				{
					$btn='<a href="javascript:;" onclick="msgbox_confirm_fp_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;';

					//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				}*/
				
				$btn='<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatepfModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				$btn.='&nbsp;&nbsp;<button data-toggle="modal" onclick="getimages(\''.$row['id'].'\')" data-target="#updateimagesModal" class="btn btn-default" type="button"> <i class="icon-th-large"></i> </button>';
				switch ($row['code_cader']) {
					case 'Libre':
						$code_cader =  "Libre";
						break;
					case 'Subventionne':
						$code_cader = "Tarifé";
						break;
					case 'Encadre':
						$code_cader = "Encadré";
						break;
					default:
					$code_cader = "Libre";
				}
				switch ($row['status']) {
					case '0':
						$status =  "Non publié";
						$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';
						break;
					case '1':
						$status = "Publication en cours";
						break;
					case '2':
						$status = "Publié";
						break;
				}
				switch ($row['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
						$images = '<a class="lightbox-type" href="'.$row['images'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\')" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
				$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_sup_fp(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>';
				$data[] = array(
				'gtin' => $row['gtin'],
				'imag1' => $images,
				'libelle_pf' => $row['libelle'],
				'fabricant' => $row['raison_socialle'],
				'brand' => $row['brand'],
				'subBrand' => $row['subBrand'],
				'countryOfOrigin' => $row['lib_pays'],
				'prix_min' => $row['prix_min'],
				'prix_max' => $row['prix_max'],				
				'description' => $row['description'],
				'libelleBrique' => $row['libelleBrique'],
				'code_cader' => $code_cader,
				'status' => $status,
				//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
				'btn_detail_fp' => $btn
			 );
			//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
			}
			return $data;
		}
		
		public function get_all_produits_conditionne_by_marque_model($id_marque)
		{
			 $data =[];
			 $this->query = $this->db->select('fp.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('pays p', 'p.isoNumeric = fp.countryOfOrigin')
			//->join('nourriture_boisson i', 'i.id_FP = fp.id')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->where('fp.brand',$id_marque)
			->order_by("fp.date_mis_a_jour_fp", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				
				$btn='';
				/*if($this->session->userdata('profil')=='1')
				{
					$btn='<a href="javascript:;" onclick="msgbox_confirm_fp_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;';

					//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				}*/
				$btn='<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatepfModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				switch ($row['code_cader']) {
					case 'Libre':
						$code_cader =  "Libre";
						break;
					case 'Subventionne':
						$code_cader = "Tarifé";
						break;
					case 'Encadre':
						$code_cader = "Encadré";
						break;
					default:
					$code_cader = "Libre";
				}
				switch ($row['status']) {
					case '0':
						$status =  "Non publié";						
						break;
					case '1':
						$status = "Publication en cours";
						$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';
						break;
					case '2':
						$status = "Publié";
						break;
				}
				switch ($row['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
						$images = '<a class="lightbox-type" href="'.$row['images'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\');" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
				$data[] = array(
				'gtin' => $row['gtin'],
				'imag1' => $images,
				'libelle_pf' => $row['libelle'],
				'fabricant' => $row['raison_socialle'],
				'brand' => $row['brand'],
				'subBrand' => $row['subBrand'],
				'countryOfOrigin' => $row['lib_pays'],
				'prix_min' => $row['prix_min'],
				'prix_max' => $row['prix_max'],				
				'description' => $row['description'],
				'libelleBrique' => $row['libelleBrique'],
				'code_cader' => $code_cader,
				'status' => $status,
				//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
				'btn_detail_fp' => $btn
			 );
			//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
			}
			return $data;
		}
		
		public function get_all_produits_conditionne_by_secteur_model($id_secteur)
		{
			 $data =[];
			 $this->query = $this->db->select('fp.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('pays p', 'p.isoNumeric = fp.countryOfOrigin')
			//->join('nourriture_boisson i', 'i.id_FP = fp.id')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->join('classegpc c', 'c.codeClasse = fp.codeClasse')
			->where('c.codeSeg',$id_secteur)
			->order_by("fp.date_mis_a_jour_fp", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				
				$btn='';
				/*if($this->session->userdata('profil')=='1')
				{
					$btn='<a href="javascript:;" onclick="msgbox_confirm_fp_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;';

					//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				}*/
				$btn='<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatepfModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				switch ($row['code_cader']) {
					case 'Libre':
						$code_cader =  "Libre";
						break;
					case 'Subventionne':
						$code_cader = "Tarifé";
						break;
					case 'Encadre':
						$code_cader = "Encadré";
						break;
					default:
					$code_cader = "Libre";
				}
				switch ($row['status']) {
					case '0':
						$status =  "Non publié";						
						break;
					case '1':
						$status = "Publication en cours";
						$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';
						break;
					case '2':
						$status = "Publié";
						break;
				}
				switch ($row['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
						$images = '<a class="lightbox-type" href="'.$row['images'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\');" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
				$data[] = array(
				'gtin' => $row['gtin'],
				'imag1' => $images,
				'libelle_pf' => $row['libelle'],
				'fabricant' => $row['raison_socialle'],
				'brand' => $row['brand'],
				'subBrand' => $row['subBrand'],
				'countryOfOrigin' => $row['lib_pays'],
				'prix_min' => $row['prix_min'],
				'prix_max' => $row['prix_max'],				
				'description' => $row['description'],
				'libelleBrique' => $row['libelleBrique'],
				'code_cader' => $code_cader,
				'status' => $status,
				//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
				'btn_detail_fp' => $btn
			 );
			//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
			}
			return $data;
		}
		
		public function get_all_produits_conditionne_tunisie_model()
		{
			$data =[];
			 $this->query = $this->db->select('fp.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('pays p', 'p.isoNumeric = fp.countryOfOrigin')
			//->join('nourriture_boisson i', 'i.id_FP = fp.id')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->where('fp.countryOfOrigin',788)
			->order_by("fp.date_mis_a_jour_fp", "desc")
			//->group_by('fp.gtin')
			->get();
				foreach ($this->query->result_array() as $key=>$row)
				{		
					
					$btn='';
					/*if($this->session->userdata('profil')=='1')
					{

						//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
					}*/
					$btn='<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatepfModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';


						switch ($row['code_cader']) {
							case 'Libre':
								$code_cader =  "Libre";
								break;
							case 'Subventionne':
								$code_cader = "Tarifé";
								break;
							case 'Encadre':
								$code_cader = "Encadré";
								break;
							default:
								$code_cader = "Libre";
						}


						switch ($row['status']) {
							case '0':
								$status =  "Non publié";
								break;
							case '1':
								$status = "En cours";
								$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';

								break;
							case '2':
								$status = "Publié";
								break;
								
						}
					switch ($row['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
						$images = '<a class="lightbox-type" href="'.$row['images'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\');" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
					$data[] = array(
					'gtin' => $row['gtin'],
					'imag1' => $images,
					'libelle_pf' => $row['libelle'],
					'fabricant' => $row['raison_socialle'],
					'brand' => $row['brand'],
					'subBrand' => $row['subBrand'],
					'countryOfOrigin' => $row['lib_pays'],
					'prix_min' => $row['prix_min'],
					'prix_max' => $row['prix_max'],				
					'description' => $row['description'],
					'libelleBrique' => $row['libelleBrique'],
					'status' => $status,
					'code_cader' => $code_cader,
					//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
					'btn_detail_fp' => $btn
				 );
				//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
				}
			
			return $data;
		}
		
		public function get_all_produits_conditionne_pub_model()
		{
			$data =false;
			 $this->query = $this->db->select('fp.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('pays p', 'p.isoNumeric = fp.countryOfOrigin')
			//->join('nourriture_boisson i', 'i.id_FP = fp.id')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->where('fp.countryOfOrigin',788)
			->where('fp.status',2)
			->order_by("fp.date_mis_a_jour_fp", "desc")
			//->group_by('fp.gtin')
			->get();
				foreach ($this->query->result_array() as $key=>$row)
				{		
					
					$btn='';
					/*if($this->session->userdata('profil')=='1')
					{

						//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
					}*/
					$btn='<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatepfModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';


						switch ($row['code_cader']) {
							case 'Libre':
								$code_cader =  "Libre";
								break;
							case 'Subventionne':
								$code_cader = "Tarifé";
								break;
							case 'Encadre':
								$code_cader = "Encadré";
								break;
							default:
								$code_cader = "Libre";
						}


						switch ($row['status']) {
							case '0':
								$status =  "Non publié";
								break;
							case '1':
								$status = "En cours";
								$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';

								break;
							case '2':
								$status = "Publié";
								break;
								
						}
					switch ($row['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
						$images = '<a class="lightbox-type" href="'.$row['images'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\');" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
					$data[] = array(
					'gtin' => $row['gtin'],
					'imag1' => $images,
					'libelle_pf' => $row['libelle'],
					'fabricant' => $row['raison_socialle'],
					'brand' => $row['brand'],
					'subBrand' => $row['subBrand'],
					'countryOfOrigin' => $row['lib_pays'],
					'prix_min' => $row['prix_min'],
					'prix_max' => $row['prix_max'],				
					'description' => $row['description'],
					'libelleBrique' => $row['libelleBrique'],
					'status' => $status,
					'code_cader' => $code_cader,
					//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
					'btn_detail_fp' => $btn
				 );
				//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
				}
			
			return $data;
		}
		
		public function get_all_segment_model()
        {
		   $this->query = $this->db->select('*')
			->from('segmentgpc')
			->order_by("libelleSegment")
			->get();
			return $this->query->result_array();
        }
		
		public function get_all_segment_active_model()
        {
		   $this->query = $this->db->select('*')
			->from('segmentgpc')
			->where('status_s',1)
			->order_by("libelleSegment")
			->get();
			return $this->query->result_array();
        }
		
		public function get_all_segment_by_producteur_model($id_user)
		{
			$this->query = $this->db->select('s.*')
			->from('segmentgpc s')
			->join('producteur_segment ps', 'ps.id_segment = s.codeSegment')
			->where('ps.id_producteur',$id_user)
			->where('ps.id_segment!=',120000000)
			->order_by("libelleSegment")
			->get();
			return $this->query->result_array();
		}
		
		public function get_all_segments_model2()
        {
		   $this->query = $this->db->select('codeSegment,libelleSegment')
			->from('segmentgpc')
			->where('status_s',1)
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['codeSegment'],
				'name' => $row['libelleSegment'],
				);
			}
			return $data;
        }
		
		public function get_all_origine_model()
        {
		   $this->query = $this->db->select('*')
			->from('pays')
			->order_by("libelle")
			->get();
			return $this->query->result_array();
        }
		
		/*public function get_all_fabricant_model()
        {
		   $this->query = $this->db->select('*')
			->from('entreprises')
			->order_by("nom")
			->get();
			return $this->query->result_array();
        }*/
		
		
		function get_produits_conditionne_by_id_model($id_produit)
		{
			 $this->query = $this->db->select('*')
			->from('fiche_produit')
			->where('id',$id_produit)
			->get();
			return $this->query->row_array();
		}
		
		function get_images_by_id_fp_model($id_produit)
		{
			 $this->query = $this->db->select('images')
			->from('fiche_produit')
			->where('id',$id_produit)
			->get();
			return $this->query->row_array();
		}
		
		function get_images_nb_by_id_fp_model($id_produit)
		{
			 $this->query = $this->db->select('images,nb_images')
			->from('fiche_produit')
			->where('id',$id_produit)
			->get();
			return $this->query->row_array();
		}
		
		function get_all_d_marque_model()
		{
			 $data=[];
			 $this->query = $this->db->select('brand')
			->from('fiche_produit')
			->group_by("brand")
			->order_by("brand")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['brand'],
				'name' => $row['brand'],
				);
			}
			return $data;
			return $this->query->result_array();
		}
		
		function get_famille_code_segmen_model($code_segment)
		{
		$this->query = $this->db->select('*')
			->from('famillegpc')
			->where('codeSegment',$code_segment)
			->where('status_f',1)
			->order_by("libelleFamille")
			->get();
			return $this->query->result_array();
		}
		
		function get_classe_code_famille_model($code_famille)
		{
		$this->query = $this->db->select('*')
			->from('classegpc')
			->where('codeFamille',$code_famille)
			//->where('status_c',1)
			->order_by("libelleClasse")
			->get();
			return $this->query->result_array();
		}
		
		function get_brique_code_classe_model($code_classe)
		{
			$this->query = $this->db->select('*')
			->from('brickgpc')
			->where('codeClasse',$code_classe)
			->where('status_br',1)
			->order_by("libelleBrique")
			->get();
			return $this->query->result_array();
		}
		
		
		function add_info_produits_conditionne_model($data_ajouter_info)
		{
			$this->db->insert('nourriture_boisson', $data_ajouter_info);
			return $this->db->insert_id();
		}
		
		function add_produits_conditionne_model($data_ajouter_fp)
		{	
			$this->db->insert('fiche_produit', $data_ajouter_fp);
			return $this->db->insert_id();
		}
		
		function get_produit_conditionne_by_id_model($id_produit_ref)
		{
			 $this->query = $this->db->select('fp.*,c.codeFamille,c.codeSeg')
			->from('fiche_produit fp')
			->join('classegpc c', 'c.codeClasse = fp.codeClasse')
			->where('id',$id_produit_ref)
			->get();
			return $this->query->row_array();
		}
		
		function get_all_FP_by_id_producteur_model($id_ep)
		{
			$this->query = $this->db->select('id')
			->from('fiche_produit fp')
			->where('idEntreprise',$id_ep)
			->get();
			return $this->query->result_array();
		}
		
		public function delete_produits_conditionne_model($id_produit)
		{
			//$this->db->delete('nourriture_boisson',array('id_FP' => $id_produit));
			$this->db->delete('fiche_produit',array('id' => $id_produit));
		}
		
		public function update_produits_conditionne_id_produit_model($id_produits_c,$data_update_c)
		{
			$this->db->where('id', $id_produits_c);
			$this->db->update('fiche_produit', $data_update_c); 
		}
		
		public function get_all_type_produits_vrac_model()
        {
		   $this->query = $this->db->select('*')
			->from('type_produit_vrac')
			->get();
			return $this->query->result_array();
        }
		
		public function get_nb_produits_condit_pub_by_segment_model($codeSegment)
		{
			 $this->query = $this->db->select('count(fp.id) as nb_fp')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->join('classegpc c', 'c.codeClasse = fp.codeClasse')
			->where('c.codeSeg',$codeSegment)
			->where('c.codeSeg!=',120000000)
			->where('e.status_ent', 'A')
			->get();
			return $this->query->row_array();
		}
		
		public function get_nb_produits_condit_pub_by_segment_companies_model($codeSegment,$id_companies)
		{
			$this->query = $this->db->select('count(fp.id) as nb_fp')
			->from('fiche_produit fp')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->join('classegpc c', 'c.codeClasse = fp.codeClasse')
			->where('c.codeSeg',$codeSegment)
			->where('fp.idEntreprise',$id_companies)
			->get();
			return $this->query->row_array();
		}
		
		function get_categories_by_segment_companies_model($codeSegment,$id_companies)
		{
			$this->query = $this->db->select('b.libelleBrique,b.codeBrique')
			->from('fiche_produit fp')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->join('classegpc c', 'c.codeClasse = fp.codeClasse')
			->where('c.codeSeg',$codeSegment)
			->where('fp.idEntreprise',$id_companies)
			->group_by("b.codeBrique")
			//->order_by("brand")
			->get();
			return $this->query->result_array();
		}
		
		function get_nb_produits_condit_by_Brique_companies_model($codeBrique,$id_companies)
		{
			$this->query = $this->db->select('count(fp.id) as nb_fp')
			->from('fiche_produit fp')
			->where('fp.codebrique',$codeBrique)
			->where('fp.idEntreprise',$id_companies)
			->get();
			return $this->query->row_array();
		}

}