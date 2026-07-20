<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Login extends CI_Controller {

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
		$this->load->model('companies_model');
        $this->load->library('session');
    }

    public function index() {

        //echo CI_VERSION;
        
        
        $this->load->view('views_login');
    }

    public function login_check() {

        $username = $this->input->post('username');
        $password = $this->input->post('password');

        if (empty($username)) {
            echo "Veuillez introduire votre login";
            return;
        }
        if (empty($password)) {
            echo "Veuillez introduire votre mot de passe";
            return;
        }
        $user_fp = $this->login_model->check_user($username, $password);
		$user_ccri_fp = $this->login_model->check_user_ccri($username, $password);
        if (!empty($user_fp)) {
			$ifService = false;
			$Service = $this->companies_model->check_if_entreprise_service_model($user_fp['id_producteur']);
			if($Service['nb_ept']!=0){$ifService = true;}
            $tab_session = array('name' => $user_fp['raison_socialle'], 'id_user' => $user_fp['id_producteur'],'email'=>$user_fp['email'],'region' => $user_fp['region'],'profil' => 100, 'ifService'=> $ifService);
            $this->session->set_userdata($tab_session);
			$certicode = rand(100000, 999999);
			$data_update_user = array(
                'certicode' => $certicode,
            );
			$this->companies_model->update_entreprise_model($user_fp['id_producteur'],$data_update_user);
			$this->sendemailto($user_fp['email'],$certicode);
            echo "producteur";
            return;
		} elseif (!empty($user_ccri_fp)) {
			if($user_ccri_fp['id_profil'] !=1)
			{
			 $tab_session = array('name' => $user_ccri_fp['ccir_nom_user'], 'id_user' => $user_ccri_fp['id_user_ccir'], 'profil' => $user_ccri_fp['id_profil'],'email'=>$user_ccri_fp['ccir_user_email'],'ccir'=>$user_ccri_fp['name'],'id_ccir'=>$user_ccri_fp['id_ccir']);
            $this->session->set_userdata($tab_session);
			$certicode = rand(100000, 999999);
			$data_update_user = array(
                'certicode' => $certicode,
            );
			$this->login_model->update_user_ccri_model($user_ccri_fp['id_user_ccir'],$data_update_user);
			$this->sendemailto($user_ccri_fp['ccir_user_email'],$certicode);
            echo "ccri";
			return;
			}else{
				$tab_session = array('name' => $user_ccri_fp['ccir_nom_user'], 'id_user' => $user_ccri_fp['id_user_ccir'], 'profil' => $user_ccri_fp['id_profil'],'email'=>$user_ccri_fp['ccir_user_email'],'ccir'=>$user_ccri_fp['name'],'id_ccir'=>$user_ccri_fp['id_ccir']);
				$this->session->set_userdata($tab_session);
				echo "bof";
				return;
			}
			
        } else {
            echo "Utilisateur inconnu";
            return;
        }
    }
	
	public function sendemailto($email_to,$certicode)
	{
		require("PHPMailer-master/PHPMailerAutoload.php"); //or select the proper destination for this file if your page is in some   //other folder
			 $mail = new PHPMailer();
			 
				$mail->Host = 'smtp.gmail.com';
				$mail->SMTPAuth   = true;
				$mail->Port = 587; // Par défaut
				$mail->SMTPSecure = 'tls';
				$mail->IsSMTP();
				
				// Authentification lrft biwr eejh oxdf
				$mail->Username = "netconsultingeurop@gmail.com";
				$mail->Password = getenv('SMTP_PASSWORD');
				
								// Authentification
				//$mail->Username = "netconsulting.europe@gmail.com";
				//$mail->Username = "netconsultingeurop@gmail.com";
				//$mail->Password = getenv('SMTP_PASSWORD');
				//$mail->Password = getenv('SMTP_PASSWORD');
				
				// Expéditeur
				$mail->SetFrom('support@codeonline-info.com', 'codeonline-info.com');
				// Destinataire
				$mail->AddAddress($email_to);
				//$mail->AddBCC('support@netconsulting-europe.fr');

		$body="<p>Bonjour</p>
		<p><b>Votre code est : ".$certicode."<b><p>

		<p>Ce code est valable 60 secondes. Veuillez l’introduire sur la page d’authentification.<p>

 

		<p>Passé ce délai, actualiser votre  page web d’authentification et recomposer votre compte et votre mot de passe.<p>

		<p>L'équipe  codeonline<p>
		";
		$mail->MsgHTML($body);
		//$mail->isHTML(true);
		$mail->CharSet = 'UTF-8';
		$mail->Subject  = "Certicode ".$certicode."";
		$result =$mail->Send();
		//var_dump($result);
		if(!$result) {
    echo 'Message could not be sent.';
	 return;
}
	}
    public function logout() {
        $this->session->set_userdata(array(
            'name' => '',
            'id_user' => ''
        ));
        $this->session->unset_userdata('logged');
        $this->session->sess_destroy();
        $this->load->view('views_login');
    }

}
