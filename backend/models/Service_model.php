<?php
#[AllowDynamicProperties]
class Service_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 


		
		public function get_all_service_by_producteur_model($id_ind)
		{
			 $data = [];
			 $this->query = $this->db->select('s.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('services s')
			->join('producteur e', 'e.id_producteur = s.id_producteur')
			->join('pays p', 'p.isoNumeric = s.CountryOfOrigin_service')
			->join('brickgpc b', 'b.codeBrique = s.codebrique_service')
			->where('s.id_producteur',$id_ind)
			->order_by("s.id", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				
				$btn='';
				/*if($this->session->userdata('profil')=='1')
				{
					$btn='<a href="javascript:;" onclick="msgbox_confirm_fp_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;';

					//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				}*/
				
				$btn='<button data-toggle="modal" onclick="getService(\''.$row['id'].'\')" data-target="#updateServiceModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				$btn.='&nbsp;&nbsp;<button data-toggle="modal" onclick="getimages(\''.$row['id'].'\')" data-target="#updateimagesModal" class="btn btn-default" type="button"> <i class="icon-th-large"></i> </button>';
				switch ($row['status']) {
					case '0':
						$status =  "Non publié";
						$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['titre_service_fr']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';
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
						$images = '<a class="lightbox-type" href="'.$row['images_services'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images_services'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images_services']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\')" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
				$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_sup_service(\''.addslashes($row['titre_service_fr']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>';
				$data[] = array(
				'imag1' => $images,
				'fabricant' => $row['raison_socialle'],
				'titre_service_fr' => $row['titre_service_fr'],
				'texte_service_fr' => $row['texte_service_fr'],
				'titre_service_ar' => $row['titre_service_ar'],
				'texte_service_ar' => $row['texte_service_ar'],
				'titre_service_en' => $row['titre_service_en'],
				'texte_service_en' => $row['texte_service_en'],	
				'libelleBrique' => $row['libelleBrique'],
				'status' => $status,
				//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
				'btn_detail_fp' => $btn
			 );
			//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
			}
			return $data;
		}
		
		function  get_all_service_producteur_model()
		{
			$data =[];
			 $this->query = $this->db->select('s.*,p.libelle as lib_pays,e.raison_socialle,b.libelleBrique')
			->from('services s')
			->join('producteur e', 'e.id_producteur = s.id_producteur')
			->join('pays p', 'p.isoNumeric = s.CountryOfOrigin_service')
			->join('brickgpc b', 'b.codeBrique = s.codebrique_service')
			->order_by("s.id", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				
				$btn='';
				/*if($this->session->userdata('profil')=='1')
				{
					$btn='<a href="javascript:;" onclick="msgbox_confirm_fp_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;';

					//$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id'].'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				}*/
				
				$btn='<button data-toggle="modal" onclick="getService(\''.$row['id'].'\')" data-target="#updateServiceModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				$btn.='&nbsp;&nbsp;<button data-toggle="modal" onclick="getimages(\''.$row['id'].'\')" data-target="#updateimagesModal" class="btn btn-default" type="button"> <i class="icon-th-large"></i> </button>';
				switch ($row['status']) {
					case '0':
						$status =  "Non publié";
						break;
					case '1':
						$status = "Publication en cours";
						$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_fp_pub(\''.addslashes($row['titre_service_fr']).'\',\''.$row['id'].'\')" class="btn btn-info"><i class="icon-play"></i></a>';
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
						$images = '<a class="lightbox-type" href="'.$row['images_services'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.$row['images_services'].' ></a>';
						break;
					default:
					$tbimages = explode(";", $row['images_services']);
					$images = '<a href="javascript:;" data-toggle="modal" onclick="getsildeimages(\''.$row['id'].'\')" data-target="#imagespfModal"><img style="max-width: 40px; max-height: 40px;" src='.$tbimages[0].' ></a>';
				}
				$btn.='&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_sup_service(\''.addslashes($row['titre_service_fr']).'\',\''.$row['id'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>';
				$data[] = array(
				'imag1' => $images,
				'fabricant' => $row['raison_socialle'],
				'titre_service_fr' => $row['titre_service_fr'],
				'texte_service_fr' => $row['texte_service_fr'],
				'titre_service_ar' => $row['titre_service_ar'],
				'texte_service_ar' => $row['texte_service_ar'],
				'titre_service_en' => $row['titre_service_en'],
				'texte_service_en' => $row['texte_service_en'],	
				'libelleBrique' => $row['libelleBrique'],
				'status' => $status,
				//'etat_prix' => $row['activ_prix'].'&nbsp;&nbsp;<button data-toggle="modal" onclick="getfprix(\''.$row['id'].'\',\''.$row['activ_prix'].'\')" data-target="#activeprixModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>',
				'btn_detail_fp' => $btn
			 );
			//array_push($data,$data1);'<a href="javascript:;" data-toggle="modal" data-target="#getinfontincoModal" onclick="allegationbtn(\''.$row['id'].'\')" >Info</a>',
			}
			return $data;
		}
		
		function add_service_model($data_ajouter_service)
		{	
			$this->db->insert('services', $data_ajouter_service);
			return $this->db->insert_id();
		}
		
		public function delete_service_model($id_service)
		{
			$this->db->delete('services',array('id' => $id_service));
		}
		
		public function update_service_id_service_model($id_service_c,$data_update_c)
		{
			$this->db->where('id', $id_service_c);
			$this->db->update('services', $data_update_c); 
		}
		
		public function get_nb_produits_condit_pub_by_segment_model($codeSegment)
		{
			 $this->query = $this->db->select('count(fp.id) as nb_fp')
			->from('fiche_produit fp')
			->join('producteur e', 'e.id_producteur = fp.idEntreprise')
			->join('brickgpc b', 'b.codeBrique = fp.codebrique')
			->join('classegpc c', 'c.codeClasse = fp.codeClasse')
			->where('c.codeSeg',$codeSegment)
			->where('e.status_ent', 'A')
			->get();
			return $this->query->row_array();
		}
		
		function get_images_by_id_service_model($id_service)
		{
			 $this->query = $this->db->select('images_services')
			->from('services')
			->where('id',$id_service)
			->get();
			return $this->query->row_array();
		}
		
		function get_images_nb_by_id_service_model($id_service)
		{
			 $this->query = $this->db->select('images_services,nb_images')
			->from('services')
			->where('id',$id_service)
			->get();
			return $this->query->row_array();
		}
		
		function get_service_by_id_model($id_service)
		{
			 $this->query = $this->db->select('s.*,c.codeFamille')
			->from('services s')
			->join('classegpc c', 'c.codeClasse = s.codeclasse_service')
			->where('s.id',$id_service)
			->get();
			return $this->query->row_array();
		}

}