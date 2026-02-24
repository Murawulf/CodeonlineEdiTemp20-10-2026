<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Marche extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('tarif_model');
				$this->load->model('regions_model');
				$this->load->model('municipalite_model');
                 
        }
		
	public function index()
	{ 
		if($this->session->userdata('name')!='')
		{
		$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
        'activejournaltarifarchive' => '', 'activeuser' => 'active', 'activepanier' => '',
        'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
		'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
			if( $this->session->userdata('profil') == '1'){
				$data['list_regions']= $this->tarif_model->get_all_region_model();
				$data['list_municipalites']= $this->municipalite_model->get_all_municipalites_model();
				$this->load->view('boc/marche_views',$data);
			}else{$this->load->view('boc/marche_inc_views',$data);}
		}else{ header("Location:login");}			
	}
	 
	public function function_get_all_marche()
	{
			$list_marches=$this->regions_model->get_all_marche_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_marches));					
	}
	
	public function add_marche()
	{		
			 $data_ajouter_marche = array(
				   'libelle_marche_fr' => $this->input->post('marche_fr') ,
				   'libelle_marche_ar' => $this->input->post('marche_ar')  ,
				   'id_region' => $this->input->post('region') ,
				   'id_municpalite_ref' => $this->input->post('municipalite') ,
				   'marche_lat' => $this->input->post('marche_lat') ,
				   'status' => $this->input->post('statut_marche') ,
				   'tolerance'=>$this->input->post('tolerance'),
				   'marche_long' => $this->input->post('marche_long')  ,
				   'date_mis_a_jour_m' => date("Y-m-d H:i:s")
				);
			$this->regions_model->add_marche_model($data_ajouter_marche);			
	}
	
	public function function_delete_marche_id()
	{
		$id_marche = $this->input->post('id_marche');
		$this->regions_model->delete_marche_model($id_marche);
	}
	
	public function function_update_marche()
	{
		$id_marcheM=$this->input->post('id_marcheM');
				$data_update_marche = array(
				   'libelle_marche_fr' => $this->input->post('marche_frM') ,
				   'libelle_marche_ar' => $this->input->post('marche_arM') ,
				   'id_region' => $this->input->post('id_regionM')  ,
				   'marche_lat' => $this->input->post('marche_latM') ,
				   'status' => $this->input->post('statut_marcheM') ,
				   'id_municpalite_ref' => $this->input->post('id_municipaliteM') ,
				   'tolerance'=>$this->input->post('toleranceM'),
				   'marche_long' => $this->input->post('marche_longM'),
					'date_mis_a_jour_m' => date("Y-m-d H:i:s")
				);
			
			$this->regions_model->update_marche_id_marche_model($id_marcheM,$data_update_marche);	
	}
	
}
