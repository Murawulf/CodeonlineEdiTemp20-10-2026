<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Ccir extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('ccir_model');
				$this->load->model('regions_model');			
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => 'active', 'activegpc' => '','activeprodcont' => '','activenotif' => '','activeservice' => '');
						$data['list_regions']= $this->regions_model->get_all_regions_model();
						$data['regions']= json_encode($this->regions_model->get_all_regions_model2());
						$this->load->view('ccir_views',$data);			
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_all_ccir()
	{
			$list_ccirs=$this->ccir_model->get_all_ccir_model();
			//print_r($list_abonnes);
			$this->output->set_content_type('application/json')->set_output(json_encode($list_ccirs));					
	}
	
	public function function_get_region()
	{
		$list_regions= $this->regions_model->get_all_regions_model2();
		$this->output->set_content_type('application/json')->set_output(json_encode($list_regions));
	}
	
	public function add_ccir()
	{		
			 $data_ajouter_region = array(
				   'name' => $this->input->post('Libelle_ccir') ,
				   'lib_court' => $this->input->post('lib_court') ,
				   'adresse' => $this->input->post('adress_ccir') ,
				   'id_region' => $this->input->post('region_ccir') ,
				   'delegation' => $this->input->post('delegation_ccir') ,
				   'localite' => $this->input->post('localite_ccir') ,
				   'code_postal' => $this->input->post('code_postal_ccir') ,
				   'date_mis_a_jour_a' => date("Y-m-d H:i:s")
				);
			$id_ccir = $this->ccir_model->add_ccir_model($data_ajouter_region);
			$regions = explode(",", $this->input->post('mg_region'));

            foreach ($regions as $region) {
                $data_ajouter_ccir = array(
                    'id_ccir' => $id_ccir,
                    'id_region' => $region
                );

                $this->ccir_model->add_ccir_region_model($data_ajouter_ccir);
            }
	}
	
	public function function_delete_ccir_id()
	{
		$id_ccir = $this->input->post('id_ccir');
		$this->ccir_model->delete_ccir_model($id_ccir);
	}
	
	public function function_get_ccir_by_id() {
		$list_ccirs = $this->ccir_model->get_ccir_by_id_model($this->input->post('id_ccir'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_ccirs));
	}
	
	public function function_get_delegation__by_region() {
		$list_delegations = $this->regions_model->get_delegation_by_region_model($this->input->post('region'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_delegations));
	}
	
	public function function_get_localite_by_delegation_vrac(){
		$list_localites = $this->regions_model->function_get_localite_by_delegation_model($this->input->post('name_delegation'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_localites));
	}
	
	public function function_update_ccir()
	{
			$id_ccirM = $this->input->post('id_ccirM');
				
				$data_update_ccir = array(
				   'name' => $this->input->post('Libelle_ccirM') ,
				   'lib_court' => $this->input->post('lib_courtM') ,
				   'adresse' => $this->input->post('adress_ccirM') ,
				   'id_region' => $this->input->post('region_ccirM') ,
				   'delegation' => $this->input->post('delegation_ccirM') ,
				   'localite' => $this->input->post('localite_ccirM') ,
				   'code_postal' => $this->input->post('code_postal_ccirM') ,
				   'date_mis_a_jour_a' => date("Y-m-d H:i:s")
				);
			$this->ccir_model->update_ccir_model($data_update_ccir,$id_ccirM);
			$this->ccir_model->delete_ccir_region_model($id_ccirM);
			$regions = explode(",", $this->input->post('mg_regionM'));

            foreach ($regions as $region) {
                $data_ajouter_ccir = array(
                    'id_ccir' => $id_ccirM,
                    'id_region' => $region
                );

                $this->ccir_model->add_ccir_region_model($data_ajouter_ccir);
            }
	}
	

	
}
