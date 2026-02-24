<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Contrat_municipalite extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('municipalite_model');
				$this->load->model('regions_model');
				$this->load->model('logistique_model');				
        }
		
	public function index()
	{ 
				if($this->session->userdata('name')!='')
				{
				$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '','activesim'=>'','activecontrat' => 'active', 'activephone'=> '');
						$data['regions']= $this->regions_model->get_all_regions_model();
						$data['municipalites']= $this->municipalite_model->get_all_municipalites_model();
						$data['sims']= $this->logistique_model->get_sims_no_affect_model();
						$data['handsets']= $this->logistique_model->get_handsets_no_affect_model();
						$this->load->view('boc/contrat_municipalite_views',$data);			
				}else{ header("Location:login");}
				
	}
	 
	public function function_get_contrat_municipalite()
	{
			$list_contrat_municipalite=$this->municipalite_model->get_contrat_municipalite_model();
			//print_r($list_abonnes);
			$this->output->set_content_type('application/json')->set_output(json_encode($list_contrat_municipalite));					
	}
	
	
	public function add_contrat_municipalite()
	{		
			 $data_ajouter_contrat_municipalite = array(
				   'id_mun_ref' => $this->input->post('id_mun_ref') ,
				   'date_contrat' => $this->input->post('date_contrat') ,
				   'date_deploiement' => $this->input->post('date_deploiement')  ,
				   'date_renouvellement' => $this->input->post('date_renouvellement')  ,
				   'forfait_base' => $this->input->post('forfait_base') ,
				   'marches_sup' => $this->input->post('marches_sup') ,
				   'nbre_tv' => $this->input->post('nbre_tv')  ,
				   'nbre_pack_com' => $this->input->post('nbre_pack_com')  ,
				   'id_municipalite' => $this->input->post('id_municipalite')
				);
			$id_app = $this->municipalite_model->add_contrat_municipalite_model($data_ajouter_contrat_municipalite);
	}
	
	public function add_packtt()
	{
		if(($this->input->post('id_sim') != 0) && ($this->input->post('id_handset') != 0))
		{
			$data_ajouter_handset = array(
					   'id_item_mun_ref' => $this->input->post('id_item_mun_ref') ,
					   'date_livraison' => $this->input->post('date_livraison') ,
					   'id_contrat' => $this->input->post('id_contrat_phone'),
					   'id_sim' => $this->input->post('id_sim'),
					   'id_handset' => $this->input->post('id_handset'),
					   'nom_user' => $this->input->post('nom_user'),
					   'cin' => $this->input->post('cin')
					);
				$set_handset = array( 'affect' => 1);
				$this->logistique_model->update_handset_model($set_handset,$this->input->post('id_handset'));
				$set_sim = array( 'affect' => 1);
				$this->logistique_model->update_sim_model($set_sim,$this->input->post('id_sim'));
				
		}else if(($this->input->post('id_sim') == 0) && ($this->input->post('id_handset') != 0))
		{			
		$data_ajouter_handset = array(
				   'id_item_mun_ref' => $this->input->post('id_item_mun_ref') ,
				   'date_livraison' => $this->input->post('date_livraison') ,
				   'id_contrat' => $this->input->post('id_contrat_phone'),
				   'id_handset' => $this->input->post('id_handset'),
				   'nom_user' => $this->input->post('nom_user'),
				   'cin' => $this->input->post('cin')
				);
				$set_handset = array( 'affect' => 1);
				$this->logistique_model->update_handset_model($set_handset,$this->input->post('id_handset'));
		}else if(($this->input->post('id_sim') != 0) && ($this->input->post('id_handset') == 0))
		{
			$data_ajouter_handset = array(
					   'id_item_mun_ref' => $this->input->post('id_item_mun_ref') ,
					   'date_livraison' => $this->input->post('date_livraison') ,
					    'id_contrat' => $this->input->post('id_contrat_phone'),
					   'id_sim' => $this->input->post('id_sim'),
					   'nom_user' => $this->input->post('nom_user'),
					   'cin' => $this->input->post('cin')
					);
			$set_sim = array( 'affect' => 1);
				$this->logistique_model->update_sim_model($set_sim,$this->input->post('id_sim'));
		}
			$id_app = $this->municipalite_model->add_handset_model($data_ajouter_handset);
	}
	
	public function add_facture()
	{
		$data_ajouter_facture = array(
				   'id_fac_mun_ref' => $this->input->post('id_fac_mun_ref') ,
				   'date_facture' => $this->input->post('date_facture') ,
				   'montant_ht' => $this->input->post('montant_ht')  ,
				   'tva' => $this->input->post('tva')  ,
				   'montant_ttc' => $this->input->post('montant_ttc') ,
				   'echeance' => $this->input->post('echeance') ,
				   'date_encaissement' => $this->input->post('date_encaissement')  ,
				   'id_contrat' => $this->input->post('id_contrat_facture')
				);
			$id_app = $this->municipalite_model->add_facture_model($data_ajouter_facture);
	}
	
	public function function_delete_abonne_id()
	{
		$id_abonne = $this->input->post('id_abonne');
		$this->abonne_model->delete_abonne_mg_model($id_abonne);
		$this->abonne_model->delete_abonne_model($id_abonne);
	}
	
	public function function_update_municipalite()
	{
		$id_municipaliteM=$this->input->post('id_municipaliteM');
		$municipalite = str_replace(' ', '', $this->input->post('municipalite_frM'));
				 if (!empty($_FILES)){
					$tmp_name = $_FILES["imagemunicipaliteM"]["tmp_name"];
					$img = getimagesize($tmp_name);
					$fp = fopen($tmp_name, "rb");
				if ($img && $fp) {
					$name		= $_FILES["imagemunicipaliteM"]["name"];
					$upload_path = "assets/municipalite/".$name;
					if (move_uploaded_file($tmp_name, $upload_path)) {
						$path		= pathinfo($name);						
						$extension	= $path["extension"];
						$date		= date("Ymdhis", time());
						$xname      = $municipalite."_logo_" .$date. "." . $extension;
						$new_path	= "assets/municipalite/".$xname ;
						rename($upload_path, $new_path);
						$new_path	= "/municipalite/".$xname ;
						
					}	
				}
				$data_update_municipalite = array(
					   'libelle_municipalite_fr' => $this->input->post('municipalite_frM') ,
					   'libelle_municipalite_ar' => $this->input->post('municipalite_arM')  ,
					   'id_region' => $this->input->post('id_regionM')  ,
					   'logo' => $new_path,
					   'date_mis_a_jour_m' => date("Y-m-d H:i:s")
					);
				}else{
					$data_update_municipalite = array(
					   'libelle_municipalite_fr' => $this->input->post('municipalite_frM') ,
					   'libelle_municipalite_ar' => $this->input->post('municipalite_arM')  ,
					   'id_region' => $this->input->post('id_regionM')  ,
					   'date_mis_a_jour_m' => date("Y-m-d H:i:s")
					);
				}
				
			
			$this->municipalite_model->update_municipalite_id_municipalite_model($id_municipaliteM,$data_update_municipalite);	
	}
	
	public function function_get_marche_by_id_municipalite(){
		$marches= $this->municipalite_model->get_marches_model();
		$this->output->set_content_type('application/json')->set_output(json_encode($marches));
	}
	
	public function function_update_municipalite_marches_peripherique(){
		$this->municipalite_model->delete_municipalite_marches_peripherique_model($this->input->post('id_municipalite_peripheriqueM'));
			$marches = explode(",", $this->input->post('ms_id_municipalite_marches'));

            foreach ($marches as $marche) {
                $data_ajouter_municipalite_marche = array(
                    'id_municipalite' => $this->input->post('id_municipalite_peripheriqueM'),
                    'id_marche' => $marche
                );

                $this->municipalite_model->add_municipalite_marche_peripherique_model($data_ajouter_municipalite_marche);
            }
	}
	
	public function marches_peripherique(){
		$data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=> 'active');
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
	}
	
	public function function_get_municipalite_marche_region() {
        $id_region = $this->input->post('region');
		$list_municipalites = $this->municipalite_model->get_municipalite_by_region_model($id_region);
		$this->output->set_content_type('application/json')->set_output(json_encode($list_municipalites));
	}
	
}
