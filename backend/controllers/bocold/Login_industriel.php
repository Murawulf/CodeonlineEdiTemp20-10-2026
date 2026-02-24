<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Login_industriel extends CI_Controller {

	/**
	 * Index Page for this controller.
	 *
	 * Maps to the following URL
	 * 		http://example.com/index.php/welcome
	 *	- or -
	 * 		http://example.com/index.php/welcome/index
	 *	- or -
	 * Since this controller is set as the default controller in
	 * config/routes.php, it's displayed at http://example.com/
	 *
	 * So any other public methods not prefixed with an underscore will
	 * map to /index.php/welcome/<method_name>
	 * @see https://codeigniter.com/user_guide/general/urls.html
	 */
	
	 public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->model('login_industriel_model');
				$this->load->library('session');
                
        }
	
	public function index()
	{
		
		$this->load->view('boc/views_industriel_login');
		
	}
	
	public function login_check()
	{
		
			$username = $this->input->post('username');
			$password = $this->input->post('password');	
			
			if(empty($username))
				{
					echo "Veuillez introduire votre login";
					return;
				}
				if(empty($password))
				{
					echo "Veuillez introduire votre mot de passe";
					return;
				}
				$fournisseur = $this->login_model->check_user($username,$password);
				if(!empty($fournisseur))
				{
					$tab_session=array('name' =>$fournisseur['name'],'id_user'=>$fournisseur['id_user'],'profil'=>$fournisseur['idRole'],'region'=>$fournisseur['id_region']);
					$this->session->set_userdata($tab_session);
					echo "true";
					return;
				}else{ echo "Utilisateur inconnu"; return;}	
	}
	
	public function logout()
	{
		$this->session->set_userdata(array(
			'name' => '',
			'id_user'  => ''
		));
		$this->session->unset_userdata('logged');
		$this->session->sess_destroy();
		$this->load->view('boc/views_login');	
	}
}
