<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Home_ccir extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
		$this->load->model('regions_model');
		$this->load->model('companies_model');
;
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => 'active', 'activeprodcon' => '', 'activegpcccir' => '');
			$data['list_regions']= $this->regions_model->get_all_regions_model();
			$data['OCompanie']= $this->companies_model->get_entreprise_model($this->session->userdata('id_user'));
			$data['Oinforegion']= [];
			if ($this->session->userdata('region') != '') {
				
				$data['Oinforegion']= $this->regions_model->get_region_delegation_model($this->session->userdata('region'));
				$data['delegations']= $this->regions_model->get_delegation_by_region_model($data['Oinforegion']['id_region']);
				$data['localites']= $this->regions_model->function_get_localite_by_delegation_model($data['Oinforegion']['delegation']);
			}
            $this->load->view('home_ccir_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function update_entreprise()
	{		
			 $data_update_ept = array(
				   'raison_socialle' => $this->input->post('raison_socialle') ,
				   'adresse' => $this->input->post('adresse')  ,
				   'email' => $this->input->post('email') ,
				   'personne_contact' => $this->input->post('personne_contact') ,
				   'gln' => $this->input->post('gln') ,
				   'telephone' => $this->input->post('telephone') ,
				   'site' => $this->input->post('site') ,
				   'pwd' => sha1($this->input->post('pwd')),
				   'pays' => 788,
				   'postalCode' => $this->input->post('postalCode') ,
				   'city' => $this->input->post('delegation') ,
				   'localite' => $this->input->post('localite') 
				);
			$this->companies_model->update_entreprise_model($this->input->post('id_comp'),$data_update_ept);			
	}
}
