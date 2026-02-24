<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Panier extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('journal_tarif_model');
				$this->load->model('panier_model');
				
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data=array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>'','activepanier'=>'active',
				'activejournaltarifarchive'=>'','activeuser'=>'','activemarche'=>'',
				'activeanomalies'=>'','activeprodcon'=>'','activeentreprise'=>'',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
				$this->load->view('boc/panier_views',$data);
				}else{ header("Location:login");}				
	}
	
	public function function_view_panier_journal_tarif_by_date()
	{
		$date_jour = $this->input->get('dt');
		$data['date_jour']=$date_jour;
		$data['list_produit']=$this->journal_tarif_model->get_distinct_produit_by_date_model($date_jour);
		$data['list_marche']=$this->journal_tarif_model->get_all_marche_model();
		$this->load->view('boc/panier_journal_tarif_views',$data);		
	}
	
	function fun_set_panier()
	{
		$list_panier = $this->input->post('list_panier');
		$date_jour = $this->input->post('date_jour');
		$list_panier = explode(";", $list_panier);
		$this->panier_model->set_panier_by_0_model($date_jour);
		$result = count($list_panier);
			
			for($i = 0; $i < $result; $i++){
					$this->panier_model->set_panier_by_code_model($date_jour,$list_panier[$i]);
				}

	}
	

}
