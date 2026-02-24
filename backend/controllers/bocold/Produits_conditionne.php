<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Produits_conditionne extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('produits_conditionne_model');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>'','activepanier'=>'',
				'activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'','activeprodcon'=>'active','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
				//$data['segments']=$this->produits_conditionne_model->get_all_segment_model();
				//$data['origines']=$this->produits_conditionne_model->get_all_origine_model();
				//$data['fabricants']=$this->produits_conditionne_model->get_all_fabricant_model();
				$this->load->view('boc/Produits_conditionne_views',$data);
				}else{ header("Location:login");}
				
	}
	
	public function function_get_all_produit_conditionne()
	{

			$list_pv=$this->produits_conditionne_model->get_all_produits_conditionne_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));

	}
	
	public function function_get_all_classe_by_code_segment()
	{
		$code_segment = $this->input->post('code_segment');
		$list_classe=$this->produits_conditionne_model->get_classe_code_segmen_model($code_segment);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_classe));
	}
	
	public function function_get_all_classe_by_code_classe()
	{
		$code_classe = $this->input->post('code_classe');
		$list_brique=$this->produits_conditionne_model->get_brique_code_classe_model($code_classe);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_brique));
	}
	
	public function update_produit_vrac()
	{
		$id_produits_vrac=$this->input->post('id_produits_vracM');
				$data_update_va = array(
				   'code_tarif_produit' => $this->input->post('code_tarif_produitM') ,
				   'id_type_prod_vrac' => $this->input->post('id_type_prod_vracM') ,
				   'libelle_court_fr' => $this->input->post('libelle_court_frM')  ,
				   'libelle_court_ar' => $this->input->post('libelle_court_arM') ,
				   'libelle_court_en' => $this->input->post('libelle_court_enM')  ,
				   'poids_usage' => $this->input->post('poids_usageM') ,
				   'type_mesure' => $this->input->post('type_mesureM') ,
				   'url_icons' => $this->input->post('url_iconsM') ,
					'date_mis_a_jour_vc' => date("Y-m-d H:i:s")
				   //'logo_produit ' => $new_path ,
				   //'id_fournisseur_produit' => $id_fournisseur_light  ,
				   //'date_mis_a_jour' => date("Y-m-d H:i:s")  ,
				   //'poidvariable' => $poids_variable 
				);
			
			$this->produits_vrac_model->update_produits_vrac_id_produit_model($id_produits_vrac,$data_update_va);	
	}
	
	public function add_produit_conditionne()
	{
		if (!empty($_FILES)){
					$tmp_name = $_FILES["imageproduit_fp"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["imageproduit_fp"]["name"];
					$upload_path = "images/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."_img." . $extension;
						$new_path	= "images/".$xname ;
						rename($upload_path, $new_path);
						$xname      = base_url()."images/".$date."_img." . $extension;
						
					}					
				}
			}else{$xname="pas-de-photo.jpg";}
		
		$data_ajouter_info_inco = array(
				   'urlImage ' => $xname ,
				   'allergenDesc' => $this->input->post('allergenes_pf') ,
				   'ingredientDesc' => $this->input->post('ingredients_pf') ,
				   'nutriments' => $this->input->post('nutriments_pf') ,
				   'mode_emploi' => $this->input->post('modeemploi_pf') ,
					'composition' => $this->input->post('composition') ,
					'infos_techniques' => $this->input->post('infos_techniques') ,
					'efficacite_eco' => $this->input->post('efficacite_eco') ,
					'qualite_environnement' => $this->input->post('qualite_environnement'),
					'p_origine' => 'Tunisia'
				   );
		$id_fp_inco = $this->produits_conditionne_model->add_info_inco_produits_conditionne_model($data_ajouter_info_inco);		   
		$data_ajouter_fp = array(
				   'gtin' => $this->input->post('GTIN') ,
				   'libelle' => $this->input->post('libelle_prod') ,
				   'brand' => $this->input->post('marque_prod')  ,
				   'description' => $this->input->post('description_pf') ,
				   'codeClasse' => $this->input->post('code_classe') ,
				   'brique' => $this->input->post('code_brique') ,
				   'id_pays' => $this->input->post('origine') ,
				   'idEntreprise' => $this->input->post('fabricant') ,
				   'prix_min' => $this->input->post('prix_pub_min') ,
				   'prix_max' => $this->input->post('prix_pub_max') ,
				   'idInco' => $id_fp_inco,
				   'date_mis_a_jour_fp' => date("Y-m-d H:i:s")
				   );
		$id_fp = $this->produits_conditionne_model->add_produits_conditionne_model($data_ajouter_fp);
		
		if (!empty($_FILES)){
					$tmp_name = $_FILES["imageproduit_label_bio"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["imageproduit_label_bio"]["name"];
					$upload_path = "images/labels/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."_imgbio." . $extension;
						$new_path	= "images/labels/".$xname ;
						rename($upload_path, $new_path);
						$xname      = base_url()."images/labels/".$date."_imgbio." . $extension;
						
					}					
				}
			}else{$xname="pas-de-photo.jpg";}
			
		$data_ajouter_lb_bio = array(
				   'certifName' => $this->input->post('nom_label_bio') ,
				   'certif_img ' => $xname ,
				   );
		$id_bio = $this->produits_conditionne_model->add_Label_bio_model($data_ajouter_lb_bio);
		$data_ajouter_lb_bio_inco = array(
				   'idCertif' => $id_bio ,
				   'idInco' => $id_fp_inco ,
				   );
		$this->produits_conditionne_model->add_Label_bio_inco_model($data_ajouter_lb_bio_inco);
	}
	
	public function function_delete_produits_conditionne_id_produits()
	{
			$id_produits_fp = $this->input->post('id_produits_fp');
			$this->produits_conditionne_model->delete_produits_conditionne_model($id_produits_fp);
	}
	
	function function_get_all_type_produits_vrac()
	{
			$list_pv=$this->produits_vrac_model->get_all_type_produits_vrac_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	
}
