<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Trafic_mobile extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
		$this->load->model('regions_model');
		$this->load->model('municipalite_model');
		$this->load->model('trafic_mobile_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => 'active','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
			if ($this->session->userdata('profil') == '1') {
				$data['regions']=$this->regions_model->get_all_regions_model();
				//$datam[] = array('id' => 0,'name' => 'Tout les municipalites');
				//$data['municipalites']= json_encode($datam);
				//$data['marches']= json_encode(array('id' => 0,'name' => 'Tout les marches'));				
				}			
			//$data['profil']=$this->session->userdata('profil');
			
            $this->load->view('boc/trafic_mobile_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function function_get_graoh_trafic_mobile(){
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$region = $this->input->get('r');
		$municipalite = $this->input->get('mu');
		$marche = $this->input->get('m');
		$start_day = $this->input->get('sd');
		$end_day = $this->input->get('ed');
		$v=',';
		$series='';
		//echo 'region : '.$region. ' muni '.$municipalite.' mar '.$marche. ' s '.$start_day.' e '.$end_day;
		if($region == 0)//Tout les regions
		{
			$trafic_mobiles_vrac=$this->trafic_mobile_model->get_trafic_all_region_graph_model($start_day,$end_day);
			$date='';
				foreach ($trafic_mobiles_vrac as $trafic) {
					list($y, $m, $d) = explode("/", $trafic['date_track']);
					$m = $m-1;
					$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$trafic['sum_track'].']'.$v;	
				}
				$date = substr($date, 0, -1);
				$series.='{name: "Tout region",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
				$data['series']=substr($series, 0, -1);
				
				//$data['marche']= 'Trafic mobile sur la Période '.$start_day.' à '.$end_day;
			
		}else{//spec region
			$reg=$this->regions_model->get_region_byid_model($region);
			$date='';
				if($municipalite == '')
				{
					$trafic_mobiles_vrac=$this->trafic_mobile_model->get_trafic_all_region_graph_by_region_model($region,$start_day,$end_day);
					foreach ($trafic_mobiles_vrac as $trafic) {
						list($y, $m, $d) = explode("/", $trafic['date_track']);
						$m = $m-1;
						$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$trafic['sum_track'].']'.$v;	
					}
					$date = substr($date, 0, -1);
					$series.='{name: "'.$reg['libelle_region_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
				}elseif(($municipalite != '')&&($marche == ''))
					{
							if(mb_substr_count($municipalite, ",") != 0){
								$list_municipalite = explode(",", $municipalite);
								foreach ($list_municipalite as $municip) 
								{
									$trafic_mobiles_vrac=$this->trafic_mobile_model->get_trafic_all_region_graph_by_municipalite_model($municip,$start_day,$end_day);
									$date='';
									$l_municipalite=$this->municipalite_model->get_municipalite_by_id_model($municip);
										foreach ($trafic_mobiles_vrac as $trafic) {
											list($y, $m, $d) = explode("/", $trafic['date_track']);
											$m = $m-1;
											$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$trafic['sum_track'].']'.$v;	
											}
											$date = substr($date, 0, -1);
											$series.='{name: "'.$l_municipalite['libelle_municipalite_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
								}
						}else{
							$trafic_mobiles_vrac=$this->trafic_mobile_model->get_trafic_all_region_graph_by_municipalite_model($municipalite,$start_day,$end_day);
							$l_municipalite=$this->municipalite_model->get_municipalite_by_id_model($municipalite);
							foreach ($trafic_mobiles_vrac as $trafic) {
							list($y, $m, $d) = explode("/", $trafic['date_track']);
							$m = $m-1;
							$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$trafic['sum_track'].']'.$v;	
							}
							$date = substr($date, 0, -1);
							$series.='{name: "'.$l_municipalite['libelle_municipalite_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
						}
						
					}elseif(($municipalite != '')&&($marche != '')){
							if(mb_substr_count($marche, ",") != 0){
								$list_marche = explode(",", $marche);
								foreach ($list_marche as $mar) 
								{
									$trafic_mobiles_vrac=$this->trafic_mobile_model->get_trafic_all_region_graph_by_marche_model($mar,$start_day,$end_day);
									$date='';
									$l_marche=$this->regions_model->get_marche_region_by_id_model($mar);
										foreach ($trafic_mobiles_vrac as $trafic) {
											list($y, $m, $d) = explode("/", $trafic['date_track']);
											$m = $m-1;
											$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$trafic['sum_track'].']'.$v;	
											}
											$date = substr($date, 0, -1);
											$series.='{name: "'.$l_marche['libelle_region_fr'].'.'.$l_marche['libelle_marche_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
								}
							}else{
								$trafic_mobiles_vrac=$this->trafic_mobile_model->get_trafic_all_region_graph_by_marche_model($marche,$start_day,$end_day);
								$l_marche=$this->regions_model->get_marche_region_by_id_model($marche);
								foreach ($trafic_mobiles_vrac as $trafic) {
								list($y, $m, $d) = explode("/", $trafic['date_track']);
								$m = $m-1;
								$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$trafic['sum_track'].']'.$v;	
								}
								$date = substr($date, 0, -1);
								$series.='{name: "'.$l_marche['libelle_region_fr'].' - '.$l_marche['libelle_marche_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;						
							}
						}
		}
		$data['series']=substr($series, 0, -1);	
		$data['subtitle'] = 'Trafic mobile sur la Période '.$start_day.' à '.$end_day;
		$this->load->view('boc/slot_trafic_mobile_graph_views', $data);
	}
	
	public function function_get_municipalites_by_region(){
		$municipalites=$this->municipalite_model->get_magicsuggest_municipalite_by_region_model($this->input->post('id_region'));
		$this->output->set_content_type('application/json')->set_output(json_encode($municipalites));
	}
	
	public function function_get_marche_by_municipalites(){
		$pos = strpos($this->input->get('id'), ',');
		if ($pos === false) {
			$marches=$this->municipalite_model->get_magicsuggest_marche_by_municipalites_model($this->input->get('id'));
		} else {
			$id_municipalites = explode(",", $this->input->get('id'));
			$marches=$this->municipalite_model->get_magicsuggest_marche_by_municipalites_model($id_municipalites);
		}	
		$this->output->set_content_type('application/json')->set_output(json_encode($marches));
	}


}
