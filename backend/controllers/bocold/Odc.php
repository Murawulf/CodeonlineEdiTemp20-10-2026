<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Odc extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('odc_model');
				$this->load->model('regions_model');              
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>'','activepanier'=>'',
				'activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'','activeprodcon'=>'','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '','activeodc'=>'active');
				$data['anomalies_type']=$this->odc_model->anomalies_type_odc_model();
				$data['regions'] = $this->regions_model->get_all_regions_model();
				$this->load->view('boc/odc_anomalie_views',$data);
				}else{ header("Location:login");}
				
	}
	
	public function function_get_all_produit_vrac()
	{
		if($this->session->userdata('profil') == 11 || $this->session->userdata('profil') == 10){
			$list_pv=$this->produits_vrac_model->get_produits_poissons_vrac_model();
		}else{$list_pv=$this->produits_vrac_model->get_all_produits_vrac_model();}
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));

	}
	
	public function add_anomalie_odc()
	{
			
			if (!empty($_FILES)){
					$tmp_name = $_FILES["image_a"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["image_a"]["name"];
					$upload_path = "assets/odc/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."." . $extension;
						$new_path	= "assets/odc/".$xname ;
						rename($upload_path, $new_path);
						$new_path	= "/odc/".$xname ;
						
					}					
				}
			}else{$new_path="pas-de-photo.jpg";}
			
			 $data_ajouter_anomalie = array(
				   'id_type_anomalie' => $this->input->post('id_type_anomalie') ,
				   'id_user' => $this->session->userdata('id_user')  ,
				   'date_anomalie' => date("Y-m-d"),
				   'heure_anomalie' => date("H:i"),
				   'url_image' => $new_path ,
				   'source_anomalie' => '1',
				   'commentaire' => $this->input->post('commentaire'),
				   'long_anomalie' => $this->input->post('longitude') ,
				   'lati_anomalie' => $this->input->post('latitude') ,
				   'region_anomalie' => $this->input->post('id_region') ,
				   'date_mis_a_jour_odc' => date("Y-m-d H:i:s")
				);
			$this->odc_model->add_anomalie_odc_model($data_ajouter_anomalie);			
	}
	
	public function function_get_anomalies_odc()
	{
		$list_anomalies_odc=$this->odc_model->get_all_anomalies_odc_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_anomalies_odc));
	}
	
	public function function_get_anomalie_odc_by_id_anomalie_odc()
	{
			$anomalie_odc = $this->odc_model->get_anomalie_odc_by_id_anomalie_odc_model($this->input->post('id_journ_anomalie_odc'));
			$this->output->set_content_type('application/json')->set_output(json_encode($anomalie_odc)); 
	}
	
	public function update_anomalie_odc()
	{
		
		$id_anomalie=$this->input->post('id_anomalieM');
		
		if (!empty($_FILES)){
					$tmp_name = $_FILES["image_aM"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["image_aM"]["name"];
					$upload_path = "assets/odc/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."." . $extension;
						$new_path	= "assets/odc/".$xname ;
						rename($upload_path, $new_path);
						$new_path	= "/odc/".$xname ;
						
					}					
				}
			 $data_update_anomalie = array(
				   'id_type_anomalie' => $this->input->post('id_type_anomalieM') ,
				   'id_user' => $this->session->userdata('id_user')  ,
				   'url_image' => $new_path ,
				   'source_anomalie' => '1',
				   'commentaire' => $this->input->post('commentaireM'),
				   'long_anomalie' => $this->input->post('longitudeM') ,
				   'lati_anomalie' => $this->input->post('latitudeM') ,
				   'region_anomalie' => $this->input->post('id_regionM') ,
				   'date_mis_a_jour_odc' => date("Y-m-d H:i:s")
				);
			}else{
				$data_update_anomalie = array(
				   'id_type_anomalie' => $this->input->post('id_type_anomalieM') ,
				   'id_user' => $this->session->userdata('id_user')  ,
				   'source_anomalie' => '1',
				   'commentaire' => $this->input->post('commentaireM'),
				   'long_anomalie' => $this->input->post('longitudeM') ,
				   'lati_anomalie' => $this->input->post('latitudeM') ,
				   'region_anomalie' => $this->input->post('id_regionM') ,
				   'date_mis_a_jour_odc' => date("Y-m-d H:i:s")
				);
				}
			
			
			$this->odc_model->update_anomalie_odc_model($data_update_anomalie,$id_anomalie);	
	}

	public function function_delete_anomalie_id_a()
	{
			$this->odc_model->delete_anomalie_odc_model($this->input->post('id_a'));
	}
	
	
}
