<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Certicode_producteur extends CI_Controller {

    /**
     * Index Page for this controller.
     *
     * Maps to the following URL
     * 		http://example.com/index.php/welcome
     * 	- or -
     * 		http://example.com/index.php/welcome/index
     * 	- or -
     * Since this controller is set as the default controller in
     * config/routes.php, it's displayed at http://example.com/
     *
     * So any other public methods not prefixed with an underscore will
     * map to /index.php/welcome/<method_name>
     * @see https://codeigniter.com/user_guide/general/urls.html
     */
    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->model('login_model');
        $this->load->library('session');
    }

    public function index() {

        //echo CI_VERSION;
        
        $this->load->view('auth_producteur_views');
		
    }

    public function certicode_check() {
        $certicode = $this->input->post('certicode');

        if (empty($certicode)) {
            echo "Veuillez introduire votre certicode";
            return;
        }
        $user = $this->login_model->check_erticode_producteur($this->session->userdata('id_user'),$certicode);
        if (!empty($user)) {
            echo "true";
            return;
        } else {
            echo "Mauvais certicode";
            return;
        }
    }
	
	public function function_rest_certicode()
	{
		$data_code = array(
                    'certicode' => ''
                );

		$this->login_model->reset_erticode($this->session->userdata('id_user'),$data_code);
	 
		$this->session->set_userdata(array(
            'name' => '',
            'id_user' => ''
        ));
		$this->session->unset_userdata('logged');
        $this->session->sess_destroy();
		 $this->load->view('views_login');
	}

}
