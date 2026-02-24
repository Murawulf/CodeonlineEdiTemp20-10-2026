<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Dashboard_comparatif_prix extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->model('dashboard_model');
		$this->load->model('regions_model');
		$this->load->model('produits_vrac_model');
		$this->load->model('tarif_model');
		$this->load->model('message_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => 'active','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
			if (($this->session->userdata('profil') == '1') || ($this->session->userdata('profil') == '3')||($this->session->userdata('profil') == '4')|| ($this->session->userdata('profil') == '7')|| ($this->session->userdata('profil') == '9')|| ($this->session->userdata('profil') == '8')) {
				$data['regions']=json_encode($this->regions_model->get_all_region_magicsuggest_model());
				$data['marches']=json_encode($this->regions_model->get_all_marche_magicsuggest_model());
				} elseif ($this->session->userdata('profil') == '4') {//chef regions
				$data['regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
				$data['marches']=json_encode($this->regions_model->get_marche_magicsuggest_by_region_model($this->session->userdata('region')));
				}elseif ($this->session->userdata('profil') == '11') {//chef apip cp
				$data['regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
				$marches='';
				$id_user = $this->session->userdata('id_user');
				$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
					foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);
				$data['marches']=json_encode($this->regions_model->get_marche_poisson_magicsuggest_by_marche_model($marches));	
				}elseif ($this->session->userdata('profil') == '10') {//chef regions
				$data['regions']=$this->regions_model->get_all_regions_mgp_model();
				$data['marches']=json_encode($this->regions_model->get_all_marche_poisson_magicsuggest_model());	
				}else if ($this->session->userdata('profil') == '2'){
					$marches='';
					$id_user = $this->session->userdata('id_user');
					$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);

						foreach($allmarches as $marche)
							{
								 $marches[] = $marche['id_marche'];
							}
					$data['marches']=json_encode($this->message_model->get_all_marche_magicsuggest_by_municipalite_model($marches));
					$data['regions'] = $this->regions_model->get_marches_by_region_model($this->session->userdata('region'));
				}
			
			if(($this->session->userdata('profil') == '11')||($this->session->userdata('profil') == '10'))
			{
				$produits_vrac=$this->produits_vrac_model->get_produits_poisson_vrac_magicsuggest_model();
			}else{
				$produits_vrac=$this->produits_vrac_model->get_all_produits_vrac_magicsuggest_model();
			} 
			
			$data['produits_vrac']=json_encode($produits_vrac);
			$data['profil']=$this->session->userdata('profil');
			
            $this->load->view('boc/dashboard_comparatif_prix', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function function_get_grah_prix(){
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$id_regions = $this->input->get('r');
        $id_produit = $this->input->get('p');
		$day = $this->input->get('sd');
		$statut_marche = $this->input->get('tm');
		$v=',';
		$series='';
		if(mb_substr_count($id_regions, ",") != 0)
		{
			$regions = explode(",", $id_regions);
			foreach ($regions as $region) {
				$tarif_produit_vracs = $this->dashboard_model->get_tarif_produit_vrac_by_region_graph_model($region,$id_produit,$day,$statut_marche);
				if(!empty($tarif_produit_vracs))
				{
					foreach ($tarif_produit_vracs as $tarif_produit_vrac) {
						$series.='["'.$tarif_produit_vrac['libelle_region_ar'].' - '.$tarif_produit_vrac['libelle_marche_ar'].'",'.$tarif_produit_vrac['prix_max'].']'.$v;
					}
					//$series.='["'.$tarif_produit_vrac['libelle_region_ar'].' - '.$tarif_produit_vrac['libelle_marche_ar'].'", ['.$tarif_produit_vrac['prix_max'].','.$tarif_produit_vrac['prix_min'].']]'.$v;
				}else{
					//$series.='["'.$region['libelle_region_fr'].'",0]'.$v;
				}		
			}
			
		}else{
			if($id_regions == ''){
			$regions=$this->regions_model->get_all_regions_model();
			foreach ($regions as $region) {
				$tarif_produit_vracs = $this->dashboard_model->get_tarif_produit_vrac_by_region_graph_model($region['id_region'],$id_produit,$day,$statut_marche);
				if(!empty($tarif_produit_vracs))
				{
					foreach ($tarif_produit_vracs as $tarif_produit_vrac) {
						$series.='["'.$tarif_produit_vrac['libelle_region_ar'].' - '.$tarif_produit_vrac['libelle_marche_ar'].'",'.$tarif_produit_vrac['prix_usage'].']'.$v;
					}
				}else{
				}		
			}
			}else{
				$tarif_produit_vracs = $this->dashboard_model->get_tarif_produit_vrac_by_region_graph_model($id_regions,$id_produit,$day,$statut_marche);
				if(!empty($tarif_produit_vracs))
				{
					foreach ($tarif_produit_vracs as $tarif_produit_vrac) {
						$series.='["'.$tarif_produit_vrac['libelle_region_ar'].' - '.$tarif_produit_vrac['libelle_marche_ar'].'",'.$tarif_produit_vrac['prix_usage'].']'.$v;
					}
				}else{
				}		
			}
		}
		$produit=$this->produits_vrac_model->get_produits_vrac_by_id_model($id_produit);
		$data['produit'] = $produit['libelle_court_fr'].' - '.$produit['libelle_court_ar'];
		$data['series'] = substr($series, 0, -1);
		list($d, $m, $y) = explode("/", $day);
		$nom_jour_fr = array('Sun'=>"Dimanche", 'Mon'=>"Lundi", 'Tue'=>"Mardi", 'Wed'=>"Mercredi", 'Thu'=>"Jeudi", 'Fri'=>"Vendredi", 'Sat'=>"Samedi");

		$mois_fr = Array('01'=>"janvier", '02'=>"février", '03'=>"mars", '04'=>"avril", '05'=>"mai", '06'=>"juin",'07'=>"juillet", '08'=>"août", 
        '09'=>"septembre", '10'=>"octobre", '11'=>"novembre", '12'=>"décembre");
		$data['labels'] = $nom_jour_fr[date('D', strtotime($y.'/'.$m.'/'.$d))].' '.$d.' '.$mois_fr[$m].' '.$y;
		$this->load->view('boc/graph_comparatif_prix_views', $data);
	}
	
	public function function_get_marche_by_region(){
		if($this->session->userdata('profil') == '10')
			{
				$marches=$this->regions_model->get_marche_poisson_magicsuggest_by_region_model($this->input->post('id_region'));
			}else{
				//$marches=$this->regions_model->get_marche_magicsuggest_by_region_order_by_marche_model($this->input->post('id_region'));
				$marches=$this->regions_model->get_marche_magicsuggest_by_region_order_by_marche_d_model($this->input->post('id_region'),$this->input->post('id_produit'),$this->input->post('day'));
			} 		
		$this->output->set_content_type('application/json')->set_output(json_encode($marches));
	}


}
