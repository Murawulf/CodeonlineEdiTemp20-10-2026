<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Anomalies_p_conditione extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('anomalies_p_conditione_model');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>''
				,'activepanier'=>'','activejournaltarifarchive'=>'','activeuser'=>'',
				'activemarche'=>'','activeanomalies'=>'active','activeprodcon'=>'','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
				$this->load->view('boc/anomalies_p_conditione_views',$data);
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_all_anomalies_p_conditione()
	{
			$list_get_all_anomalies_p_vrac=$this->anomalies_p_conditione_model->get_all_anomalies_p_conditione_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_get_all_anomalies_p_vrac));					
	}

	
}
