<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Home extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
		$this->load->model('regions_model');
		$this->load->model('companies_model');
		$this->load->model('produits_conditionne_model');
;
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => 'active', 'activeprodcon' => '', 'activeprofil' => '','activeservice' => '' );
			$data['list_regions']= $this->regions_model->get_all_regions_model();
			$data['OCompanie']= $this->companies_model->get_entreprise_model($this->session->userdata('id_user'));
			$data['Oinforegion']= [];
			if ($this->session->userdata('region') != '') {
				
				$data['Oinforegion']= $this->regions_model->get_region_delegation_model($this->session->userdata('region'));
				$data['delegations']= $this->regions_model->get_delegation_by_region_model($data['Oinforegion']['id_region']);
				$data['localites']= $this->regions_model->function_get_localite_by_delegation_model($data['Oinforegion']['delegation']);
			}
            $this->load->view('home_views', $data);
        } else {
            header("Location:login");
        }
    }
	
	public function function_get_graoh(){
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$v=',';
		$series='';

				$secteurs = $this->companies_model->get_all_segment_by_producteur_garph_model($this->session->userdata('id_user'));
				$true ='true, true';
				if(count($secteurs)!=1)
				{				
					$data['title']='Nombre de fiches Produits publiées par secteur';
					foreach ($secteurs as $secteur) {
							$nb_fp = $this->produits_conditionne_model->get_nb_produits_condit_pub_by_segment_companies_model($secteur['codeSegment'],$this->session->userdata('id_user'));
						if($nb_fp['nb_fp']!= 0){
							$series.='["'.$secteur['libelleSegment'].' / '.$nb_fp['nb_fp'].'",'.$nb_fp['nb_fp'].','.$true.']'.$v;
							$true ='false';
						}
					}
				}else{
					$data['title']='Nombre de fiches Produits publiées par catégorie';
					$categories = $this->produits_conditionne_model->get_categories_by_segment_companies_model($secteurs[0]['codeSegment'],$this->session->userdata('id_user'));
					foreach ($categories as $categorie) {
							$nb_fp = $this->produits_conditionne_model->get_nb_produits_condit_by_Brique_companies_model($categorie['codeBrique'],$this->session->userdata('id_user'));
						if($nb_fp['nb_fp']!= 0){
							$series.='["'.$categorie['libelleBrique'].' / '.$nb_fp['nb_fp'].'",'.$nb_fp['nb_fp'].','.$true.']'.$v;
							$true ='false';
						}
					}
				}
		$data['series']=substr($series, 0, -1);

		$this->load->view('graph_views', $data);
	}
	
	public function function_get_graoh2()
	{
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$v=',';
		$series='';
		$secteurs = $this->companies_model->get_secteur_active_graph_model();
				
				$true ='true, true';
				foreach ($secteurs as $secteur) {
						$nb_ept = $this->companies_model->get_nb_produits_condit_pub_by_segment_model($secteur['codeSegment']);
					if($nb_ept['nb_fp']!=0)
					{
						$series.='["'.$secteur['libelleSegment'].'",'.$nb_ept['nb_fp'].']'.$v;
						$true ='false';
					}
				}
		$data['series']=substr($series, 0, -1);
		$this->load->view('graph2_views', $data);
	}

}
