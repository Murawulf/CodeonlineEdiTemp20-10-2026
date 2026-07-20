<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Produits_conditionne extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('produits_conditionne_model');
				$this->load->model('companies_model');
				$this->load->model('api_fp/api_model_fp');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
					
					switch ($this->session->userdata('profil')) {
						case 1:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => 'active','activenotif' => '','activeservice' => '');
							$data['segments']=$this->produits_conditionne_model->get_all_segment_active_model();
							$data['producteurs']=$this->companies_model->get_all_entreprises_t_model();
							$data['companies']=json_encode($this->produits_conditionne_model->get_all_d_marque_model()); 
							$data['origines']=$this->produits_conditionne_model->get_all_origine_model();
							$this->load->view('Produits_conditionne_viewsBF',$data);
							break;
						case 4:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => 'active','activenotif' => '','activeservice' => '');
							$data['segments']=$this->produits_conditionne_model->get_all_segment_active_model();
							$data['producteurs']=$this->companies_model->get_all_entreprises_t_model();
							$data['companies']=json_encode($this->produits_conditionne_model->get_all_d_marque_model());
							$data['origines']=$this->produits_conditionne_model->get_all_origine_model();							
							$this->load->view('Produits_conditionne_viewsCepex',$data);
							break;
						case 5:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => 'active','activenotif' => '','activeservice' => '');
							$data['segments']=$this->produits_conditionne_model->get_all_segment_active_model();
							$data['producteurs']=$this->companies_model->get_all_entreprises_t_model();
							$data['companies']=json_encode($this->produits_conditionne_model->get_all_d_marque_model()); 
							$data['origines']=$this->produits_conditionne_model->get_all_origine_model();
							$this->load->view('Produits_conditionne_viewsCepex',$data);
							break;
						default:
						   $data = array('activehome' => '', 'activeprodcon' => 'active', 'activeprofil' => '','activeservice' => '');
						   $data['segments']=$this->produits_conditionne_model->get_all_segment_by_producteur_model($this->session->userdata('id_user'));
						   $data['origines']=$this->produits_conditionne_model->get_all_origine_model();
						   $this->load->view('Produits_conditionne_viewsP',$data);
					}
					
					
					//$data['fabricants']=$this->produits_conditionne_model->get_all_fabricant_model();
				
					
				}else{ header("Location:login");}
				
	}
	
	public function function_get_all_produit_conditionne()
	{
		if($this->session->userdata('profil') =='1'){$list_pv=$this->produits_conditionne_model->get_all_produits_conditionne_tunisie_model();}	
		else{$list_pv=$this->produits_conditionne_model->get_all_produits_conditionne_by_producteur_model($this->session->userdata('id_user'));}
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));

	}
	public function function_get_all_produit_conditionne_by_producteur()
	{
		$list_pv = $this->produits_conditionne_model->get_all_produits_conditionne_by_producteur_model($this->input->post('id_producteur'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	public function function_get_all_produit_conditionne_by_marque()
	{
		$list_pv = $this->produits_conditionne_model->get_all_produits_conditionne_by_marque_model($this->input->post('id_producteur'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	public function function_get_all_produit_conditionne_by_secteur()
	{
		$list_pv = $this->produits_conditionne_model->get_all_produits_conditionne_by_secteur_model($this->input->post('mg_secteur'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	public function function_get_all_produit_conditionne_pub()
	{
		$list_pv = $this->produits_conditionne_model->get_all_produits_conditionne_pub_model();
		$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}
	
	public function function_get_all_famille_by_code_segment()
	{
		$code_segment = $this->input->post('code_segment');
		$list_famille=$this->produits_conditionne_model->get_famille_code_segmen_model($code_segment);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_famille));
	}
	
	public function function_get_all_classe_by_code_famille()
	{
		$code_famille = $this->input->post('code_famille');
		$list_classe=$this->produits_conditionne_model->get_classe_code_famille_model($code_famille);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_classe));
	}
	
	public function function_get_all_classe_by_code_classe()
	{
		$code_classe = $this->input->post('code_classe');
		$list_brique=$this->produits_conditionne_model->get_brique_code_classe_model($code_classe);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_brique));
	}
	
	public function function_get_produits_conditionne_by_id()
	{
		$produit_conditionne = $this->produits_conditionne_model->get_produit_conditionne_by_id_model($this->input->post('id_produit_ref'));
		$this->output->set_content_type('application/json')->set_output(json_encode($produit_conditionne));
	}
	
	public function function_get_segment()
	{
		$list_segments= $this->produits_conditionne_model->get_all_segments_model2();
		$this->output->set_content_type('application/json')->set_output(json_encode($list_segments));
	}
	
	
	public function add_produit_conditionne()
	{
		if(!empty($this->input->post('gtin')))
		{
			$response = $this->api_model_fp->fiche_produit_gtin($this->input->post('gtin'));
			if(!empty($response))
			{
				echo 'GTIN existe déjà';
			}else{						
				$statusGtin = $this->gs1_FP($this->input->post('gtin'));
				if ($statusGtin =='ok')
				{
					$data_ajouter_fp = array(
				   'gtin' => $this->input->post('gtin') ,
				   'libelle' => $this->input->post('libelle') ,
				   'brand' => $this->input->post('brand')  ,
				   'subBrand' => $this->input->post('subBrand')  ,
				   'code_cader' => $this->input->post('code_cader')  ,
				   //'description' => $this->input->post('description') ,
				   'codeClasse' => $this->input->post('code_classe') ,
				   'codebrique' => $this->input->post('code_brique') ,
				   'countryOfOrigin' => $this->input->post('countryOfOrigin') ,  
				   'prix_min' => $this->input->post('prix_pub_min') ,
				   'prix_max' => $this->input->post('prix_pub_max') ,
				   'date_mis_a_jour_fp' => date("Y-m-d H:i:s"),
				   'date_create_fp' => date("Y-m-d H:i:s")
				   );
				   
					switch ($this->session->userdata('profil')) {
									case 1:
										$data_ajouter_fp['idEntreprise'] = $this->input->post('producteur');
										break;
									default:
									$data_ajouter_fp['idEntreprise'] = $this->session->userdata('id_user') ;
								}
					
					if (!empty($_FILES)){
								$allimages='';
								$nbimages=1;
								foreach($_FILES as $file)
								{
									$tmp_name = $file["tmp_name"];
										$img = getimagesize($tmp_name);
										$fp = fopen($tmp_name, "rb");
									if ($img && $fp) {
										$name		= $file["name"];
										$upload_path = "images/".$name;
										if (move_uploaded_file($tmp_name, $upload_path)) {
											$path		= pathinfo($name);						
											$extension	= $path["extension"];
											$date		= date("Ymdhis", time());
											$xname      = $nbimages."_".$date."_" .$this->input->post('idfp'). "." . $extension;
											$new_path	= "images/".$xname ;
											rename($upload_path, $new_path);
											$new_path	= base_url()."images/".$xname ;
											$allimages .=$new_path.';';
											$nbimages++;
										}					
									}
								}
							$data_ajouter_fp['images'] = substr_replace($allimages ,"", -1);
							$data_ajouter_fp['nb_images']= $nbimages-1;				
						}
					$id_Fp = $this->produits_conditionne_model->add_produits_conditionne_model($data_ajouter_fp);
					echo 'ok';
				}else{
					echo "GTIN n'existe pas";
				}
			}
		}else{
			$data_ajouter_fp = array(
				   'libelle' => $this->input->post('libelle') ,
				   'brand' => $this->input->post('brand')  ,
				   'subBrand' => $this->input->post('subBrand')  ,
				   'code_cader' => $this->input->post('code_cader')  ,
				   //'description' => $this->input->post('description') ,
				   'codeClasse' => $this->input->post('code_classe') ,
				   'codebrique' => $this->input->post('code_brique') ,
				   'countryOfOrigin' => $this->input->post('countryOfOrigin') ,  
				   'prix_min' => $this->input->post('prix_pub_min') ,
				   'prix_max' => $this->input->post('prix_pub_max') ,
				   'date_mis_a_jour_fp' => date("Y-m-d H:i:s"),
				   'date_create_fp' => date("Y-m-d H:i:s")
				   );
				   
					switch ($this->session->userdata('profil')) {
									case 1:
										$data_ajouter_fp['idEntreprise'] = $this->input->post('producteur');
										break;
									default:
									$data_ajouter_fp['idEntreprise'] = $this->session->userdata('id_user') ;
								}
					
					if (!empty($_FILES)){
								$allimages='';
								$nbimages=1;
								foreach($_FILES as $file)
								{
									$tmp_name = $file["tmp_name"];
										$img = getimagesize($tmp_name);
										$fp = fopen($tmp_name, "rb");
									if ($img && $fp) {
										$name		= $file["name"];
										$upload_path = "images/".$name;
										if (move_uploaded_file($tmp_name, $upload_path)) {
											$path		= pathinfo($name);						
											$extension	= $path["extension"];
											$date		= date("Ymdhis", time());
											$xname      = $nbimages."_".$date."_" .$this->input->post('idfp'). "." . $extension;
											$new_path	= "images/".$xname ;
											rename($upload_path, $new_path);
											$new_path	= base_url()."images/".$xname ;
											$allimages .=$new_path.';';
											$nbimages++;
										}					
									}
								}
							$data_ajouter_fp['images'] = substr_replace($allimages ,"", -1);
							$data_ajouter_fp['nb_images']= $nbimages-1;				
						}
					$id_Fp = $this->produits_conditionne_model->add_produits_conditionne_model($data_ajouter_fp);
					echo "ok";
		}
	
		/*$data_ajouter_info_inco = array(
				   'id_FP ' => $id_nourriture_boisson 
				   'ingredientStatement' => $this->input->post('ingredientStatement') ,
				   'consumerUsageInstructions' => $this->input->post('consumerUsageInstructions') ,
				   );
		$id_fp_inco = $this->produits_conditionne_model->add_info_produits_conditionne_model($data_ajouter_info_inco);*/	   
		
	}
	
	public function update_images_produit_conditionne()
	{
		//print_r($_FILES['imageproduitM_3']);
		//unlink('images/4_20240129124650_86143.png');
		$allimages='';
		$nbimages=0;
		$i=1;
		for ($j = 0; $j < 4; $j++){
			if(!empty($_FILES['imageproduitM_'.$i])){
					$tmp_name = $_FILES['imageproduitM_'.$i]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
					if ($img && $fp) {
						$name		= $_FILES['imageproduitM_'.$i]["name"];
						$upload_path = "images/".$name;
						if (move_uploaded_file($tmp_name, $upload_path)) {
							$path		= pathinfo($name);						
							$extension	= $path["extension"];
							$date		= date("Ymdhis", time());
							$xname      = $i."_".$date."_" .$this->input->post('idfpimagesM'). "." . $extension;
							$new_path	= "images/".$xname ;
							rename($upload_path, $new_path);
							$new_path	= base_url()."images/".$xname ;
							$allimages .=$new_path.';';
							$nbimages++;
							$urlimage = explode(".com/", $this->input->post('inputimageM_'.$i));
							unlink($urlimage[1]);
						}					
					}
			}else
				{
					if(empty($this->input->post('validateCheckbox_'.$i)))
					{
						if(!empty($this->input->post('inputimageM_'.$i)))
						{
							$allimages .=	$this->input->post('inputimageM_'.$i).';';
							$nbimages++;
						}
					}else{
						$urlimage = explode(".com/", $this->input->post('inputimageM_'.$i));
						unlink($urlimage[1]);
					}
				}
			
		$i++;}
		$data_update_images_fp = array();
		$data_update_images_fp['images'] = substr_replace($allimages ,"", -1);
		$data_update_images_fp['nb_images']= $nbimages;	
		$this->produits_conditionne_model->update_produits_conditionne_id_produit_model($this->input->post('idfpimagesM'),$data_update_images_fp);
	}
	
	public function update_produit_conditionne()
	{

				$data_update_fp = array(
				   'gtin' => $this->input->post('gtinM') ,
				   'libelle' => $this->input->post('libelleM') ,
				   'brand' => $this->input->post('brandM')  ,
				   'subBrand' => $this->input->post('subBrandM')  ,
				   'code_cader' => $this->input->post('code_caderM')  ,
				   //'description' => $this->input->post('description') ,
				   'codeClasse' => $this->input->post('code_classeM') ,
				   'codebrique' => $this->input->post('code_briqueM') ,
				   'countryOfOrigin' => $this->input->post('countryOfOriginM') ,
				   'prix_min' => $this->input->post('prix_pub_minM') ,
				   'prix_max' => $this->input->post('prix_pub_maxM') ,
				   'date_mis_a_jour_fp' => date("Y-m-d H:i:s")
				   );
		if($this->session->userdata('profil') =='1'){
			if (!empty($_FILES)){
					$tmp_name = $_FILES["imageproduit_cM"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["imageproduit_cM"]["name"];
					$upload_path = "images/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      =$date."_" .$this->input->post('idfp'). "." . $extension;
						$new_path	= "images/".$xname ;
						rename($upload_path, $new_path);
						$new_path	= base_url()."images/".$xname ;
						
					}					
				}
				$data_update_fp['images']=$new_path;
			}
		}
			
		$this->produits_conditionne_model->update_produits_conditionne_id_produit_model($this->input->post('idfp'),$data_update_fp);
	}
	
	public function function_delete_produits_conditionne_id_produits()
	{
			$id_produits_fp = $this->input->post('id_produits_fp');
			$tabimages =$this->produits_conditionne_model->get_images_nb_by_id_fp_model($id_produits_fp);
			switch ($tabimages['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
							$urlimage = explode(".com/", $tabimages['images']);
							unlink($urlimage[1]);
						break;
					default:
					$tbimages = explode(";", $tabimages['images']);
					foreach($tbimages as $image)
						{
							$urlimage = explode(".com/", $image);
							unlink($urlimage[1]);
						}
				}
				
			
			$this->produits_conditionne_model->delete_produits_conditionne_model($id_produits_fp);
	}
	
	public function function_pub_produits_conditionne_id_produits()
	{
		$data_update_fp = array('status' => 2 ,'date_mis_a_jour_fp' => date("Y-m-d H:i:s"));
		$this->produits_conditionne_model->update_produits_conditionne_id_produit_model($this->input->post('id_produits_fp'),$data_update_fp);
	}
	public function function_encours_produits_conditionne_id_produits()
	{
		$data_update_fp = array('status' => 1 ,'date_mis_a_jour_fp' => date("Y-m-d H:i:s"));
		$this->produits_conditionne_model->update_produits_conditionne_id_produit_model($this->input->post('id_produits_fp'),$data_update_fp);
	}
	/*function function_get_all_type_produits_vrac()
	{
			$list_pv=$this->produits_vrac_model->get_all_type_produits_vrac_model();
			$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));
	}*/
	
	public function function_update_name_image_produits_conditionne()
	{
		$produits =$this->produits_conditionne_model->get_all_produit_v_model();
		foreach($produits as $produit){
			$url="";
			$url = explode("/",$produit['urlImage'])[4];
			$url = "assets/icons_produitsconditionne/".$url;
			echo $url.'<br>';
			$data_update_c = array(
				   'urlImage' => $url ,
				   );
			$this->produits_conditionne_model->update_produits_conditionne_image_id_produit_model($produit['id'],$data_update_c);
		}
	}
	public function function_conditionne()
	{
		$produits =$this->produits_conditionne_model->get_all_produit_b_model();
		print_r($produits);
		foreach($produits as $produit){
			$data_update_c = array(
				   'urlImage' => $produit['urlImage'] ,
				   );
			$this->produits_conditionne_model->update_produits_conditionne_image_id_produit_model($produit['id'],$data_update_c);
		}
	}
	
	function fun_get_images_fp()
	{
		$data['tabimages'] =$this->produits_conditionne_model->get_images_by_id_fp_model($this->input->get('id_fp'));
		//$data['tabimages'] = explode(";", $tabimages['images']);
		$this->load->view('slider_images_views',$data);
	}
	
	function fun_get_to_update_images_fp()
	{
		$data['tabimages'] =$this->produits_conditionne_model->get_images_by_id_fp_model($this->input->get('id_fp'));
		//$data['tabimages'] = explode(";", $tabimages['images']);
		$this->load->view('update_images_views',$data);
	}
	
	function GtinChecksum($content){
		// Calculating Checksum
		// Consider the right-most digit of the message to be in an "odd" position,
		// and assign odd/even to each character moving from right to left
		// Odd Position = 3, Even Position = 1
		// Multiply it by the number
		// Add all of that and do 10-(?mod10)
		
		$odd = true;
		$checksumValue = 0;
		$c = strlen($content);
		
		for($i = $c; $i > 0; $i--) {
			if($odd === true) {
				$multiplier = 3;
				$odd = false;
			} else {
				$multiplier = 1;
				$odd = true;
			}
			$checksumValue += ($content[$i - 1] * $multiplier);
		}
		return (10 - $checksumValue % 10) % 10;
		
	}
	
	function verifierGtinChecksumU()
		{
				$gtin_article= $_GET["gtin_article"];
				$checksum = $this->GtinChecksum($gtin_article);
				$gtin_article=$gtin_article.$checksum;
				$data=array("gtin" => $gtin_article, "index0" => "oui","cle"=>$checksum);
				$this->output->set_content_type('application/json')->set_output(json_encode($data));
		}
	
	function auth()
	{
		$username ='a5ab302c-7e3c-4b6b-b112-18e8a6abe00f_NETCONSULTINGEUROPELTD';
		$password ='o3vq-3i@Gf?3-j$S';
	   $clt = curl_init();
	   curl_setopt($clt, CURLOPT_RETURNTRANSFER, true);
	   curl_setopt($clt, CURLOPT_URL, "https://api.gs1.fr/auth/connect/token");
	   curl_setopt($clt, CURLOPT_POST, true);
	   curl_setopt($clt, CURLOPT_USERPWD, $username . ":" . $password);
	   /* uncomment this line if you don't have the required SSL certificates */
	   // curl_setopt($cl, CURLOPT_SSL_VERIFYPEER, false);
	   curl_setopt($clt, CURLOPT_POSTFIELDS, array(
		 "grant_type" => "client_credentials",
		 "scope'=>'Products.Read"
		 //"client_id" => "my@email.address",
		 //"client_secret" => "my password"
	   ));
	   $auth_response = curl_exec($clt);
	   if ($auth_response === false)
	   {
		  echo "Failed to authenticate\n";
		  var_dump(curl_getinfo($clt));
		  curl_close($clt);
		  $this->response('NULL', REST_Controller::HTTP_OK);
	   }
	   curl_close($clt);
	   //$this->response(json_decode($auth_response, true), REST_Controller::HTTP_OK);
	   return json_decode($auth_response, true);
	}
	
	public function gs1_FP($gtin)
	{
		$token= $this->auth();
		//$gtin='0745240170808';
		//$token = "<REDACTED_EXPIRED_SANDBOX_TOKEN>";
			//setup the request, you can also use CURLOPT_URL
			$ch = curl_init('https://api.gs1.fr/products/'.$gtin.'?api-version=v2');
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			// Returns the data/output as a string instead of raw data
			//curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

			//Set your auth headers
			curl_setopt($ch, CURLOPT_HTTPHEADER, array(
			   'Content-Type: application/json',
			   'Authorization: Bearer ' . $token['access_token'],
			   'Ocp-Apim-Subscription-Key: 13295cd4d95d487fab03315fb1219e86'
			   ));

			// get stringified data/output. See CURLOPT_RETURNTRANSFER
			
			$data = curl_exec($ch);
			//=="Invalid control key"){var_dump('test');} json_decode(curl_exec($ch), true);
			// get info about the request
			//$info = curl_getinfo($ch);
			// close curl resource to free up system resources
			curl_close($ch);
			/* $response = [
					"serveur" => "gs1",
					"FP"=>json_decode($data, true)
				  ];*/
			//$FP = json_decode($data, true);
			//$FP['serveur']="gs1";
			if($data == "\"Invalid control key\"")
			{
				return 'Invalid control key';
            }
			elseif($data == '"Invalid GTIN format. Please enter a GTIN code of 8,12, 13 or 14 characters"')
			{
				return 'Format GTIN invalide. Veuillez saisir un code GTIN de 13 ou 14 caractères';
			}else{
				return 'ok';
			}
	}
	
}
