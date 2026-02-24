<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Dashboard_mg extends CI_Controller {

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
				$data['regions']=json_encode($this->regions_model->get_all_region_magicsuggest_model());
				//$data['marches']=json_encode($this->regions_model->get_all_marche_magicsuggest_model());
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
			
            $this->load->view('boc/dashboard_mg_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function function_get_grah_prix_quantite(){
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$id_regions = $this->input->get('r');
        $id_produit = $this->input->get('p');
		$start_day = $this->input->get('sd');
		$end_day = $this->input->get('ed');
		$statut_marche = $this->input->get('tm');
		$text_json=false;
		$v=',';
		$datejson='';
		$prixjson='';
		$quantitejson='';
		$marchejson='';
		$all_series='';
		
		if(!mb_substr_count($id_regions, ",") != 0)
		{
			if($id_regions == ''){
				$tarif_quantites_produit_vrac=$this->dashboard_model->get_tarif_quantite_produits_mg_vrac_graph_model($id_produit,$start_day,$end_day,$statut_marche);
				foreach ($tarif_quantites_produit_vrac as $tarif_quantite_produit_vrac) {
					list($d, $m, $y) = explode("/", $tarif_quantite_produit_vrac['date_journ']);
					//$m = $m-1;
					$avg_prix = $tarif_quantite_produit_vrac['sum_prix_usage']/$tarif_quantite_produit_vrac['nb_marche'];
					$datejson.='"'.$y.'/'.$m.'/'.$d.'"'.$v;
					$quantitejson.=$tarif_quantite_produit_vrac['quantite'].$v;
					$prixjson.=round($avg_prix).$v;
					$marchejson.=$tarif_quantite_produit_vrac['nb_marche'].$v;
				}
			}else{
				$tarif_quantites_produit_vrac=$this->dashboard_model->get_tarif_quantite_produits_mg_vrac_graph_by_region_model($id_produit,$start_day,$end_day,$statut_marche,$id_regions);
				foreach ($tarif_quantites_produit_vrac as $tarif_quantite_produit_vrac) {
						list($d, $m, $y) = explode("/", $tarif_quantite_produit_vrac['date_journ']);
						//$m = $m-1;
						$avg_prix = $tarif_quantite_produit_vrac['sum_prix_usage']/$tarif_quantite_produit_vrac['nb_marche'];
						$datejson.='"'.$y.'/'.$m.'/'.$d.'"'.$v;
						$quantitejson.=$tarif_quantite_produit_vrac['quantite'].$v;
						$prixjson.=round($avg_prix).$v;
						$marchejson.=$tarif_quantite_produit_vrac['nb_marche'].$v;
					}	
			}
		}else{	
			$regions = explode(",", $id_regions);
			//foreach ($regions as $region) {
					$tarif_quantites_produit_vrac=$this->dashboard_model->get_tarif_quantite_produits_mg_vrac_graph_by_regions_model($id_produit,$start_day,$end_day,$statut_marche,$id_regions);
					foreach ($tarif_quantites_produit_vrac as $tarif_quantite_produit_vrac) {
						list($d, $m, $y) = explode("/", $tarif_quantite_produit_vrac['date_journ']);
						//$m = $m-1;
						$avg_prix = $tarif_quantite_produit_vrac['sum_prix_usage']/$tarif_quantite_produit_vrac['nb_marche'];
						$datejson.='"'.$y.'/'.$m.'/'.$d.'"'.$v;
						$quantitejson.=$tarif_quantite_produit_vrac['quantite'].$v;
						$prixjson.=round($avg_prix).$v;
						$marchejson.=$tarif_quantite_produit_vrac['nb_marche'].$v;
					}
				
			//}
		}
				$prixjson = substr($prixjson, 0, -1);
				$seriesprix ='{"name": "Prix","data": ['.$prixjson.'],"unit": "Millimes","type": "spline"}'.$v;
				$quantitejson = substr($quantitejson, 0, -1);
				$seriesquantite ='{"name": "Quantité","data": ['.$quantitejson.'],"unit": "kg","type": "spline"}'.$v;
				$marchejson = substr($marchejson, 0, -1);
				$seriesmarche ='{"name": "Marchés","data": ['.$marchejson.'],"unit": "","type": "spline"}';
				$datejson = substr($datejson, 0, -1);
				$all_series=$seriesprix.$seriesquantite.$seriesmarche;
				$text_json = ($datejson != '') ? '{"xData": ['.$datejson.'],"datasets": ['.$all_series.']}' : false;
		list($d, $m, $y) = explode("/", $start_day);
		$m = $m-1;
		//$d = $d-1;
		$data['ustartday'] = 'Date.UTC('.$y.', '.$m.', '.$d.')';  
		$data['activity']=$text_json;
		$produit=$this->produits_vrac_model->get_produits_vrac_by_id_model($id_produit);
		$data['produit'] = $produit['libelle_court_fr'].' - '.$produit['libelle_court_ar'].' sur la Période '.$start_day.' à '.$end_day;;
		//$data['marche']= 'test';//$marches ['libelle_marche_fr'].' '.$marches ['libelle_marche_ar'].'
		$this->load->view('boc/grah_prix_quantite_views', $data);
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
