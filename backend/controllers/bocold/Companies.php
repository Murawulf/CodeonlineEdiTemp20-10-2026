<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Companies extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('companies_model');
				$this->load->model('regions_model');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>'','activepanier'=>''
				,'activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'','activeprodcon'=>'','activeentreprise'=>'active',
				'activedashboard' => '','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
				$data['list_regions']= $this->regions_model->get_all_regions_model();
				$this->load->view('boc/companies_views',$data);
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_all_entreprises()
	{
			
		$list_get_all_entreprises=$this->companies_model->get_all_entreprises_model();
		$this->output->set_content_type('application/json')->set_output(json_encode($list_get_all_entreprises));					
	}
	
	public function function_get_delegation_by_region()
	{
		$list_delegations = $this->regions_model->get_delegation_by_region_model($this->input->post('id_region'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_delegations));
	}
	
	public function function_get_localite_by_delegation()
	{
		$list_localites = $this->regions_model->function_get_localite_by_delegation_model($this->input->post('name_delegation'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_localites));
	}
	
	public function add_entreprises()
	{		
			 $data_ajouter_ept = array(
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
				   'date_create' => date("Y-m-d H:i:s")
				);
			$this->companies_model->add_entreprises_model($data_ajouter_ept);			
	}
	
	public function update_entreprises()
	{
		$id_entreprise=$this->input->post('id_entreprise');
		$pwd = $this->input->post('pwd_M');
			if(!empty($pwd))
			{
			$data_ajouter_eptm = array(
				   'nom' => $this->input->post('raison_sociale_M') ,
				   'adresse' => $this->input->post('adresse_M')  ,
				   'email' => $this->input->post('email_M') ,
				   'prenom' => $this->input->post('login_M') ,
				   'password' => sha1($this->input->post('pwd_M')),
				   'date_mis_a_jour_npt' => date("Y-m-d H:i:s")
				);
			}else{
				$data_ajouter_eptm = array(
				   'nom' => $this->input->post('raison_sociale_M') ,
				   'adresse' => $this->input->post('adresse_M')  ,
				   'email' => $this->input->post('email_M') ,
				   'prenom' => $this->input->post('login_M') ,
				   'date_mis_a_jour_npt' => date("Y-m-d H:i:s")
				);
			}
			$this->entreprises_model->update_entreprise_model($id_entreprise,$data_ajouter_eptm);	
	}
	
	
	
	public function function_delete_entreprise_id_entreprise()
	{
			$id_ep = $this->input->post('id_ep');
			$this->entreprises_model->delete_entreprise_model($id_ep);
	}
	
	function function_get_producteur_by_id()
	{
			$id_ept = $this->input->post('id_ept');
			$list_ep=$this->companies_model->get_entreprise_model($id_ept);
			$this->output->set_content_type('application/json')->set_output(json_encode($list_ep));
	}
	
	
}
