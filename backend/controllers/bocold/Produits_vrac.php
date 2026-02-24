<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Produits_vrac extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('produits_vrac_model');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'active','activetarif'=>'','activejournaltarif'=>'','activepanier'=>'',
				'activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'','activeprodcon'=>'','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
				$this->load->view('boc/Produits_vrac_views',$data);
				}else{ header("Location:login");}
				
	}
	
	public function function_get_all_produit_vrac()
	{
		if($this->session->userdata('profil') == 11 || $this->session->userdata('profil') == 10){
			$list_pv=$this->produits_vrac_model->get_produits_poissons_vrac_model();
		}else{$list_pv=$this->produits_vrac_model->get_all_produits_vrac_model();}
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));

	}
	
	public function function_get_produits_vrac_by_id_produits()
	{
		$id_produit = $this->input->post('id_produit_ref');
		$list_p=$this->produits_vrac_model->get_produits_vrac_by_id_model($id_produit);
			$this->output->set_content_type('application/json')->set_output(json_encode($list_p));
	}
	
	public function update_produit_vrac()
	{
		
		$id_produits_vrac=$this->input->post('id_produits_vracM');
		
		if (!empty($_FILES)){
					$tmp_name = $_FILES["imageproduit_ucM"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["imageproduit_ucM"]["name"];
					$upload_path = "assets/icons_produitsvrac/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."_" .$id_produits_vrac. "." . $extension;
						$new_path	= "assets/icons_produitsvrac/".$xname ;
						rename($upload_path, $new_path);
						$new_path	= "/icons_produitsvrac/".$xname ;
						
					}					
				}
				$data_update_va = array(
				   'code_tarif_produit' => $this->input->post('code_tarif_produitM') ,
				   'id_type_prod_vrac' => $this->input->post('id_type_prod_vracM') ,
				   'libelle_court_fr' => $this->input->post('libelle_court_frM')  ,
				   'libelle_court_ar' => $this->input->post('libelle_court_arM') ,
				   'poids_usage' => $this->input->post('poids_usageM') ,
				   'type_mesure' => $this->input->post('type_mesureM') ,
				   'classement' => $this->input->post('classementM') ,
				   'url_icons' => $new_path ,
				   'nutriments' => $this->input->post('nutrimentsM') ,
				   'unite_nutriments' => $this->input->post('unite_nutrimentsM') ,
				   'vitamines' => $this->input->post('vitaminesM') ,
				   'unite_vitamines' => $this->input->post('unite_vitaminesM') ,
				   'glycemie' => $this->input->post('glycemieM') ,
				   'index_glycemique' => $this->input->post('index_glycemiqueM') ,
				   'allegation_nutritionnelle' => $this->input->post('allegationM') ,
				   'allegation_nutritionnelle_ar' => $this->input->post('allegation_arM') ,
				   'ete' => $this->input->post('saisonM') ,
				   'date_mis_a_jour_vc' => date("Y-m-d H:i:s")
				);
			}else{
				$data_update_va = array(
				   'code_tarif_produit' => $this->input->post('code_tarif_produitM') ,
				   'id_type_prod_vrac' => $this->input->post('id_type_prod_vracM') ,
				   'libelle_court_fr' => $this->input->post('libelle_court_frM')  ,
				   'libelle_court_ar' => $this->input->post('libelle_court_arM') ,
				   'classement' => $this->input->post('classementM') ,
				   'poids_usage' => $this->input->post('poids_usageM') ,
				   'type_mesure' => $this->input->post('type_mesureM') ,
				   'nutriments' => $this->input->post('nutrimentsM') ,
				   'unite_nutriments' => $this->input->post('unite_nutrimentsM') ,
				   'vitamines' => $this->input->post('vitaminesM') ,
				   'unite_vitamines' => $this->input->post('unite_vitaminesM') ,
				   'glycemie' => $this->input->post('glycemieM') ,
				   'index_glycemique' => $this->input->post('index_glycemiqueM') ,
				   'allegation_nutritionnelle' => $this->input->post('allegationM') ,
				   'allegation_nutritionnelle_ar' => $this->input->post('allegation_arM') ,
				   'ete' => $this->input->post('saisonM') ,
				   'date_mis_a_jour_vc' => date("Y-m-d H:i:s")
				);
				
			}
				
			print_r($data_update_va);
			$this->produits_vrac_model->update_produits_vrac_id_produit_model($id_produits_vrac,$data_update_va);	
	}
	
	public function add_produit_vrac()
	{
		$code_tarif_produit = $this->input->post('code_tarif_produit');
			
			if (!empty($_FILES)){
					$tmp_name = $_FILES["imageproduit_vc"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["imageproduit_vc"]["name"];
					$upload_path = "assets/icons_produitsvrac/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."." . $extension;
						$new_path	= "assets/icons_produitsvrac/".$xname ;
						rename($upload_path, $new_path);
						$new_path	= "/icons_produitsvrac/".$xname ;
						
					}					
				}
			}else{$new_path="pas-de-photo.jpg";}
			
			 $data_ajouter_vc = array(
				   'code_tarif_produit' => $code_tarif_produit ,
				   'id_type_prod_vrac' => $this->input->post('id_type_prod_vrac') ,
				   'libelle_court_fr' => $this->input->post('libelle_court_fr')  ,
				   'libelle_court_ar' => $this->input->post('libelle_court_ar') ,
				   'classement' => $this->input->post('classement') ,
				   'poids_usage' => $this->input->post('poids_usage') ,
				   'type_mesure' => $this->input->post('type_mesure') ,
				   'url_icons' => $new_path ,
				   'nutriments' => $this->input->post('nutriments') ,
				   'unite_nutriments' => $this->input->post('unite_nutriments') ,
				   'vitamines' => $this->input->post('vitamines') ,
				   'unite_vitamines' => $this->input->post('unite_vitamines') ,
				   'glycemie' => $this->input->post('glycemie') ,
				   'index_glycemique' => $this->input->post('index_glycemique') ,
				   'allegation_nutritionnelle' => $this->input->post('allegation') ,
				   'allegation_nutritionnelle_ar' => $this->input->post('allegation_ar') ,
				   'ete' => $this->input->post('saison') ,
				   'date_mis_a_jour_vc' => date("Y-m-d H:i:s")
				);
			$this->produits_vrac_model->add_produits_vrac_model($data_ajouter_vc);			
	}
	
	public function function_delete_produits_vrac_id_produits()
	{
			$id_produits_vc = $this->input->post('id_produits_vc');
			$this->produits_vrac_model->delete_produits_vrac_model($id_produits_vc);
	}
	
	function function_get_all_type_produits_vrac()
	{
			$list_pv=$this->produits_vrac_model->get_all_type_produits_vrac_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	
}
