<?php
defined('BASEPATH') OR exit('No direct script access allowed');
require FCPATH. '/vendor/autoload.php';
class Inscription extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				
				$this->load->model('companies_model');
				$this->load->model('regions_model');
				$this->load->model('gpc_model');
                 
        }
		
	public function index()
	{ 
		$data['list_regions']= $this->regions_model->get_all_regions_model();
		$this->load->view('inscription_views',$data);
				
	}
	
	public function function_get_segment()
	{
		$list_segments= $this->gpc_model->get_all_segments_model3();
		$this->output->set_content_type('application/json')->set_output(json_encode($list_segments));
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
	
	function generate_password($length = 12){
		  $chars =  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.
					'0123456789`-=~!@#$%^&*()_+,./<>?;:[]{}\|';

		  $str = '';
		  $max = strlen($chars) - 1;

		  for ($i=0; $i < $length; $i++)
			$str .= $chars[random_int(0, $max)];

		  return $str;
		}

	public function inscri_entreprises()
	{		 $region = $this->regions_model->get_region_byid_model($this->input->post('region'));
			$pwd=$this->generate_password();
			$data_ajouter_ept = array(
				   'raison_socialle' => $this->input->post('raison_socialle') ,
				   'adresse' => $this->input->post('adresse')  ,
				   'email' => $this->input->post('email') ,
				   'personne_contact' => $this->input->post('personne_contact') ,
				   'telephone' => $this->input->post('telephone') ,
				   //'site' => $this->input->post('site') ,
				   'pwd' => '',
				   'pays' => 788,
				   'postalCode' => $this->input->post('postalCode') ,
				   'region' => $region['libelle_region_fr'],
				   'city' => $this->input->post('delegation') ,
				   'localite' => $this->input->post('localite'),
				   'id_ccir' => 1,
				   'inscription' => 1,
				   'statut' => 1,
				   'nb_fp' => $this->input->post('nbp'),
				   'date_create' => date("Y-m-d H:i:s")
				);
			$id_ep = $this->companies_model->add_entreprises_model($data_ajouter_ept);	

			$segments = explode(",", $this->input->post('mg_segment'));

            foreach ($segments as $segment) {
                $data_ajouter_ep_segment = array(
                    'id_producteur' => $id_ep,
                    'id_segment' => $segment
                );

                $this->companies_model->add_segment_ep_model($data_ajouter_ep_segment);
            }
			require("PHPMailer-master/PHPMailerAutoload.php"); //or select the proper destination for this file if your page is in some   //other folder
			 $mail = new PHPMailer();
			 
				$mail->Host = 'smtp.gmail.com';
				$mail->SMTPAuth   = true;
				$mail->Port = 587; // Par défaut
				$mail->SMTPSecure = 'tls';
				$mail->IsSMTP();
				
				// Authentification lrft biwr eejh oxdf
				$mail->Username = "netconsultingeurop@gmail.com";
				$mail->Password = "lrftbiwreejhoxdf";
				
								// Authentification
				//$mail->Username = "netconsulting.europe@gmail.com";
				//$mail->Username = "netconsultingeurop@gmail.com";
				//$mail->Password = "eUUhT,,1720>>lM";
				//$mail->Password = "ueznbbhbhttqmxtn";
				
				// Expéditeur
				$mail->SetFrom('support@codeonline-info.com', 'codeonline-info.com');
				// Destinataire
				$mail->AddAddress('lemkechermajed@gmail.com');
				//$mail->AddBCC('support@netconsulting-europe.fr');

				$body='<p>Bonjour</p>
				<p><b>Nouvelle inscription <b><p>
				<p><b>Raison socialle :<b> '.$this->input->post('raison_socialle').'<p>
				<p><b>Personne contact :<b> '.$this->input->post('personne_contact').'<p>
				<p><b>Email :<b> '.$this->input->post('email').'<p>
				<p><b>Tel :<b> '.$this->input->post('telephone').'<p>
				<p><b>Region :<b> '.$region['libelle_region_fr'].'<p>
				<p><b>delegation :<b> '.$this->input->post('delegation').'<p>
				<p><b>Localite :<b> '.$this->input->post('localite').'<p>
				';
				$mail->MsgHTML($body);
				//$mail->isHTML(true);
				$mail->CharSet = 'UTF-8';
				$mail->Subject  = "Nouvelle inscription";
				$result =$mail->Send();
				//var_dump($result);
				if(!$result) {
							echo 'Message could not be sent.';
							 return;
				}
		
	}
	
}
