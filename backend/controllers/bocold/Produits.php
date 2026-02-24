<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Produits extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('produits_vrac_model');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'active','activetarif'=>'','activejournaltarif'=>'','activepanier'=>'',
				'activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'','activeprodcon'=>'','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
				$this->load->view('boc/Produits_ONAP_views',$data);
				}else{ header("Location:login");}
				
	}
	
	public function function_get_all_produit_vrac()
	{

			$list_pv=$this->produits_vrac_model->get_all_produits_vrac_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));

	}
	
	public function function_get_produits_vrac_by_id_produits()
	{
		$id_produit = $this->input->post('id_produit_ref');
		$list_p=$this->produits_vrac_model->get_produits_vrac_by_id_model($id_produit);
			$this->output->set_content_type('application/json')->set_output(json_encode($list_p));
	}
	
	public function update_produit_saison_vrac()
	{
		$id_produits_vrac=$this->input->post('id_produits_vracM');
		
				$data_update_va = array(
				   'ete' => $this->input->post('saisonM') ,
				   'date_mis_a_jour_vc' => date("Y-m-d H:i:s"));
	
			$this->produits_vrac_model->update_produits_vrac_id_produit_model($id_produits_vrac,$data_update_va);	
	}
	
	function function_get_all_type_produits_vrac()
	{
			$list_pv=$this->produits_vrac_model->get_all_type_produits_vrac_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	
}
