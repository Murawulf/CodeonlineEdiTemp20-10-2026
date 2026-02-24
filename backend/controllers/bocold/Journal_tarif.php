<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Journal_tarif extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->library('encrypt');
        $this->load->model('tarif_model');
        $this->load->model('journal_tarif_model');
        $this->load->model('produits_vrac_model');
		$this->load->model('regions_model');
		$this->load->model('anomalies_p_vrac_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => 'active', 'activepanier' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activemarche' => '',
				'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
				$data['date_jour'] = date("d/m/Y");
            if ($this->session->userdata('profil') == '4') {//chef regions
                $region = $this->session->userdata('region');
                $list_date = $this->journal_tarif_model->get_all_date_tarif_by_mois_model($region);
				$data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
                $data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
                $tab_dates = '';
                foreach ($list_date as $date) {
                    $dates = explode('/', $date['date_journ']);
                    if($dates[0][0] == 0){$d = substr($dates[0],1);}else{$d = $dates[0];}//$d = $dates[0];//$m = $dates[1];
					if($dates[1][0] == 0){$m = substr($dates[1],1);}else{$m = $dates[1];}
                    $y = $dates[2]; // $day = $y . '/' . $m . '/' . $d;//if ((strtotime($day) >= $this->debutMois()) && (strtotime($day) <= $this->finMois())) {
                    $day = $d . '/' . $m . '/' . $y;
					$tab_dates[] = $day;
                }
                $data['list_dates'] = $tab_dates;
                $this->load->view('boc/Journal_tarif_chefregion_views', $data);
            } else if($this->session->userdata('profil') == '2') {//municipalite
				$marches ='';
				$id_user = $this->session->userdata('id_user');
				$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
					if(count($allmarches) !=1)
					{
						$or='';
						foreach($allmarches as $marche){
								$marches.=$or."`jt`.`id_marche`=".$marche['id_marche'];
								$or=' OR ';
							}
					}else{
							foreach($allmarches as $marche){
								$marches="`jt`.`id_marche`=".$marche['id_marche'];
							}
						}
					/*foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);*/
				//var_dump($marches);
                $list_date = $this->journal_tarif_model->get_all_date_tarif_municipalite_by_mois_model($marches);
				//var_dump($list_date);
				$data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
                $data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
                $tab_dates = '';
                foreach ($list_date  as $date) {
					if(!empty($date['date_journ'])){
                    $dates = explode('/', $date['date_journ']);
                    if($dates[0][0] == 0){$d = substr($dates[0],1);}else{$d = $dates[0];}
					//$d = $dates[0];
                    //$m = $dates[1];
					if($dates[1][0] == 0){$m = substr($dates[1],1);}else{$m = $dates[1];}
                    $y = $dates[2];
                   // $day = $y . '/' . $m . '/' . $d;

                    //if ((strtotime($day) >= $this->debutMois()) && (strtotime($day) <= $this->finMois())) {
                        $day = $d . '/' . $m . '/' . $y;
						$tab_dates[] = $day;
						//"1/12/2018"]
                    //}
					}
                }
                $data['list_dates'] = $tab_dates;
                $this->load->view('boc/Journal_tarif_chefregion_views', $data);
			}else if($this->session->userdata('profil') == '7') {
				$data['list_regions']= $this->tarif_model->get_all_region_model();
                $this->load->view('boc/Journal_tarif_onap_views', $data);
			}else if(($this->session->userdata('profil') == '9')||($this->session->userdata('profil') == '8')) {
				$data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
                $data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
                $data['list_regions'] = $this->tarif_model->get_all_region_model();
                $this->load->view('boc/Journal_tarif_cdr_views', $data);
            }else if ($this->session->userdata('profil') == '11') {//APIP Commandant de port
				$marches='';
				$id_user = $this->session->userdata('id_user');
				$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
					foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);
                $list_date = $this->journal_tarif_model->get_all_date_tarif_municipalite_by_mois_model($marches);
				$list_date = $this->journal_tarif_model->get_poissons_all_date_tarif_by_mois_by_marche_model($marches);
                //$list_date = $this->journal_tarif_model->get_poissons_all_date_tarif_by_mois_model($region);
				//$data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
                //$data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
                $tab_dates = '';
                foreach ($list_date as $date) {
                    $dates = explode('/', $date['date_journ']);
                    if($dates[0][0] == 0){$d = substr($dates[0],1);}else{$d = $dates[0];}//$d = $dates[0];//$m = $dates[1];
					if($dates[1][0] == 0){$m = substr($dates[1],1);}else{$m = $dates[1];}
                    $y = $dates[2]; // $day = $y . '/' . $m . '/' . $d;//if ((strtotime($day) >= $this->debutMois()) && (strtotime($day) <= $this->finMois())) {
                    $day = $d . '/' . $m . '/' . $y;
					$tab_dates[] = $day;
                }
                $data['list_dates'] = $tab_dates;
                $this->load->view('boc/Journal_tarif_chefregion_views', $data);
            }else {
                $data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
                $data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
                $data['list_regions'] = $this->tarif_model->get_all_region_model();
                $this->load->view('boc/Journal_tarif_views', $data);
            }
        } else {
            header("Location:login");
        }
    }

    public function function_get_all_journal_tarif() {
        $id_profil = $this->session->userdata('profil');
        $list_jt = $this->journal_tarif_model->get_all_journal_tarif_model($id_profil);
        $this->output->set_content_type('application/json')->set_output(json_encode($list_jt));
    }


    public function function_view_tab_journal_tarif_by_date() {
        $date_jour = $this->input->get('dt');
        $data['date_jour'] = $date_jour;
        $data['list_produit'] = $this->journal_tarif_model->get_distinct_produit_by_date_model($date_jour);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_model();
		
		$this->load->view('boc/journal_tarif_tab_views', $data);
    }

    public function function_view_tab_journal_tarif_by_date_produit() {
        $date_jour = $this->input->get('dt');
        $produit = $this->input->get('idp');
        $data['date_jour'] = $date_jour;
        $data['list_produit'] = $this->journal_tarif_model->get_produit_by_date_model($date_jour, $produit);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_model();
        $this->load->view('boc/journal_tarif_tab_views', $data);
    }
	
	 public function function_view_tab_journal_tarif_by_date_region_produit() {
        $date_jour = $this->input->get('dt');
        $produit = $this->input->get('idp');
		$region = $this->session->userdata('region');
        $data['date_jour'] = $date_jour;
        $data['list_produit'] = $this->journal_tarif_model->get_produit_by_date_model($date_jour, $produit);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_by_region_model($region);
        $this->load->view('boc/journal_tarif_tab_views', $data);
    }

    public function function_view_tab_journal_tarif_by_date_by_marche() {
        $date_jour = $this->input->get('dtj');
        $marche = $this->input->get('m');
        $data['date_jour'] = $date_jour;
		$marchee = $this->regions_model->get_marche_by_id_model($marche);
		$data['name_marche'] = $marchee['libelle_marche_ar'];
        $data['list_produit'] = $this->journal_tarif_model->get_distinct_produit_by_date_marche_model($date_jour, $marche);
        $this->load->view('boc/journal_tarif_date_marche_tab_views', $data);
    }

    public function function_view_tab_journal_tarif_by_date_region() {
        $date_jour = $this->input->get('dt');
        $data['date_jour'] = $date_jour;
        if ($this->session->userdata('profil') == '4') {
            $region = $this->session->userdata('region');
        } else {
            $region = $this->input->get('idr');
        }
        $data['list_produit'] = $this->journal_tarif_model->get_distinct_produit_by_date_region_model($date_jour, $region);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_by_region_model($region);

        $this->load->view('boc/journal_tarif_tab_views', $data);
    }

    public function function_view_tab_journal_tarif_by_date_by_region() {
        $date_jour = $this->input->post('date_jour');
		if ($this->session->userdata('profil') == '2') {
			$marches='';
				$id_user = $this->session->userdata('id_user');
				$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
						foreach($allmarches as $marche)
							{
								$marches[] = $marche['id_marche'];
							}
            $list_marches_d_r = $this->journal_tarif_model->get_distinct_marche_by_date_by_municipalite_model($date_jour, $marches);
        } else if ($this->session->userdata('profil') == '11'){
            $region = $this->session->userdata('region');
			$marches='';
				$id_user = $this->session->userdata('id_user');
				$allmarches = $this->tarif_model->get_marche_by_user_model($id_user);
					foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);
			$list_marches_d_r = $this->journal_tarif_model->get_distinct_marche_poissons_by_date_by_marche_model($date_jour, $marches);
        } else {
            $region = $this->session->userdata('region');
			$list_marches_d_r = $this->journal_tarif_model->get_distinct_marche_by_date_by_region_model($date_jour, $region);
        }
        $this->output->set_content_type('application/json')->set_output(json_encode($list_marches_d_r));
    }

    function get_url_views_journal_traif_pdf() {
        $date_jour_crypt = rawurlencode($this->encrypt->encode($this->input->post('date_jour')));

        $new_path = "boc/journal_tarif/fun_journal_traif_pdf?dt=" . $date_jour_crypt;
        $pagemarquage_ca = "http://" . $_SERVER['HTTP_HOST'] . "/" . $new_path;
        echo $pagemarquage_ca;
        return;
    }

    function fun_journal_traif_pdf() {
        $date_jour = rawurldecode($this->encrypt->decode($this->input->get('dt')));
        $data['date_jour'] = $date_jour;
        $data['list_produit'] = $this->journal_tarif_model->get_distinct_produit_by_date_model($date_jour);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_model();
        $this->load->view('boc/pdf/journal_tarif_views_pdf_fr', $data);
    }

    function get_url_views_journal_traif_pdf_ar() {
        $date_jour_crypt = rawurlencode($this->encrypt->encode($this->input->post('date_jour')));

        $new_path = "boc/journal_tarif/fun_journal_traif_pdf_ar?dt=" . $date_jour_crypt;
        $pagemarquage_ca = "http://" . $_SERVER['HTTP_HOST'] . "/" . $new_path;
        echo $pagemarquage_ca;
        return;
    }

    function fun_journal_traif_pdf_ar() {
        $date_jour = rawurldecode($this->encrypt->decode($this->input->get('dt')));
        $data['date_jour'] = $date_jour;
        $data['list_produit'] = $this->journal_tarif_model->get_distinct_produit_by_date_model($date_jour);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_model();
        $this->load->view('boc/pdf/journal_tarif_views_pdf_ar', $data);
    }

    function function_pub_journal_tarif() {
		date_default_timezone_set('Africa/Tunis');
        $date_jour = $this->input->post('date_jr');
		$h= date("G");
		$h.=':'.date("i");
		$old_date_jour=$this->journal_tarif_model->get_journal_tarif_model();
		$data_date = array('date_journal_valide' => $date_jour,'heure' =>$h);
        $this->journal_tarif_model->pub_journal_tarif_model($data_date);
		//$this->function_marq_tarif_to_anomalie($date_jour);
		if($old_date_jour['date_journal_valide'] === $date_jour)
		{
			$this->send_message();
		}
    }
	
	function send_message(){
        //$message = $this->input->post("message");
		$message = "Publication  de l’après midi.  Consulter vos marchés - Fruits - Légumes - Poissons pour découvrir de possibles  baisses de prix. مـنذ حـيـن  تـمّــت  نـشرة  الأســعـار  لـما  بعـد  الظــهـر إغــتـنــم  الـفـرصـة  للـتـثـبت  مـن  بعض  الإنـخــفــاظـات  في  أسـعـار الـخُـضـر و الـغِـلال  و  الأسـمـاك";
        $content = array(
            "en" => "$message"
        );

        $fields = array(
        'app_id' => "b07178fe-d276-4a2e-a889-8b06564830da",
        'included_segments' => array('All'),
        'data' => array("foo" => "bar"),
        'large_icon' =>"https://codeonline-info.com/assets/img/logo_INFO.png",
        'contents' => $content,
        );

        $fields = json_encode($fields);


        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://onesignal.com/api/v1/notifications");
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json; charset=utf-8',
            'Authorization: Basic YmQ2MTVlMjktMmQ4Zi00NzU0LWE1ZTItYmNiYWVkMDNjZjUx'));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
        curl_setopt($ch, CURLOPT_HEADER, FALSE);
        curl_setopt($ch, CURLOPT_POST, TRUE);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $fields);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);

        $response = curl_exec($ch);
        curl_close($ch);
       return $response;
    }

    function function_view_tab_panier_by_date() {
        $date_jour = $this->input->get('dtp');
        $data['date_jour'] = $date_jour;
        $data['list_produit'] = $this->journal_tarif_model->get_distinct_produit_for_panier_by_date_model($date_jour);
        $data['list_marche'] = $this->journal_tarif_model->get_all_marche_model();
        $this->load->view('boc/panier_tab_views', $data);
    }

    function debutMois() {
        $year = date("Y");
        $month = date("m");
        $firstday = $year . "/" . $month . "/01";
        return strtotime($firstday);
    }

    function finMois() {
        $year = date("Y");
        $month = date("m");
        $day = date("t");
        $lastday = $year . "/" . $month . "/" . $day;
        return strtotime($lastday);
    }
	
	 public function function_view_tab_journal_tarif_uonat() {
        $date_jour = $this->input->post('date_jour');
        $region = $this->input->post('region');
		$id_profil = $this->session->userdata('profil');
		if($id_profil != 10){
			$list_marches_d_r = $this->journal_tarif_model->get_distinct_marche_uonat_by_date_by_region_model($date_jour, $region, $id_profil);
		}else{$list_marches_d_r = $this->journal_tarif_model->get_distinct_marche_poisson_uonat_by_date_by_region_model($date_jour, $region, $id_profil);}
       
        $this->output->set_content_type('application/json')->set_output(json_encode($list_marches_d_r));
    }
	function marches_non_valide(){
		
        $date_jour = $this->input->post('date_jour');
		$marches[]=false;
		$list_marches_v = $this->journal_tarif_model->marches_valide_model($date_jour);
		//$marches[]=array();
		foreach($list_marches_v as $marche)
				{
					$marches[] = $marche['id_marche_v'];
				}
		
        $list_marches = $this->journal_tarif_model->marches_non_valide_model($date_jour,$marches);
		if ($this->session->userdata('profil') == '1') {
						$th = '<th></th>';
						 $tab_marches='<table class="table table-bordered table-striped"><thead><tr><th>Région</th><th>Marché</th>'.$th.'</tr></thead><tbody>';
					}else{ $tab_marches='<table class="table table-bordered table-striped"><thead><tr><th>Région</th><th>Marché</th></tr></thead><tbody>';}
       
		foreach($list_marches as $march)
				{
					if ($this->session->userdata('profil') == '1') {
						
						$td = '<td><button class="btn btn-success" style="padding: 4px 13px 0px 0px;"  onclick="msgbox_confirm_marche(\''.addslashes($date_jour).'\',\''.addslashes($march['id_marche']).'\')" type="button"><i class="btn-icon-only icon-ok"></i></button></td>';
						$tab_marches .= '<tr id="'.$march['id_marche'].'"><td class="description">'.$march['libelle_region_fr'].' '.$march['libelle_region_ar'].'</td><td class="value"><span>'.$march['libelle_marche_fr'].' '.$march['libelle_marche_ar'].'</span></td>'.$td.'</tr>';
					}else{$tab_marches .= '<tr id="'.$march['id_marche'].'"><td class="description">'.$march['libelle_region_fr'].' '.$march['libelle_region_ar'].'</td><td class="value"><span>'.$march['libelle_marche_fr'].' '.$march['libelle_marche_ar'].'</span></td></tr>';}
					 
				}
		 $tab_marches .='</tbody></table>';
		$this->output->set_content_type('application/json')->set_output(json_encode( $tab_marches));
    }
	function function_marq_tarif_to_anomalie($date_jour){
		date_default_timezone_set('Africa/Tunis');
		$list_tarifs = $this->journal_tarif_model->get_tarif_marq_by_jdate_model($date_jour);
		foreach($list_tarifs as $tarif)
			{
				$h= date("G");
				$h.=':'.date("i");
				$data_tarif = array(
                'id_marche' => $tarif['id_marche'],
                'id_fiche_produit' => $tarif['id_produit_ref'],
                'id_user' => 1,
                'hors_marche' => 0,
                'date_anomalie' =>  date("Y/m/d"),
                'heure_anomalie' => $h,
                'long_anomalie' => $tarif['marche_long'],
				'lati_anomalie' => $tarif['marche_lat'],
				'region_anomalie' => $tarif['maps_name'],
				'zip_code' => 0,
				'id_type_anomalie' => 2
				);
				$this->anomalies_p_vrac_model->add_anomalies_p_vrac($data_tarif);
			}
	}

}
