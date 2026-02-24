<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Notif extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('notif_model');
				$this->load->model('regions_model');			
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
					switch ($this->session->userdata('profil')) {
						case 1:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => '','activenotif' => 'active','header'=>'headerbof','activeservice' => '');
							break;
						case 4:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => '','activenotif' => 'active','header'=>'headercepex','activeservice' => '');
							break;
						case 5:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => '','activenotif' => 'active','header'=>'headercepex','activeservice' => '');
							break;
					}
				
						//$data['ccirs']= $this->ccir_model->get_all_ccirs_model();
						//$data['profils']= $this->ccir_model->get_all_profil_ccirs_model();
						$this->load->view('notif_views',$data);		
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_all_notifs()
	{
			$list_notifs=$this->notif_model->get_all_notif_model();

			$this->output->set_content_type('application/json')->set_output(json_encode($list_notifs));					
	}

	public function add_notif()
	{		

		 $data_ajouter_notif = array(
		   'titre_notif_ar' => $this->input->post('titre_notif_ar') ,
		   'texte_notif_ar' => $this->input->post('texte_notif_ar') ,
		   'titre_notif_fr' => $this->input->post('titre_notif_fr') ,
		   'texte_notif_fr' => $this->input->post('texte_notif_fr') ,
		   'titre_notif_en' => $this->input->post('titre_notif_en') ,
		   'texte_notif_en' => $this->input->post('texte_notif_en') ,
		   'date_notif' => date("m-d-Y")
		);
		
		$this->notif_model->add_notif_model($data_ajouter_notif);
	}
	
	public function function_update_notif()
	{
		
			 $data_update_notif = array(
					'titre_notif_ar' => $this->input->post('titre_notif_arM') ,
					'texte_notif_ar' => $this->input->post('texte_notif_arM') ,
					'titre_notif_fr' => $this->input->post('titre_notif_frM') ,
					'texte_notif_fr' => $this->input->post('texte_notif_frM') ,
					'titre_notif_en' => $this->input->post('titre_notif_enM') ,
					'texte_notif_en' => $this->input->post('texte_notif_enM') ,
				   'date_m_notif' => date("m-d-Y")
				);

		$this->notif_model->update_notif_model($data_update_notif,$this->input->post('id_notifM'));
	}
	
	public function function_get_notif_by_id()
	{
		$notif=$this->notif_model->get_notif_by_id_model($this->input->post('id_notif'));
		$this->output->set_content_type('application/json')->set_output(json_encode($notif));
	}
	
	public function function_delete_notif_id()
	{
		$this->notif_model->delete_notif_by_id_model($this->input->post('id_notif'));
	}
	

	

	
	
}
