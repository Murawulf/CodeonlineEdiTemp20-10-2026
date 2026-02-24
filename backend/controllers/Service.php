<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Service extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('service_model');
				$this->load->model('produits_conditionne_model');
				$this->load->model('companies_model');
				$this->load->model('gpc_model');
				$this->load->model('api_fp/api_model_fp');
                 
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
					
					switch ($this->session->userdata('profil')) {
						case 1:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => '','activenotif' => '','activeservice' => 'active');
							$data['familles']=$this->gpc_model->get_all_famille_by_code_segment_model(120000000);
						    $data['origines']=$this->produits_conditionne_model->get_all_origine_model();
							$this->load->view('service_viewsBF',$data);
							break;
						case 4:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => 'active','activenotif' => '');
							$data['segments']=$this->produits_conditionne_model->get_all_segment_active_model();
							$data['producteurs']=$this->companies_model->get_all_entreprises_t_model();
							$data['companies']=json_encode($this->produits_conditionne_model->get_all_d_marque_model());
							$data['origines']=$this->produits_conditionne_model->get_all_origine_model();							
							$this->load->view('Service_viewsCepex',$data);
							break;
						case 5:
							$data = array('activehome' => '', 'activeprodcon' => '','activeccir' => '', 'activegpc' => '','activeprodcont' => 'active','activenotif' => '');
							$data['segments']=$this->produits_conditionne_model->get_all_segment_active_model();
							$data['producteurs']=$this->companies_model->get_all_entreprises_t_model();
							$data['companies']=json_encode($this->produits_conditionne_model->get_all_d_marque_model()); 
							$data['origines']=$this->produits_conditionne_model->get_all_origine_model();
							$this->load->view('Service_viewsCepex',$data);
							break;
						default:
						   $data = array('activehome' => '', 'activeprodcon' => '', 'activeprofil' => '','activeservice' => 'active');
						   $data['familles']=$this->gpc_model->get_all_famille_by_code_segment_model(120000000);
						   $data['origines']=$this->produits_conditionne_model->get_all_origine_model();
						   $this->load->view('Service_viewsP',$data);
					}
					
					
					//$data['fabricants']=$this->produits_conditionne_model->get_all_fabricant_model();
				
					
				}else{ header("Location:login");}
				
	}
	
	public function function_get_all_tab_service()
	{
		$list_pv = $this->service_model->get_all_service_producteur_model($this->session->userdata('id_user'));
		$this->output->set_content_type('application/json')->set_output(json_encode($list_pv));

	}
	
	public function function_get_all_tab_service_by_user()
	{
		$list_pv = $this->service_model->get_all_service_by_producteur_model($this->session->userdata('id_user'));
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
	
	
	
	public function function_get_segment()
	{
		$list_segments= $this->produits_conditionne_model->get_all_segments_model2();
		$this->output->set_content_type('application/json')->set_output(json_encode($list_segments));
	}
	
	public function function_get_service_by_id()
	{
		$service = $this->service_model->get_service_by_id_model($this->input->post('id_service'));
		$this->output->set_content_type('application/json')->set_output(json_encode($service));
	}
	
	public function add_service()
	{

		$data_ajouter_service = array(
		   'titre_service_ar' => $this->input->post('titre_service_ar') ,
		   'texte_service_ar' => $this->input->post('texte_service_ar') ,
		   'titre_service_fr' => $this->input->post('titre_service_fr') ,
		   'texte_service_fr' => $this->input->post('texte_service_fr') ,
		   'titre_service_en' => $this->input->post('titre_service_en') ,
		   'texte_service_en' => $this->input->post('texte_service_en') ,
		   'codeclasse_service' => $this->input->post('code_classe') ,
		   'codebrique_service' => $this->input->post('code_brique') ,
		   'CountryOfOrigin_service' => $this->input->post('countryOfOrigin')
		   );
		   
			switch ($this->session->userdata('profil')) {
							case 1:
								$data_ajouter_service['id_producteur'] = $this->input->post('producteur');
								break;
							default:
							$data_ajouter_service['id_producteur'] = $this->session->userdata('id_user') ;
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
									$xname      = $nbimages."_".$date."_service" . $extension;
									$new_path	= "images/".$xname ;
									rename($upload_path, $new_path);
									$new_path	= base_url()."images/".$xname ;
									$allimages .=$new_path.';';
									$nbimages++;
								}					
							}
						}
					$data_ajouter_service['images_services'] = substr_replace($allimages ,"", -1);
					$data_ajouter_service['nb_images']= $nbimages-1;				
				}
			$id_service = $this->service_model->add_service_model($data_ajouter_service);
			echo 'ok';
	}
	
	public function update_images_service()
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
							$xname      = $i."_".$date."_" .$this->input->post('idserviceimagesM'). "." . $extension;
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
		$data_update_images_fp['images_services'] = substr_replace($allimages ,"", -1);
		$data_update_images_fp['nb_images']= $nbimages;	
		$this->service_model->update_service_id_service_model($this->input->post('idserviceimagesM'),$data_update_images_fp);
	}
	
	public function update_service()
	{

		$data_update_service = array(
		   'titre_service_ar' => $this->input->post('titre_service_arM') ,
		   'texte_service_ar' => $this->input->post('texte_service_arM') ,
		   'titre_service_fr' => $this->input->post('titre_service_frM') ,
		   'texte_service_fr' => $this->input->post('texte_service_frM') ,
		   'titre_service_en' => $this->input->post('titre_service_enM') ,
		   'texte_service_en' => $this->input->post('texte_service_enM') ,
		   'codeclasse_service' => $this->input->post('code_classeM') ,
		   'codebrique_service' => $this->input->post('code_briqueM') ,
		   'CountryOfOrigin_service' => $this->input->post('countryOfOriginM')
				   );

			
		$this->service_model->update_service_id_service_model($this->input->post('idServiceM'),$data_update_service);
	}
	
	public function function_delete_service_id_produits()
	{
			$id_service = $this->input->post('id_service');
			$tabimages =$this->service_model->get_images_nb_by_id_service_model($id_service);
			switch ($tabimages['nb_images']) {
					case '0':
						$images ='non';
						break;
					case '1':
							$urlimage = explode(".com/", $tabimages['images_services']);
							unlink($urlimage[1]);
						break;
					default:
					$tbimages = explode(";", $tabimages['images_services']);
					foreach($tbimages as $image)
						{
							$urlimage = explode(".com/", $image);
							unlink($urlimage[1]);
						}
				}
				
			
			$this->service_model->delete_service_model($id_service);
	}
	
	public function function_pub_service_id_services()
	{
		$data_update_service = array('status' => 2 );
		$this->service_model->update_service_id_service_model($this->input->post('id_service'),$data_update_service);
	}
	public function function_encours_service_id_services()
	{
		$data_update_service = array('status' => 1 );
		$this->service_model->update_service_id_service_model($this->input->post('id_service'),$data_update_service);
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
	
	function fun_get_images_service()
	{
		$data['tabimages'] =$this->service_model->get_images_by_id_service_model($this->input->get('id_service'));
		//$data['tabimages'] = explode(";", $tabimages['images']);
		$this->load->view('slider_images_service_views',$data);
	}
	
	function fun_get_to_update_images_fp()
	{
		$data['tabimages'] =$this->service_model->get_images_by_id_service_model($this->input->get('id_service'));
		//$data['tabimages'] = explode(";", $tabimages['images']);
		$this->load->view('update_images_service_views',$data);
	}
	

	
}
