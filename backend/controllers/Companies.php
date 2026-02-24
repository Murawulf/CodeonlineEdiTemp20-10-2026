<?php
defined('BASEPATH') OR exit('No direct script access allowed');
require FCPATH. '/vendor/autoload.php';
class Companies extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				
				$this->load->model('companies_model');
				$this->load->model('regions_model');
				$this->load->model('produits_conditionne_model');
                 
        }
		
	public function index()
	{ 
			if($this->session->userdata('name')!='')
				{
					switch ($this->session->userdata('profil')) {
						case 1:
							$data = array('activehome' => '', 'activeprodcon' => 'active','activeccir' => '', 'activegpc' => '','header'=>'headerbof','activeprodcont' => '','activenotif' => '','activeservice' => '');
							break;
						case 4:
							$data = array('activehome' => '', 'activeprodcon' => 'active','activeccir' => '', 'activegpc' => '','header'=>'headercepex','activeprodcont' => '','activenotif' => '','activeservice' => '');
							break;
						case 5:
							$data = array('activehome' => '', 'activeprodcon' => 'active','activeccir' => '', 'activegpc' => '','header'=>'headercepex','activeprodcont' => '','activenotif' => '','activeservice' => '');
							break;
						default:
						   $data = array('activehome' => '', 'activeprodcon' => 'active','activeccir' => '', 'activegpcccir' => '','header'=>'headerccir');
					}
					switch ($this->session->userdata('profil')) {
						case 1:
							$data['list_regions']= $this->regions_model->get_all_regions_model();
							break;
						case 3:
							$data['list_regions']= $this->regions_model->get_regions_by_userccir_model($this->session->userdata('id_user'));
							break;
						case 4:
							$data['list_regions']= $this->regions_model->get_all_regions_model();
							break;
						case 5:
							$data['list_regions']= $this->regions_model->get_all_regions_model();
							break;
						default:
						   $data['list_regions']= $this->regions_model->get_regions_by_ccir_model($this->session->userdata('id_ccir'));
					}
					/*if($this->session->userdata('profil') !=3){
						$data['list_regions']= $this->regions_model->get_regions_by_ccir_model($this->session->userdata('id_ccir'));
					}else{
						$data['list_regions']= $this->regions_model->get_regions_by_userccir_model($this->session->userdata('id_user'));
					}*/
					
					//$data['segments']=$this->produits_conditionne_model->get_all_segment_model();
					$this->load->view('companies_views',$data);
				}else{ header("Location:login");}
				
	}
	
	
	 
	public function function_get_all_entreprises()
	{		
		switch ($this->session->userdata('profil')) {
						case 1:
							$list_get_all_entreprises=$this->companies_model->get_all_entreprises_model();
							break;
						case 3:
							$list_get_all_entreprises=$this->companies_model->get_all_entreprises_by_ccir_model($this->session->userdata('id_ccir'));
							break;
						case 4:
							$list_get_all_entreprises=$this->companies_model->get_all_entreprises_model();
							break;
						case 5:
							$list_get_all_entreprises=$this->companies_model->get_all_entreprises_model();
							break;
						default:
						   $list_get_all_entreprises=$this->companies_model->get_all_entreprises_by_ccir_model($this->session->userdata('id_ccir'));
					}
		$this->output->set_content_type('application/json')->set_output(json_encode($list_get_all_entreprises));					
	}
	
	public function function_get_segment()
	{
		$list_segments= $this->produits_conditionne_model->get_all_segments_model2();
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
					//'0123456789`-=~!@#$%^&*()_+,./<>?;:[]{}\|';
					'0123456789-=!@#$*_+,.?;:';

		  $str = '';
		  $max = strlen($chars) - 1;

		  for ($i=0; $i < $length; $i++)
			$str .= $chars[random_int(0, $max)];

		  return $str;
		}

	public function add_entreprises()
	{		 $region = $this->regions_model->get_region_byid_model($this->input->post('region'));
			$pwd=$this->generate_password();
			$data_ajouter_ept = array(
				   'raison_socialle' => $this->input->post('raison_socialle') ,
				   'adresse' => $this->input->post('adresse')  ,
				   'email' => $this->input->post('email') ,
				   'personne_contact' => $this->input->post('personne_contact') ,
				   'gln' => $this->input->post('gln') ,
				   'telephone' => $this->input->post('telephone') ,
				   'site' => $this->input->post('site') ,
				   'pwd' => sha1($pwd),
				   'pays' => 788,
				   'postalCode' => $this->input->post('postalCode') ,
				   'region' => $region['libelle_region_fr'],
				   'city' => $this->input->post('delegation') ,
				   'localite' => $this->input->post('localite'),
				   'nb_fp' => $this->input->post('nbp'),
				   'date_create' => date("Y-m-d H:i:s")
				);
				switch ($this->session->userdata('profil')) {
						case 1:
							$data_ajouter_ept['id_ccir']=1;
							break;
						default:
						   $data_ajouter_ept['id_ccir']=$this->session->userdata('id_ccir');
					}
			$id_ep = $this->companies_model->add_entreprises_model($data_ajouter_ept);	

			$segments = explode(",", $this->input->post('mg_segment'));

            foreach ($segments as $segment) {
                $data_ajouter_ep_segment = array(
                    'id_producteur' => $id_ep,
                    'id_segment' => $segment
                );

                $this->companies_model->add_segment_ep_model($data_ajouter_ep_segment);
            }
			$this->generate_email_password($this->input->post('personne_contact'),$this->input->post('raison_socialle'),$this->input->post('email'),$pwd,$id_ep);
	}
	
	public function update_entreprises()
	{
		$id_entreprise=$this->input->post('id_entreprise');
		$pwd = $this->input->post('pwd_M');
			if(!empty($pwd))
			{
			$data_ajouter_eptm = array(
				   'nom' => $this->input->post('raison_sociale_M') ,
				   'adresse' => $this->input->post('adresse_M')  ,
				   'email' => $this->input->post('email_M') ,
				   'prenom' => $this->input->post('login_M') ,
				   'password' => sha1($this->input->post('pwd_M')),
				   'date_mis_a_jour_npt' => date("Y-m-d H:i:s")
				);
			}else{
				$data_ajouter_eptm = array(
				   'nom' => $this->input->post('raison_sociale_M') ,
				   'adresse' => $this->input->post('adresse_M')  ,
				   'email' => $this->input->post('email_M') ,
				   'prenom' => $this->input->post('login_M') ,
				   'date_mis_a_jour_npt' => date("Y-m-d H:i:s")
				);
			}
			$this->companies_model->update_entreprise_model($id_entreprise,$data_ajouter_eptm);	
	}
	
	public function update_setting()
	{
		$id_entreprise=$this->input->post('id_userM');
	}
	
	public function update_bof_entreprise()
	{
		$data_update_ept = array(
			   'raison_socialle' => $this->input->post('raison_socialleM') ,
			   'adresse' => $this->input->post('adresseM')  ,
			   'personne_contact' => $this->input->post('personne_contactM') ,
			   'gln' => $this->input->post('glnM') ,
			   'telephone' => $this->input->post('telephoneM') ,
			   'email' => $this->input->post('emailM') ,
			   'status_ent' => $this->input->post('status_ent') ,
			   'nb_fp' => $this->input->post('nb_fpM') 
			);
		$this->companies_model->update_entreprise_model($this->input->post('id_entrepriseM'),$data_update_ept);
		$this->companies_model->delete_entp_segment_model($this->input->post('id_entrepriseM'));
		if(!empty($this->input->post('umm_id_segments')))
		{
		
			$segments = explode(",", $this->input->post('umm_id_segments'));

            foreach ($segments as $segment) {
                $data_ajouter_ep_segment = array(
                    'id_producteur' => $this->input->post('id_entrepriseM'),
                    'id_segment' => $segment
                );

                $this->companies_model->add_segment_ep_model($data_ajouter_ep_segment);
            }
		}
	}
	
	public function function_delete_entreprise_id_entreprise()
	{
			$FPs=$this->produits_conditionne_model->get_all_FP_by_id_producteur_model($this->input->post('id_ep'));
			if(!empty($FPs))
			{
				foreach($FPs as $FP)
				{
					$this->produits_conditionne_model->delete_produits_conditionne_model($FP['id']);
				}
			}
			$this->companies_model->delete_entp_segment_model($this->input->post('id_ep'));
			$this->companies_model->delete_entreprise_model($this->input->post('id_ep'));
	}
	
	function function_get_producteur_by_id()
	{
			$id_ept = $this->input->post('id_ept');
			$list_ep=$this->companies_model->get_entreprise_model($id_ept);
			$this->output->set_content_type('application/json')->set_output(json_encode($list_ep));
	}
	
	function fun_get_table_entp()
	{
		//$data['tabimages'] =$this->companies_model->get_images_by_id_fp_model($this->input->get('id_fp'));
		//$data['tabimages'] = explode(";", $tabimages['images']);
		//if(!empty($this->input->get('mg_secteur'))){$data['mg_secteur']=$this->input->get('mg_secteur');}else($data['mg_secteur']=0;);
		$data['id_region']=$this->input->get('id_region');
		$data['mg_secteur']=$this->input->get('mg_secteur');
		$this->load->view('slider_table_entp_views',$data);
	}
	
	public function function_get_all_entreprises_by_secteur_region()
	{
		$list_get_all_entreprises=$this->companies_model->get_all_entreprises_by_secteur_region_model($this->input->get('secteur'),$this->input->get('id_region'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_get_all_entreprises));	
	}
	
	public function sent_email_to_entreprises()
	{
		$ep=$this->companies_model->get_entreprise_model($this->input->post('id_ep'));
		
		if($ep['id_ccir']==1){
			$pwd=$this->generate_password();
			$this->generate_email_password($ep['personne_contact'],$ep['raison_socialle'],$ep['email'],$pwd,$ep['id_producteur']);

				$data_ajouter_eptm = array(
				   	'pwd' => sha1($pwd),
					'statut' => 1
				);

			$this->companies_model->update_entreprise_model($ep['id_producteur'],$data_ajouter_eptm);
		}
		require("PHPMailer-master/PHPMailerAutoload.php"); //or select the proper destination for this file if your page is in some   //other folder
			 $mail = new PHPMailer();
			 
				$mail->Host = 'smtp.gmail.com';
				$mail->SMTPAuth   = true;
				$mail->Port = 587; // Par défaut
				$mail->SMTPSecure = 'tls';
				$mail->IsSMTP();
				
				// Authentification
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
				echo $ep['email'];
				$mail->AddAddress($ep['email']);
				//$mail->AddBCC('support@netconsulting-europe.fr');

		$body="
		<p>Bonjour  ".$ep['personne_contact'].",</p>
			<p>Merci de trouver en PJ votre fiche de connexion à votre Back Office dans la plateforme de l’agrégateur Codeonline-INFO  accessible par le lien suivant : https://fp.codeonline-info.com.</p>
			<p>Cordialement</p>
			<p>Le support technique</p>
			<p>support@netconsulting-europe.fr</p>";
		$mail->MsgHTML($body);
		//$mail->isHTML(true);
		$mail->CharSet = 'UTF-8';
		$mail->Subject  = "Fiche de connexion";
		$file_name =$ep['id_producteur'].'.pdf';
		$mail->addAttachment("assets/pdf/".$file_name, $ep['raison_socialle'].".pdf");
		$result =$mail->Send();
		//var_dump($result);
				if(!$result) {
			echo 'Message could not be sent.';
			 return;
		}
	}
	
	public function generate_email_password($name,$raison_socialle,$email,$pwd,$id_ep)
	{
		$mpdf = new \Mpdf\Mpdf(['tempDir' => __DIR__ . '/temp']);
			$html ='
			<!DOCTYPE html>
<html>

<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta charset="utf-8">
    <title>
    </title>
    <style>
        body {
            line-height: 120%;
            font-family: Calibri;
            font-size: 10pt;
            font-style: italic
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6,
        p {
            margin: 0pt 0pt 10pt
        }

        table {
            margin-top: 0pt;
            margin-bottom: 10pt
        }

        h1 {
            margin-top: 24pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: 112%;
            border: 1pt solid #ffbd47;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
            color: #a26700;
            background-color: #fff1da
        }

        h2 {
            margin-top: 10pt;
            margin-left: 7.2pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: 112%;
            border-top: 0.75pt solid #ffbd47;
            border-right: 0.75pt solid #ffbd47;
            border-left: 6pt solid #ffbd47;
            border-bottom: 0.75pt solid #ffbd47;
            padding-right: 4pt;
            padding-left: 2pt;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        h3 {
            margin-top: 10pt;
            margin-left: 7.2pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            border-left: 6pt solid #ffbd47;
            border-bottom: 0.75pt solid #ffbd47;
            padding-left: 2pt;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        h4 {
            margin-top: 10pt;
            margin-left: 4.3pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            border-left: 0.75pt solid #ffbd47;
            border-bottom: 0.75pt solid #ffbd47;
            padding-left: 2pt;
            padding-bottom: 2pt;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        h5 {
            margin-top: 10pt;
            margin-left: 4.3pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            border-left: 0.75pt dotted #ffbd47;
            border-bottom: 0.75pt dotted #ffbd47;
            padding-left: 2pt;
            padding-bottom: 2pt;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        h6 {
            margin-top: 10pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            border-bottom: 0.75pt solid #ffe4b5;
            padding-bottom: 2pt;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: normal;
            font-style: italic;
            color: #f49b00
        }

        .Heading7 {
            margin-top: 10pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            border-bottom: 0.75pt dotted #ffd790;
            padding-bottom: 2pt;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: normal;
            font-style: italic;
            color: #f49b00
        }

        .Heading8 {
            margin-top: 10pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: normal;
            font-style: italic;
            color: #ffbd47
        }

        .Heading9 {
            margin-top: 10pt;
            margin-bottom: 5pt;
            page-break-inside: auto;
            page-break-after: auto;
            line-height: normal;
            font-family: "Calibri Light";
            font-size: 10pt;
            font-weight: normal;
            font-style: italic;
            color: #ffbd47
        }

        .Caption {
            margin-bottom: 10pt;
            line-height: 120%;
            font-size: 9pt;
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        .Footer {
            margin-bottom: 0pt;
            line-height: normal;
            font-size: 10pt;
            font-style: italic
        }

        .Header {
            margin-bottom: 0pt;
            line-height: normal;
            font-size: 10pt;
            font-style: italic
        }

        .IntenseQuote {
            margin-right: 108pt;
            margin-left: 108pt;
            margin-bottom: 10pt;
            text-align: center;
            line-height: 125%;
            border-top: 1pt dotted #ffbd47;
            border-bottom: 1pt dotted #ffbd47;
            padding-top: 10pt;
            padding-bottom: 10pt;
            font-family: "Calibri Light";
            font-size: 10pt;
            font-weight: bold;
            font-style: italic;
            color: #ffbd47
        }

        .ListParagraph {
            margin-left: 36pt;
            margin-bottom: 10pt;
            line-height: 120%;
            font-size: 10pt;
            font-style: italic
        }

        .NoSpacing {
            margin-bottom: 0pt;
            line-height: normal;
            font-size: 10pt;
            font-style: italic
        }

        .Quote {
            margin-bottom: 10pt;
            line-height: 120%;
            font-size: 10pt;
            font-style: normal;
            color: #f49b00
        }

        .Subtitle {
            margin-top: 10pt;
            margin-bottom: 45pt;
            text-align: center;
            line-height: normal;
            border-bottom: 1pt dotted #ffbd47;
            padding-bottom: 10pt;
            font-family: "Calibri Light";
            font-size: 12pt;
            font-style: italic;
            color: #a26700
        }

        .TOCHeading {
            margin-top: 24pt;
            margin-bottom: 5pt;
            line-height: 112%;
            border: 1pt solid #ffbd47;
            font-family: "Calibri Light";
            font-size: 11pt;
            font-weight: bold;
            font-style: italic;
            color: #a26700;
            background-color: #fff1da
        }

        .Title {
            margin-bottom: 0pt;
            text-align: center;
            line-height: normal;
            border-top: 6pt solid #ffbd47;
            border-bottom: 6pt solid #ffbd47;
            font-family: "Calibri Light";
            font-size: 24pt;
            font-style: italic;
            letter-spacing: 0.5pt;
            color: #ffffff;
            background-color: #ffbd47
        }

        .msonormal {
            margin-top: 5pt;
            margin-bottom: 5pt;
            line-height: normal;
            font-family: "Times New Roman";
            font-size: 12pt;
            font-style: normal
        }

        span.BookTitle {
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            font-variant: small-caps;
            text-decoration: underline;
            color: #f49b00
        }

        span.CitationCar {
            font-size: 10pt;
            color: #f49b00
        }

        span.CitationintenseCar {
            font-family: "Calibri Light";
            font-size: 10pt;
            font-weight: bold;
            font-style: italic;
            color: #ffbd47
        }

        span.Emphasis {
            border: 2.25pt solid #fff1da;
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            color: #ffbd47;
            background-color: #fff1da
        }

        span.En-tteCar {
            font-size: 10pt;
            font-style: italic
        }

        span.FollowedHyperlink {
            text-decoration: underline;
            color: #666699
        }

        span.Hyperlink {
            text-decoration: underline;
            color: #cc9900
        }

        span.IntenseEmphasis {
            border: 2.25pt solid #ffbd47;
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            text-decoration: none;
            vertical-align: baseline;
            color: #ffffff;
            background-color: #ffbd47
        }

        span.IntenseReference {
            font-weight: bold;
            font-style: italic;
            font-variant: small-caps;
            color: #ffbd47
        }

        span.PieddepageCar {
            font-size: 10pt;
            font-style: italic
        }

        span.SansinterligneCar {
            font-size: 10pt;
            font-style: italic
        }

        span.Sous-titreCar {
            font-family: "Calibri Light";
            font-size: 12pt;
            font-style: italic;
            color: #a26700
        }

        span.Strong {
            font-weight: bold;
            letter-spacing: 0pt
        }

        span.SubtleEmphasis {
            font-family: "Calibri Light";
            font-style: italic;
            color: #ffbd47
        }

        span.SubtleReference {
            font-style: italic;
            font-variant: small-caps;
            color: #ffbd47
        }

        span.Titre1Car {
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            color: #a26700;
            background-color: #fff1da
        }

        span.Titre2Car {
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        span.Titre3Car {
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        span.Titre4Car {
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        span.Titre5Car {
            font-family: "Calibri Light";
            font-weight: bold;
            font-style: italic;
            color: #f49b00
        }

        span.Titre6Car {
            font-family: "Calibri Light";
            font-style: italic;
            color: #f49b00
        }

        span.Titre7Car {
            font-family: "Calibri Light";
            font-style: italic;
            color: #f49b00
        }

        span.Titre8Car {
            font-family: "Calibri Light";
            font-style: italic;
            color: #ffbd47
        }

        span.Titre9Car {
            font-family: "Calibri Light";
            font-size: 10pt;
            font-style: italic;
            color: #ffbd47
        }

        span.TitreCar {
            font-family: "Calibri Light";
            font-size: 24pt;
            font-style: italic;
            letter-spacing: 0.5pt;
            color: #ffffff;
            background-color: #ffbd47
        }
    </style>
</head>

<body>
    <div>
        
           
			<table style="margin-bottom:0pt; border:0.75pt solid #ffffff; border-collapse:collapse;">
            <tbody>
                <tr>
                    <td style="width:172.05pt; border-right:0.75pt solid #ffffff; padding-right:5.03pt; padding-left:5.03pt; vertical-align:middle;">
                         <p  style="text-align:center;"><img src="assets/img/logo_NEltd.png" width="106" height="104"  alt=""></p>
                    </td>
                    <td align="right" style="width:542.95pt; border-left:0.75pt solid #ffffff; padding-right:5.03pt; padding-left:5.03pt; vertical-align:middle;">
						
					 </td>
                </tr>
            </tbody>
        </table>
      
		  <p style="margin-right:164.3pt; text-align:right; line-height:120%; font-size:5pt;">&nbsp;</p>
		   <p style="margin-right:164.3pt; text-align:right; line-height:120%; font-size:5pt;">&nbsp;</p>
        <table style="margin-bottom:0pt; border:0.75pt solid #ffb57d; border-collapse:collapse;">
            <tbody>
                <tr>
                    <td style="width:250.05pt; border-right:0.75pt solid #ffb57d; padding-right:5.03pt; padding-left:5.03pt; vertical-align:middle;">
                        <p style="margin-bottom:0pt; text-align:center; line-height:normal; font-size:22pt;"><span style="color:#f28029;">Fiche de connexion</span></p>
                    </td>
                    <td style="width:350.95pt; border-left:0.75pt solid #ffb57d; padding-right:5.03pt; padding-left:5.03pt; vertical-align:middle;">
                        <p><h2 style="margin-top:0pt; margin-left:0pt; margin-bottom:0pt; line-height:112%; border-style:none; padding-right:0pt; font-size:16pt;"><span style="color:#000000;">'.$name.'</span></h2></p>
						 <p><h2 style="margin-top:0pt; margin-left:0pt; margin-bottom:0pt; line-height:112%; border-style:none; padding-right:0pt; font-size:13pt;"><span style="color:#000000;">Entreprise :</span><span style="color:#000000;"><span style="color:#000000;">&nbsp;</span><span style="color:#000000;">'.$raison_socialle.'</span></h2></p>
                    </td>
                </tr>
            </tbody>
        </table>
        <p style="margin-right:164.3pt; text-align:right; line-height:120%; font-size:5pt;">&nbsp;</p>
        <p style="text-align:right;">'.date("d-m-Y").'</p>
        <p  style="text-align:left; font-size:12pt;" >Dans le cadre du projet PAESN(*), nous avons le plaisir de vous confirmer la cr&eacute;ation </p>
        <p  style="text-align:left; font-size:12pt;" >de votre Back Office Entreprise &agrave; la plateforme de l&rsquo;Agr&eacute;gateur d&rsquo;information produit.</p>
			 <p  style="text-align:center; font-size:12pt;" ><img src="assets/img/logo_INFO.png" width="106" height="104" alt=""></p>
     	 <p class="Quote" style="line-height:120%; font-size:12pt;"><span class="Strong" style="font-weight:normal; letter-spacing:normal; color:#000000;">En voici les &eacute;l&eacute;ments de connexion</span><span class="Strong" style="font-weight:normal; letter-spacing:normal; color:#000000;">&nbsp;</span><span class="Strong" style="font-weight:normal; letter-spacing:normal; color:#000000;">:</span></p>
        
		<table style="margin-bottom:0pt; border-collapse:collapse;">
            <tbody>
                <tr>
                    <td style="width:100.2pt; border-bottom:0.75pt solid #000000; padding-right:5.4pt; padding-left:5.4pt; vertical-align:top;">
                        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;color:#f28029;"><b>Compte<b></p>
                    </td>
                    <td style="width:400pt; border-bottom:0.75pt solid #000000; padding-right:5.4pt; padding-left:5.4pt; vertical-align:top;">
                        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">'.$email.'</p>
                    </td>
                </tr>
                <tr>
                    <td style="width:100.2pt; border-top:0.75pt solid #000000; padding-right:5.4pt; padding-left:5.4pt; vertical-align:top;">
                        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt; color:#f28029;"><b>Mot de passe</b></p>
                    </td>
                    <td style="width:400pt; border-top:0.75pt solid #000000; padding-right:5.4pt; padding-left:5.4pt; vertical-align:top;">
                        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">'.$pwd.'</p>
                    </td>
                </tr>
            </tbody>
        </table>
        <p style="line-height:120%; font-size:5pt;"><span style="font-style:normal;">&nbsp;</span></p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">Afin de s&eacute;curiser l&rsquo;acc&egrave;s &agrave; vos informations, un certicode vous est envoy&eacute; sur votre email &agrave; saisir dans un d&eacute;lai de 60 secondes dans la page d&rsquo;authentification. Pass&eacute; ce d&eacute;lai, veuillez r&eacute;actualiser votre page de connexion.</p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">Si vous souhaitez changer le mail de destination du certicode veuillez nous le signaler par email en mentionnant le nom de votre entreprise sur&nbsp; <a href="mailto:support@netconsulting-europe.fr" style="text-decoration:none;"><span class="Hyperlink">support@netconsulting-europe.fr</span></a></p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">Meilleures salutations</p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">Le support technique</p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
		<p style="margin-bottom:0pt; line-height:normal; font-size:12pt;">&nbsp;</p>
        <p style="margin-bottom:0pt; line-height:normal; font-size:11pt;"><span style="font-style:normal;">(*)</span><span style="font-style:normal;">&nbsp;</span><span style="font-style:normal;">: PAESN</span><span style="font-style:normal;">&nbsp;</span><span style="font-style:normal;">:&nbsp;</span><strong><span style="font-style:normal;">P</span></strong><span style="font-style:normal;">an&nbsp;</span><strong><span style="font-style:normal;">A</span></strong><span style="font-style:normal;">frican&nbsp;</span><strong><span style="font-style:normal;">E</span></strong><span style="font-style:normal;">xport&nbsp;</span><strong><span style="font-style:normal;">S</span></strong><span style="font-style:normal;">ynchronization&nbsp;</span><strong><span style="font-style:normal;">N</span></strong><span style="font-style:normal;">etwork.</span></p>
    </div>
</body>

</html>
';



$mpdf->SetDisplayMode('fullpage');
//$mpdf->list_indent_first_level = 0; // 1 or 0 - whether to indent the first level of a list

// Load a stylesheet
$stylesheet = file_get_contents('assets/css/bootstrap.min.css');
$mpdf->showImageErrors = true;
$mpdf->WriteHTML($stylesheet, 1); // The parameter 1 tells that this is css/style only and no body/html/text';
			
			$mpdf->WriteHTML($html);
			//$mpdf->debug = true;
			$mpdf->Output('assets/pdf/'.$id_ep.'.pdf','F');
			//$mpdf->Output('assets/pdf/test.pdf','F');
	}
	
	
}
