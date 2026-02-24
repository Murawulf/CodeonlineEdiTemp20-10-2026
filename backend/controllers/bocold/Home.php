<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Home extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->model('users_model');
        $this->load->model('regions_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => 'active', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'','activejournaltarifcrd' => '', 'activeodc'=> '','activesim'=>'','activecontrat' => '', 'activephone'=> '');
            /*$data['profils'] = $this->users_model->get_all_profil_model();
			$data['regions'] = $this->regions_model->get_all_regions_model();*/
            $this->load->view('boc/home_views', $data);
        } else {
            header("Location:login");
        }
    }
}
