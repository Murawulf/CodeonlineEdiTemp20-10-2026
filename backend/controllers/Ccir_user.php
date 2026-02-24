<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Ccir_user extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('ccir_model');
				$this->load->model('regions_model');			
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => 'active', 'activegpc' => '','activeprodcont' => '','activenotif' => '','activeservice' => '');
						$data['ccirs']= $this->ccir_model->get_all_ccirs_model();
						$data['profils']= $this->ccir_model->get_all_profil_ccirs_model();
						$this->load->view('ccir_users_views',$data);		
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_all_users_ccir()
	{
			$list_users_ccir=$this->ccir_model->get_all_user_ccir_model();

			$this->output->set_content_type('application/json')->set_output(json_encode($list_users_ccir));					
	}

	public function add_user_ccir()
	{		
			 if($this->input->post('ccir_profil')!=3)
			 {
			 $data_ajouter_ccir_user = array(
				   'ccir_nom_user' => $this->input->post('ccir_nom_user') ,
				   'ccir_user_email' => $this->input->post('ccir_user_email') ,
				   'pwd' => sha1($this->input->post('ccir_user_pass'))  ,
				   'id_profil' => $this->input->post('ccir_profil')  ,
				   'phone' => $this->input->post('ccir_user_phone')  ,
				   'id_ccir' => $this->input->post('ccir_user')  ,
				   'date_m_a_j_user_ccir' => date("Y-m-d H:i:s")
				);
			 }else{
				 $data_ajouter_ccir_user = array(
				   'ccir_nom_user' => $this->input->post('ccir_nom_user') ,
				   'ccir_user_email' => $this->input->post('ccir_user_email') ,
				   'pwd' => sha1($this->input->post('ccir_user_pass'))  ,
				   'id_profil' => $this->input->post('ccir_profil')  ,
				   'phone' => $this->input->post('ccir_user_phone')  ,
				   'id_ccir' => $this->input->post('ccir_user')  ,
				   'id_region' => $this->input->post('user_regin')  ,
				   'date_m_a_j_user_ccir' => date("Y-m-d H:i:s")
				);
			 }
		
		$this->ccir_model->add_user_ccir_model($data_ajouter_ccir_user);
	}
	
	public function function_update_ccir_user()
	{
		
			 $data_update_ccir_user = array(
				   'ccir_nom_user' => $this->input->post('ccir_nom_userM') ,
				   'ccir_user_email' => $this->input->post('ccir_user_emailM') ,
				   'id_profil' => $this->input->post('ccir_profilM')  ,
				   'phone' => $this->input->post('ccir_user_phoneM')  ,
				   'id_ccir' => $this->input->post('ccir_userM')  ,
				   'date_m_a_j_user_ccir' => date("Y-m-d H:i:s")
				);

		if(!empty($this->input->post('ccir_user_passM'))){$data_update_ccir_user['pwd'] = sha1($this->input->post('ccir_user_passM'));}
		if($this->input->post('ccir_profilM')==3){$data_update_ccir_user['id_region'] = $this->input->post('user_reginM');}

		$this->ccir_model->update_user_ccir_model($data_update_ccir_user,$this->input->post('id_user_ccirM'));
	}
	
	public function function_get_region_by_ccir()
	{
		$regions = $this->ccir_model->get_regions_by_ccir_model($this->input->post('ccir_user'));
		$this->output->set_content_type('application/json')->set_output(json_encode($regions));
	}
	
	public function function_get_cciruser_by_id(){
		$ccir_model= $this->ccir_model->get_cciruser_by_id_model($this->input->post('id_user_ccir'));
		$this->output->set_content_type('application/json')->set_output(json_encode($ccir_model));
	}
	
	public function function_delete_user_id()
	{
		$this->ccir_model->delete_cciruser_by_id_model($this->input->post('id_user'));
	}

	

	
	
}
