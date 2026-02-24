<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Sim extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('logistique_model');		
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '','activesim'=>'active','activecontrat' => '', 'activephone'=> '');
						//$data['regions']= $this->regions_model->get_all_regions_model();
						//$data['municipalites']= $this->municipalite_model->get_all_municipalites_model();
						$this->load->view('boc/sim_views',$data);			
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_sim()
	{
			$this->output->set_content_type('application/json')->set_output(json_encode($this->logistique_model->get_all_sim_model()));					
	}
	
	public function function_get_marche_gros()
	{
		$id_marches= $this->regions_model->get_marches_gros_model2();
		$this->output->set_content_type('application/json')->set_output(json_encode($id_marches));
	}
	
	public function add_sim()
	{		
			 $data_ajouter_sim = array(
				   'no_puce' => $this->input->post('no_puce') ,
				   'no_appel' => $this->input->post('no_appel') ,
				   'date_reception' => $this->input->post('date_reception')  ,
				   'no_bl_tt_s' => $this->input->post('no_bl_tt_s')  ,
				   'date_mise_ajoute' => date("Y-m-d H:i:s")
				);
			$this->logistique_model->add_sim_model($data_ajouter_sim);
	}
	
	public function function_update_sim()
	{
		$data_M_sim = array(
				   'no_puce' => $this->input->post('no_puceM') ,
				   'no_appel' => $this->input->post('no_appelM') ,
				   'date_reception' => $this->input->post('date_receptionM')  ,
				   'no_bl_tt_s' => $this->input->post('no_bl_tt_sM')  ,
				   'date_mise_ajoute' => date("Y-m-d H:i:s")
				);
			$this->logistique_model->update_sim_model($data_M_sim,$this->input->post('id_simM'));
	}
	

	
	public function function_delete_sim()
	{
		$this->logistique_model->delete_sim_model($this->input->post('id_sim'));
	}

	
}
