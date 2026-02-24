<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Message extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('regions_model');
				$this->load->model('message_model');
				$this->load->model('tarif_model');				
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => 'active', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
				if (($this->session->userdata('profil') == '1') || ($this->session->userdata('profil') == '3') || ($this->session->userdata('profil') == '7')) {
					$data['marches']=json_encode($this->regions_model->get_all_marche_magicsuggest_model());
				} elseif ($this->session->userdata('profil') == '4') {
					$data['marches']=json_encode($this->regions_model->get_marche_magicsuggest_by_region_model($this->session->userdata('region')));	
				} elseif ($this->session->userdata('profil') == '2') {
					$marches='';
					$id_user = $this->session->userdata('id_user');
					$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
					
						foreach($allmarches as $marche)
							{
								 $marches[] = $marche['id_marche'];
							}
						//var_dump($marches);
					$data['marches']=json_encode($this->message_model->get_marche_magicsuggest_by_municipalite_model($marches));	
				}
				$this->load->view('boc/message_views',$data);			
				}else{ header("Location:login");}
				
	}
	
	public function get_marche_magicsuggest_by_municipalite()
	{
		$marches='';
		$id_user = $this->session->userdata('id_user');
		if($id_user != 1){
			$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
		}else{$allmarches = $this->tarif_model->get_all_marches_model();}
		
		foreach($allmarches as $marche)
			{
				$marches[] = $marche['id_marche'];
			}

		$list_marches=$this->message_model->get_marche_magicsuggest_by_municipalite_model($marches);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_marches));
	}
	 
	public function function_get_all_message()
	{
			if ($this->session->userdata('profil') == '1'){
				$list_message=$this->message_model->get_all_message_model();
				$this->output->set_content_type('application/json')->set_output(json_encode($list_message));
			}elseif($this->session->userdata('profil') == '2'){
				
				$marches='';
				$id_user = $this->session->userdata('id_user');
			
				$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
						foreach($allmarches as $marche)
							{
								$marches[] = $marche['id_marche'];
							}
					
				$list_message=$this->message_model->get_all_message_by_municipalite_model($marches);
				$this->output->set_content_type('application/json')->set_output(json_encode($list_message));
			}
								
	}
	
	public function add_message()
	{		
			$message = $this->input->post('message');
			$data_ajouter_message = array(
				   'message' => $message ,
				   'date_mis_a_jour_m' => date("Y-m-d H:i:s")
				);
			$id_message = $this->message_model->add_message_model($data_ajouter_message);			
			$marches = explode(",", $this->input->post('marche'));
			$data_message_to_marche = array(
                    'message' => $messages,
                    'id_message' => $id_message
                );
            foreach ($marches as $marche) {               
                $this->regions_model->update_marche_id_marche_model($marche,$data_message_to_marche);
            } 
	}
	
	public function function_delete_message_id()
	{
		$id_message = $this->input->post('id_message');
		$data_update_message_to_marche = array(
                    'message' => NULL,
                    'id_message' => NULL
                );
		$this->message_model->update_marche_id_message_model($id_message,$data_update_message_to_marche);
		$this->message_model->delete_message_model($id_message);
	}
	
	public function function_get_message()
	{
		$message=$this->message_model->get_message_by_id_model($this->input->post('id_message'));
		$this->output->set_content_type('application/json')->set_output(json_encode($message));
	}
	
	public function get_all_marche_magicsuggest_by_municipalite()
	{
		$marches='';
		$id_user = $this->session->userdata('id_user');
		if($id_user != 1){
			$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
		}else{$allmarches = $this->tarif_model->get_all_marches_model();}
		
		foreach($allmarches as $marche)
			{
				$marches[] = $marche['id_marche'];
			}
		$list_marches=$this->message_model->get_all_marche_magicsuggest_by_municipalite_model($marches);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_marches));
	}
	
	public function function_update_message_municipalite_marches()
	{
		$id_message = $this->input->post('id_messageM');
		
		$ms_id_municipalite_marches = $this->input->post('ms_id_municipalite_marches');
		$ms_id_municipalite_marchesM = $this->input->post('ms_id_municipalite_marchesM');	
		$messageM = $this->input->post('messageM');
		$text = $this->input->post('textM');
		var_dump($ms_id_municipalite_marches.'///////////'.$ms_id_municipalite_marchesM.'///////////'.$messageM.'///////////'.$text);
		if(($messageM != $text) && ($ms_id_municipalite_marchesM == $ms_id_municipalite_marches))
		{
				$data_update_message = array(
				   'message' => $messageM ,
				   'date_mis_a_jour_m' => date("Y-m-d H:i:s")
				);
			$this->message_model->update_message_id_message_model($id_message,$data_update_message);
			$data_update_message_to_marche = array(
                    'message' => $messageM
                );
			$this->message_model->update_marche_id_message_model($id_message,$data_update_message_to_marche);
		}elseif(($messageM == $text) && ($ms_id_municipalite_marchesM != $ms_id_municipalite_marches))
		{
			$data_update_message_to_marche = array(
                    'message' => NULL,
                    'id_message' => NULL
                );
			$this->message_model->update_marche_id_message_model($id_message,$data_update_message_to_marche);
			$marches = explode(",", $this->input->post('ms_id_municipalite_marchesM'));
			$data_message_to_marche = array(
                    'message' => $text,
                    'id_message' => $id_message
                );
            foreach ($marches as $marche) {               
                $this->regions_model->update_marche_id_marche_model($marche,$data_message_to_marche);
            } 
		}elseif(($messageM != $text) && ($ms_id_municipalite_marchesM != $ms_id_municipalite_marches)){
			$data_update_message = array(
				   'message' => $messageM ,
				   'date_mis_a_jour_m' => date("Y-m-d H:i:s")
				);
			$this->message_model->update_message_id_message_model($id_message,$data_update_message);
			$data_update_message_to_marche = array(
                    'message' => $messageM
                );
			$this->message_model->update_marche_id_message_model($id_message,$data_update_message_to_marche);
			$data_update_message_to_marche = array(
                    'message' => NULL,
                    'id_message' => NULL
                );
			$this->message_model->update_marche_id_message_model($id_message,$data_update_message_to_marche);
			$marches = explode(",", $this->input->post('ms_id_municipalite_marchesM'));
			$data_message_to_marche = array(
                    'message' => $messageM,
                    'id_message' => $id_message
                );
            foreach ($marches as $marche) {               
                $this->regions_model->update_marche_id_marche_model($marche,$data_message_to_marche);
            } 
		}
	}
}
