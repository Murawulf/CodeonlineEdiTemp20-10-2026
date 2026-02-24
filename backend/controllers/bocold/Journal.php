<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Journal extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->library('encrypt');
		$this->load->model('regions_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '', 'activepanier' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activemarche' => '',
				'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => 'active');
				$data['date_jour'] = date("d/m/Y");
				if ($this->session->userdata('profil') == '10') {$data['list_regions'] = $this->regions_model->get_all_regions_mgp_model();}else{$data['list_regions']= $this->regions_model->get_all_regions_model();}
				
                $this->load->view('boc/Journal_tarif_onap_views', $data);
			
        } else {
            header("Location:login");
        }
    }
}
