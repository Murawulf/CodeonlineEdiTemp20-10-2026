<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Anomalies_p_vrac extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('anomalies_p_vrac_model');
				$this->load->model('regions_model');
				$this->load->model('municipalite_model');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>''
				,'activepanier'=>'','activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'active','activeprodcon'=>'','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
				$data['date']=date("d/m/Y");
				$this->load->view('boc/anomalies_p_vrac_views',$data);
				}else{ header("Location:login");}		
	}
	
	public function anomalies_map()
	{
		$dates = explode('/', $this->input->get('date_anomalies'));
        $d = $dates[0];
        $m = $dates[1];
        $y = $dates[2];
        $date_journ_en = $y . '/' . $m . '/' . $d;
		switch ($this->session->userdata('profil')) {
			case 1:
				$data['id_profil']=1;
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac($date_journ_en);
				//print_r($data['anomalies']);
				$data['region_lat'] = 33.808888;
				$data['region_long'] = 9.393932;
				$data['region_zoom'] = 6;
				break;
			case 3:
				$data['id_profil']=3;
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac($date_journ_en);
				$data['region_lat'] = 33.808888;
				$data['region_long'] = 9.393932;
				$data['region_zoom'] = 6;
				break;
			case 4:
				$data['id_profil']=4;
				$regions=$this->regions_model->get_region_byid_model($this->session->userdata('region'));
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac_by_region($date_journ_en,$regions['maps_name']);
				$data['region_lat'] = $regions['region_lat'];
				$data['region_long'] = $regions['region_long'];
				$data['region_zoom'] = $regions['region_zoom'];
				break;
			case 2:
				$data['id_profil']=2;
				$municipalite=$this->municipalite_model->get_municipalite_maps_name_model($this->session->userdata('id_user'));
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac_by_municipalite($date_journ_en,$municipalite['ville_maps'],$municipalite['ville_maps_value']);
				$data['region_lat'] = 33.808888;
				$data['region_long'] = 9.393932;
				$data['region_zoom'] = 6;
				break;
			case 8:
				$data['id_profil']=3;
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac($date_journ_en);
				$data['region_lat'] = 33.808888;
				$data['region_long'] = 9.393932;
				$data['region_zoom'] = 6;
				break;
			case 9:
				$data['id_profil']=3;
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac($date_journ_en);
				$data['region_lat'] = 33.808888;
				$data['region_long'] = 9.393932;
				$data['region_zoom'] = 6;
				break;
		}
		
		$this->load->view('boc/slot_map_anomalies_p_vrac',$data);
	}
	public function function_get_all_anomalies_p_vrac()
	{
			$list_get_all_anomalies_p_vrac=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_get_all_anomalies_p_vrac));					
	}
	
	public function anomalies_tarif_non_conforme()
	{
		$dates = explode('/', $this->input->get('date_anomalies'));
        $d = $dates[0];
        $m = $dates[1];
        $y = $dates[2];
        $date_journ_en = $y . '/' . $m . '/' . $d;
		$data['profil']=$this->session->userdata('profil');
		switch ($this->session->userdata('profil')) {
			case 1:
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_by_type_p_vrac($date_journ_en,2);
				break;
			case 3:
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_by_type_p_vrac($date_journ_en,2);
				break;
			case 4:
				$regions=$this->regions_model->get_region_byid_model($this->session->userdata('region'));
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac_by_region($date_journ_en,$regions['maps_name']);
				break;
			case 2:
				$municipalite=$this->municipalite_model->get_municipalite_maps_name_model($this->session->userdata('id_user'));
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_p_vrac_by_municipalite($date_journ_en,$municipalite['ville_maps'],$municipalite['ville_maps_value']);
				break;
			case 8:
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_by_type_p_vrac($date_journ_en,2);
				break;
			case 9:
				$data['anomalies']=$this->anomalies_p_vrac_model->get_all_anomalies_by_type_p_vrac($date_journ_en,2);
				break;
		}
		$this->load->view('boc/slot_tab_anomalies_Tarif_non_conforme',$data);
	}
	
	
}
