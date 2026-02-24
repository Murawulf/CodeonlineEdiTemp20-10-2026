<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Marches_peripherique extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('municipalite_model');
				$this->load->model('tarif_model');
				$this->load->model('journal_tarif_model');
				$this->load->model('produits_vrac_model');				
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=> 'active', 'activejournaltarifcrd' => '');
		$marches ='';
				$id_municipalite = $this->session->userdata('id_municipalite');
				 $allmarches = $this->municipalite_model->get_marche_peripherique_by_id_municipalite_model($this->session->userdata('id_municipalite'));

					foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);
                $list_date = $this->journal_tarif_model->get_all_date_tarif_municipalite_by_mois_model($marches);
				$data['list_types'] = $this->produits_vrac_model->get_all_type_produits_vrac_model();
                $data['list_produits_v'] = $this->produits_vrac_model->get_all_produits_vrac_simple_model();
                $tab_dates = '';
                foreach ($list_date as $date) {
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

                $data['list_dates'] = $tab_dates;
                $this->load->view('boc/Journal_tarif_chefmunicipalite_peripherique_views', $data);		
				}else{ header("Location:login");}
				
	}

	public function function_view_tab_journal_tarif_by_date_by_marche_peripherique()
	{
		$date_jour = $this->input->post('date_jour');
			$marches ='';
			$id_municipalite = $this->session->userdata('id_municipalite');
				 $allmarches = $this->municipalite_model->get_marche_peripherique_by_id_municipalite_model($id_municipalite);
					foreach($allmarches as $marche)
						{
							$marches .= $marche['id_marche'].",";
						}
						$marches = substr($marches, 0, -1);
        $list_marches_d_r = $this->journal_tarif_model->get_distinct_marche_by_date_by_municipalite_model($date_jour, $marches);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_marches_d_r));
	}
	
}
