<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Dashboard extends CI_Controller {

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
			if (($this->session->userdata('profil') == '1') || ($this->session->userdata('profil') == '3')|| ($this->session->userdata('profil') == '7')|| ($this->session->userdata('profil') == '9')|| ($this->session->userdata('profil') == '8')) {
				$data['regions']=$this->regions_model->get_all_regions_model();
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
					$data['regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
				}
			
			if(($this->session->userdata('profil') == '11')||($this->session->userdata('profil') == '10'))
			{
				$produits_vrac=$this->produits_vrac_model->get_produits_poisson_vrac_magicsuggest_model();
			}else{
				$produits_vrac=$this->produits_vrac_model->get_all_produits_vrac_magicsuggest_model();
			} 
			
			$data['produits_vrac']=json_encode($produits_vrac);
			$data['profil']=$this->session->userdata('profil');
			
            $this->load->view('boc/dashboard_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function function_get_graoh(){
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$marche = $this->input->get('m');
        $produits = $this->input->get('p');
		$start_day = $this->input->get('sd');
		$end_day = $this->input->get('ed');
		$v=',';
		$series='';
		if(mb_substr_count($produits, ",") != 0)
		{
			$list_produit = explode(",", $produits);
			
			foreach ($list_produit as $produit) {
				$tarif_produits_vrac=$this->dashboard_model->get_tarif_produits_vrac_graph_model($marche,$produit,$start_day,$end_day);
				$date='';
				foreach ($tarif_produits_vrac as $produit_vrac) {
					list($d, $m, $y) = explode("/", $produit_vrac['date_journ']);
					$m = $m-1;
					$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$produit_vrac['prix_usage'].']'.$v;	
				}
				$date = substr($date, 0, -1);
				$prod=$this->produits_vrac_model->get_produits_vrac_by_id_model($produit);
				$series.='{name: "'.$prod['libelle_court_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
			}
			
		}else{
			$tarif_produits_vrac=$this->dashboard_model->get_tarif_produits_vrac_graph_model($marche,$produits,$start_day,$end_day);
			$date='';
				foreach ($tarif_produits_vrac as $produit_vrac) {
					list($d, $m, $y) = explode("/", $produit_vrac['date_journ']);
					$m = $m-1;
					$date.='[Date.UTC('.$y.', '.$m.', '.$d.'), '.$produit_vrac['prix_usage'].']'.$v;	
				}
				$date = substr($date, 0, -1);
				$prod=$this->produits_vrac_model->get_produits_vrac_by_id_model($produits);
				$series.='{name: "'.$prod['libelle_court_fr'].'",data: ['.$date.'],marker: {enabled: false,symbol: "circle"}}'.$v;
		}
		$data['series']=substr($series, 0, -1);
		$marches = $this->regions_model->get_marche_by_id_model($marche);
		$data['marche']= $marches ['libelle_marche_fr'].' '.$marches ['libelle_marche_ar'].' sur la Période '.$start_day.' à '.$end_day;
		$this->load->view('boc/graph_views', $data);
	}
	
	public function function_get_marche_by_region(){
		if($this->session->userdata('profil') == '10')
			{
				$marches=$this->regions_model->get_marche_poisson_magicsuggest_by_region_model($this->input->post('id_region'));
			}else{
				$marches=$this->regions_model->get_marche_magicsuggest_by_region_order_by_marche_model($this->input->post('id_region'));
			} 		
		$this->output->set_content_type('application/json')->set_output(json_encode($marches));
	}


}
