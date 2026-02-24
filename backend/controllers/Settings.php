<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Settings extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
		$this->load->model('regions_model');
		$this->load->model('companies_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeprodcon' => '', 'activeprofil' => 'active','activeservice' => '');
            $this->load->view('settings_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function upemail()
	{
		if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeprodcon' => '', 'activeprofil' => 'active','activeservice' => '');
            $this->load->view('settings_email_views', $data);
        } else {
            header("Location:login");
        }
	}
	
	public function update_email_entreprise()
	{		
		$entreprise = $this->companies_model->check_entreprise_model($this->input->post('id_comp_m'),$this->input->post('pwd1'));

		if(!empty($entreprise))
		{
			$data_update_ept = array(
				   'email' => $this->input->post('email')
				);
			$this->companies_model->update_entreprise_model($this->input->post('id_comp_m'),$data_update_ept);
			echo  'ok';
			return;
		}else{
			echo  'ko';
			return;
		}
	}
	
	public function update_w_entreprise()
	{
		$oldpwd = $this->input->post('oldpwd');
		$newpwd = $this->input->post('newpassword');
		$entreprise = $this->companies_model->check_entreprise_model($this->input->post('id_comp'),$oldpwd);

		if(!empty($entreprise))
		{
			$data_update_ept = array(
				   'pwd' => sha1($newpwd)
				);
			$this->companies_model->update_entreprise_model($this->input->post('id_comp'),$data_update_ept);
			echo  'ok';
			return;
		}else{
			echo  'ko';
			return;
		}
	}
	
}
