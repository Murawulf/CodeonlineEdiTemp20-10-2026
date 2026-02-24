<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Handset extends CI_Controller {

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
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '','activesim'=>'','activecontrat' => '', 'activephone'=> 'active');
						//$data['regions']= $this->regions_model->get_all_regions_model();
						//$data['municipalites']= $this->municipalite_model->get_all_municipalites_model();
						$this->load->view('boc/handset_views',$data);			
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_handset()
	{
			$this->output->set_content_type('application/json')->set_output(json_encode($this->logistique_model->get_all_handset_model()));					
	}

	
	public function add_handset()
	{		
			 $data_ajouter_handset = array(
				   'marque_handset' => $this->input->post('marque_handset') ,
				   'modele_handset' => $this->input->post('modele_handset')  ,
				   'IMEI' => $this->input->post('IMEI') ,
				   'date_reception_handset' => $this->input->post('date_reception_handset')  ,
				   'no_bl_tt_h' => $this->input->post('no_bl_tt_h')  ,
				   'date_mise_ajour' => date("Y-m-d H:i:s")
				);
			$this->logistique_model->add_handset_model($data_ajouter_handset);
	}
	
	public function function_update_handset()
	{
		 $data_M_handset = array(
				   'marque_handset' => $this->input->post('marque_handsetM') ,
				   'modele_handset' => $this->input->post('modele_handsetM')  ,
				   'IMEI' => $this->input->post('IMEIM') ,
				   'date_reception_handset' => $this->input->post('date_reception_handsetM')  ,
				   'no_bl_tt_h' => $this->input->post('no_bl_tt_hM')  ,
				   'date_mise_ajour' => date("Y-m-d H:i:s")
				);
			$this->logistique_model->update_handset_model($data_M_handset,$this->input->post('id_handsetM'));
	}
	

	
	public function function_delete_handset()
	{
		$this->logistique_model->delete_handset_model($this->input->post('id_handset'));
	}

	
}
