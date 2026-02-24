<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Tarif extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');

        $this->load->model('tarif_model');
        $this->load->model('produits_vrac_model');
        $this->load->model('users_model');
		$this->load->model('regions_model');
		$this->load->model('anomalies_p_vrac_model');
    }

    
    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => 'active', 'activejournaltarif' => '', 'activepanier' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activemarche' => '',
				'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');


            $data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
            $data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
            if ($this->session->userdata('profil') == '1') {
                $data['list_regions'] = $this->regions_model->get_all_regions_model();
                $data['list_marches'] = $this->tarif_model->get_all_marche_model();
                $this->load->view('boc/tarif_views', $data);
			} elseif (($this->session->userdata('profil') == '3') || ($this->session->userdata('profil') == '9')|| ($this->session->userdata('profil') == '8')) {
				$data['list_regions'] = $this->regions_model->get_all_regions_model();
                $data['list_marches'] = $this->tarif_model->get_all_marche_model();
                $this->load->view('boc/tarif_inc_views', $data);
            } elseif ($this->session->userdata('profil') == '4') {
                $data['date_jour'] = date("d/m/Y");
                $data['list_regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
                $data['list_marches'] = $this->tarif_model->get_all_marche_by_region_model($this->session->userdata('region'));
                $this->load->view('boc/tarif_chefregion_views', $data);
            } elseif ($this->session->userdata('profil') == '5') {
                $data['date_jour'] = date("d/m/Y");
                $data['list_regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
                $data['list_marches'] = $this->tarif_model->get_marche_by_user_model($this->session->userdata('id_user'));
				//if((date("H") > 5)&&(date("H") < 17))
				//{
				$this->load->view('boc/tarif_chefmarche_views', $data);
				//}else{
				//$this->load->view('boc/tarif_chefmarche_off_views', $data);
				//}
			} elseif ($this->session->userdata('profil') == '13') {
                $data['date_jour'] = date("d/m/Y");
                $data['marche'] = $this->tarif_model->get_marche_by_id_model(576);
				$produits_vrac = $this->produits_vrac_model->get_all_produits_vrac_with_code_magicsuggest_model();
				$data['produits_vrac']=json_encode($produits_vrac);
				$this->load->view('boc/tarif_sotumag_views', $data);
				/*if((date("H") > 5)&&(date("H") < 17))
				{
				$this->load->view('boc/tarif_sotumag_views', $data);
				}else{
				$this->load->view('boc/tarif_chefmarche_off_views', $data);}*/
            }elseif ($this->session->userdata('profil') == '2') {
                $data['date_jour'] = date("d/m/Y");
				$marches ='';
				$id_user = $this->session->userdata('id_user');
				$data['list_marches'] = $this->tarif_model->get_marche_by_user_model($id_user);
					/*foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);*/
                $data['list_regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
                //$data['list_marches'] = $this->tarif_model->get_all_marche_by_municipalite_model($marches);
                $this->load->view('boc/tarif_chefregion_views', $data);
            }elseif ($this->session->userdata('profil') == '10') {
				$data['list_regions'] = $this->regions_model->get_all_regions_mgp_model();;
                $data['list_marches'] = $this->tarif_model->get_all_marche_poisson_model();
                $this->load->view('boc/tarif_inc_views', $data);
            } elseif ($this->session->userdata('profil') == '11') {
                $data['date_jour'] = date("d/m/Y");
                $data['list_regions'] = $this->tarif_model->get_region_by_id_model($this->session->userdata('region'));
                $data['list_marches'] = $this->tarif_model->get_marche_by_user_model($this->session->userdata('id_user'));
                $this->load->view('boc/tarif_chefregion_views', $data);
            }
        } else {
            header("Location:login");
        }
    }

    public function function_get_marche_id_region() {
        $id_region = $this->input->post('id_region');
        //$list_pv=$this->produits_vrac_model->get_all_produits_vrac_model();
        if ($id_region != 0) {
            $list_marches = $this->tarif_model->get_all_marche_by_region_model($id_region);
        } else {
            $list_marches = $this->tarif_model->get_all_marche_model();
        }
		if ($this->session->userdata('profil') == '10'){$list_marches = $this->tarif_model->get_marche_poissons_by_region_model($id_region);}
        $this->output->set_content_type('application/json')->set_output(json_encode($list_marches));
    }

    public function function_get_produit_type_vc() {
        $type_vc = $this->input->post('type_vc');
        //$list_pv=$this->produits_vrac_model->get_all_produits_vrac_model();
        if ($type_vc != 0) {
            $list_produits_v = $this->produits_vrac_model->get_all_produits_vrac_simple_by_type_model($type_vc);
        } else {
            $list_produits_v = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
        }
        $this->output->set_content_type('application/json')->set_output(json_encode($list_produits_v));
    }

    public function function_add_tarif() {

        $datetarif = $this->input->post('datetarif');
        $dates = explode('/', $datetarif);
        $prix_estime=0;

        
        $d = $dates[0];
        $m = $dates[1];
        $y = $dates[2];
        $marche =$this->regions_model->get_marche_by_id_model($this->input->post('marche'));
		$produit_pvc =$this->produits_vrac_model->get_produits_vrac_by_id_model($this->input->post('produit'));
		$prix_estime=$this->function_c_prix_estime($this->input->post('prix_max'),$produit_pvc['id_type_prod_vrac']);
        $date_journ_en = $y . '/' . $m . '/' . $d;
		if(($marche['status']==2)||($marche['status']==3))
		{
			$data_ajouter_tarif = array(
				'id_produit_ref' => $this->input->post('produit'),
				'id_marche' => $this->input->post('marche'),
				'date_journ' => $this->input->post('datetarif'),
				'date_journ_en' => $date_journ_en,
				'prix_min' => $this->input->post('prix_min'),
				'prix_max' => $this->input->post('prix_max'),
				'prix_usage' => $this->input->post('prix_usage'),
				'quantite' => $this->input->post('quantite'),
				'prix_estime'=>$prix_estime,
				'panier ' => 0,
				'source_add_tarif'=> 1,
				'user_add' => $this->session->userdata('id_user'),
				'date_mis_a_jour_tarif' => date("Y-m-d H:i:s")
			);
		}elseif($marche['status']==1){
			$data_ajouter_tarif = array(
				'id_produit_ref' => $this->input->post('produit'),
				'id_marche' => $this->input->post('marche'),
				'date_journ' => $this->input->post('datetarif'),
				'date_journ_en' => $date_journ_en,
				'prix_min' => $this->input->post('prix_min'),
				'prix_max' => $this->input->post('prix_max'),
				'prix_usage' => $this->input->post('prix_usage'),
				'panier ' => 0,
				'source_add_tarif'=> 1,
				'user_add' => $this->session->userdata('id_user'),
				'date_mis_a_jour_tarif' => date("Y-m-d H:i:s")
			);
		}
        $this->tarif_model->add_tarif_model($data_ajouter_tarif);
    }

    public function function_get_all_tarif_by_date() {
        $datetarif = $this->input->post('datetarif');
        $marche = $this->input->post('marche');
        $list_tarif = $this->tarif_model->get_all_tarif_by_date_model($datetarif, $marche, $this->session->userdata('profil'));
        if (empty($list_tarif)) {
            $list_tarif = array();
        }
        $this->output->set_content_type('application/json')->set_output(json_encode($list_tarif));
    }

    public function fun_update_tarif() {
        $prix_estimeM=0;
		$id_journ_tarif = $this->input->post('id_journ_tarifM');
		$produit_pvc =$this->regions_model->get_id_produit_by_id_journal_model($id_journ_tarif);
		 $prix_estimeM=$this->function_c_prix_estime($this->input->post('prix_maxM'),$produit_pvc['id_type_prod_vrac']);
		$marche =$this->regions_model->get_type_marche_by_id_journal_model($id_journ_tarif);
		if(($marche['status']==2)||($marche['status']==3))
		{
			$data_update_tarif = array(
				'prix_min' => $this->input->post('prix_minM'),
				'prix_max' => $this->input->post('prix_maxM'),
				'prix_usage' => $this->input->post('prix_usageM'),
				'quantite' => $this->input->post('quantiteM'),
				'prix_estime'=>$prix_estimeM,
				'user_update' => $this->session->userdata('id_user'),
				'source_update_tarif'=> 1,
				'date_modification_tarif' => date("Y-m-d H:i:s")
			);
		}elseif($marche['status']==1){
			$data_update_tarif = array(
				'prix_min' => $this->input->post('prix_minM'),
				'prix_max' => $this->input->post('prix_maxM'),
				'prix_usage' => $this->input->post('prix_usageM'),
				'user_update' => $this->session->userdata('id_user'),
				'source_update_tarif'=> 1,
				'date_modification_tarif' => date("Y-m-d H:i:s")
			);
		}
        $this->tarif_model->update_tarif_model($data_update_tarif, $id_journ_tarif);
    }

    public function function_delete_tarif_id_jour_tarif() {
        $id_journ_tarif = $this->input->post('id_journ_tarif');
        $this->tarif_model->delete_tarif_model($id_journ_tarif);
    }

    public function function_get_date_proche_by_date_jour($datetarif, $marche) {

        $list_date = $this->tarif_model->date_proche_by_date_jour_model($datetarif, $marche);
        if (!empty($list_date)) {
            $data_max = $list_date[0]['date_journ'];

            foreach ($list_date as $date) {
                $data_max = max($date['date_journ'], $data_max);
            }
        } else {
            $data_max = $datetarif;
        }
        return $data_max;
    }

    public function function_get_date_by_date_jour() {
        $datetarif = $this->input->post('datetarif');
        $marche = $this->input->post('marche');
        $date_max_1 = $this->function_get_date_proche_by_date_jour($datetarif, $marche);
        $date_max_2 = $this->function_get_date_proche_by_date_jour($date_max_1, $marche);
        $journal = $this->tarif_model->get_journal_tarif_date_model($datetarif, $marche, $date_max_1, $date_max_2, $this->session->userdata('profil'));
        $this->output->set_content_type('application/json')->set_output(json_encode($journal));
    }

    public function function_valider_marche() {
        $datetarif = $this->input->post('datetarif');
        $marche = $this->input->post('marche');
        $data_v_marche = array(
            'id_marche_v' => $marche,
            'date' => $datetarif,
            'date_validation' => date("Y-m-d H:i:s")
        );
        $this->tarif_model->valider_marche_model($data_v_marche);
    }

    public function function_get_stus_valider_marche() {
        $datetarif = $this->input->post('datetarif');
        $marche = $this->input->post('marche');
        $marche_v = $this->tarif_model->get_valider_marche_model($datetarif, $marche);
		$stus = 0;
        if (!empty($marche_v)) {
			$stus = 1;
        }
		$marche_in = $this->tarif_model->get_taif_by_marche_model($marche,$datetarif);
		if(empty($marche_in)){$stus = 1;}
        echo $stus;
        return;
    }
	
	public function function_marquer_tarif_id_jour_tarif()
	{
		$id_journ_tarif = $this->input->post('id_journ_tarif');
		$prix_estime = $this->input->post('prix_estime');
        $data_update_tarif = array(
            'marquage' => 1,
            'maj' => 1,
            'date_modification_tarif' => date("Y-m-d H:i:s")
        );
        $this->tarif_model->update_tarif_model($data_update_tarif, $id_journ_tarif);
		$tarif = $this->tarif_model->get_tarif_marche_region_by_id_model($id_journ_tarif);
		$data_anomalie = array(
            'id_type_anomalie' => 2,
            'id_user' => 1,
            'id_fiche_produit' => $tarif['id_produit_ref'],
			'id_marche' => $tarif['id_marche'],
            'hors_marche' => 0,
            'heure_anomalie' => date("H:i"),
			'date_anomalie' => date("Y/m/d"),
			'id_user' => $this->session->userdata('id_user'),
			'source_anomalie' => 1,
			'long_anomalie' => $tarif['marche_long'],
			'lati_anomalie' => $tarif['marche_lat'],
			'region_anomalie' => $tarif['maps_name'],
			'prix_min_anom' => $tarif['prix_min'],
            'prix_max_anom' => $tarif['prix_max'],
            'prix_usage_anom' => $tarif['prix_usage'],
			'prix_estime_anom' => $prix_estime
        );
		$this->anomalies_p_vrac_model->add_anomalies_p_vrac($data_anomalie);
	}
	public function function_demarquer_tarif_id_jour_tarif()
		{
		$id_journ_tarif = $this->input->post('id_journ_tarif');

        $data_update_tarif = array(
            'marquage' => 0,
            'maj' => 1,
            'date_modification_tarif' => date("Y/m/d H:i:s")
        );
        $this->tarif_model->update_tarif_model($data_update_tarif, $id_journ_tarif);
	}
	
	public function function_c_prix_estime($prix_max,$id_type_prod_vrac)
	{	$prix=0;
		if($id_type_prod_vrac==5)
		{	
			if($prix_max <= 5000){$prix = $prix_max*1.30;}
			if($prix_max > 5000){$prix = $prix_max*1.25;}
			
		}else{
			if($prix_max <= 900){$prix = $prix_max*1.35;}
			if(($prix_max > 900)&&($prix_max <= 1500)){$prix = $prix_max*1.30;}
			if($prix_max > 1500){$prix = $prix_max*1.25;}
		}
		return $prix;																			
	}
	
	public function upload_tarif()
	{
		$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => 'active', 'activejournaltarif' => '', 'activepanier' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activemarche' => '',
				'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
		$this->load->view('boc/upload_tarif_views',$data );
	}

}
