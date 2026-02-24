<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Detail_dashboard_marches extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->model('dashboard_model');
		$this->load->model('regions_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => 'active','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
			
            $this->load->view('boc/detail_dashboard_marches_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function function_get_marche(){

		$data = array();
		$day = $this->input->get('sd');
		$v=',';
		$series='';
		$nb_marches=$this->dashboard_model->get_nb_marches_region_graph_model($day);
		$regions=$this->regions_model->get_all_regions_model();
		$nb =0;
		foreach ($regions as $region) {
		$key = array_search($region['id_region'], array_column($nb_marches, 'id_region'));
			if(is_numeric($key))
			{
				$series.='["'.$region['libelle_region_fr'].'",'.$nb_marches[$key]['nb_marche'].']'.$v;
				$nb+= $nb_marches[$key]['nb_marche'];
			}else{
				$series.='["'.$region['libelle_region_fr'].'",0]'.$v;
			}		
		}
		$data['nb_marches'] = $nb;
		$data['series'] = substr($series, 0, -1);
		list($d, $m, $y) = explode("/", $day);
		$nom_jour_fr = array('Sun'=>"Dimanche", 'Mon'=>"Lundi", 'Tue'=>"Mardi", 'Wed'=>"Mercredi", 'Thu'=>"Jeudi", 'Fri'=>"Vendredi", 'Sat'=>"Samedi");

		$mois_fr = Array('01'=>"janvier", '02'=>"février", '03'=>"mars", '04'=>"avril", '05'=>"mai", '06'=>"juin",'07'=>"juillet", '08'=>"août", 
        '09'=>"septembre", '10'=>"octobre", '11'=>"novembre", '12'=>"décembre");
		$data['labels'] = $nom_jour_fr[date('D', strtotime($y.'/'.$m.'/'.$d))].' '.$d.' '.$mois_fr[$m].' '.$y.'  '.date("G").'H : '.date("i").'MN';
		$this->load->view('boc/graph_marche_views', $data);
	}


}
