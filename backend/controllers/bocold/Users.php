<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Users extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->model('users_model');
        $this->load->model('regions_model');
		$this->load->model('municipalite_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => 'active', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => '','activemarcheperipherique'=>'', 'activejournaltarifcrd' => '');
            $data['profils'] = $this->users_model->get_all_profil_model();
			$data['regions'] = $this->regions_model->get_all_regions_model();
			$data['municipalites'] = $this->municipalite_model->get_all_municipalites_model();
			$data['marches_gros'] = $this->regions_model->get_marches_gros_model();
			$data['marches_p_gros'] = $this->regions_model->get_marches_p_gros_model();
            $this->load->view('boc/users_views', $data);
        } else {
            header("Location:login");
        }
    }

    public function function_get_all_users() {

        $list_users = $this->users_model->get_all_users_model();
        $this->output->set_content_type('application/json')->set_output(json_encode($list_users));
    }
	
	public function function_get_marche_by_id_region(){
		if($this->input->post('id_profil') != 11){
		$id_regins= $this->regions_model->get_marches_by_region_model2($this->input->post('id_regin'));
		}else{
			$id_regins= $this->regions_model->get_marches_poissons_by_region_model2($this->input->post('id_regin'));}
		$this->output->set_content_type('application/json')->set_output(json_encode($id_regins));
	}

    public function function_get_region() {
        $id_profil = $this->input->post('id_profil');
        if ($id_profil == 3 || $id_profil == 6 || $id_profil == 7 || $id_profil == 9|| $id_profil == 8 || $id_profil == 10 || $id_profil == 15) {
            $region = '<option value="5" >Tout region</option>';
            $marche = '<option value="all_march" >Tout marche</option>';
        } elseif ($id_profil == 4) {
            $list_regions = $this->regions_model->get_all_regions_model();
            $region = '';

            foreach ($list_regions as $list_region) {
                if ($list_region['id_region'] != 99) {
                    $region .= '<option value="' . $list_region['id_region'] . '" >' . $list_region['libelle_region_fr'] . ' ' . $list_region['libelle_region_ar'] . '</option>';
                }
            }

            $marche = '<option value="all_march" >Tout marche</option>';
        } elseif ($id_profil == 5 || $id_profil == 2) {
            $list_regions = $this->regions_model->get_all_regions_model();
            $region = '<option value="">Choisir une region</option>';
            foreach ($list_regions as $list_region) {
                if ($list_region['id_region'] != 99) {
                    $region .= '<option value="' . $list_region['id_region'] . '" >' . $list_region['libelle_region_fr'] . ' ' . $list_region['libelle_region_ar'] . '</option>';
                }
            }
            $marche = '';
        } elseif ($id_profil == 11) {
            $list_regions = $this->regions_model->get_all_regions_mgp_model();
            $region = '';

            foreach ($list_regions as $list_region) {
                if ($list_region['id_region'] != 99) {
                    $region .= '<option value="' . $list_region['id_region'] . '" >' . $list_region['libelle_region_fr'] . ' ' . $list_region['libelle_region_ar'] . '</option>';
                }
            }

            $marche = '<option value="all_march" >Tout marche</option>';
        }
        echo $region . ';' . $marche;
        return;
    }

    public function function_get_marche() {
        $id_profil = $this->input->post('id_profil');
        $id_regin = $this->input->post('id_regin');
        if ($id_profil == 3) {
            $marche = '<option value="all_march" >Tout marche</option>';
        } elseif ($id_profil == 4) {
            $marche = '<option value="all_march" >Tout marche</option>';
        } elseif ($id_profil == 5 || $id_profil == 2) {
            $list_marches = $this->regions_model->get_marches_by_region_model($id_regin);

            $marche = '';

            $sel = "selected";
            foreach ($list_marches as $list_marche) {
                $marche .= '<option  ' . $sel . ' value="' . $list_marche['id_marche'] . '" >' . $list_marche['libelle_marche_fr'] . ' ' . $list_marche['libelle_marche_ar'] . '</option>';
                $sel = "";
            }
        }
        echo $marche;
        return;
    }
	public function function_get_municipalite_marche() {
		$id_profil = $this->input->post('id_profil');
        $id_regin = $this->input->post('id_regin');
		$list_marches = $this->regions_model->get_marches_by_region_model($id_regin);
		$list_municipalites = $this->municipalite_model->get_municipalite_by_region_model($id_regin);
		
            $marche = '';
			$municipalite ='';
			
            $sel = "selected";
            foreach ($list_marches as $list_marche) {
                $marche .= '<option  ' . $sel . ' value="' . $list_marche['id_marche'] . '" >' . $list_marche['libelle_marche_fr'] . ' ' . $list_marche['libelle_marche_ar'] . '</option>';
                $sel = "";
            }
			
			$selmunicipalite = "selected";
            foreach ($list_municipalites as $list_municipalite) {
                $municipalite .= '<option  ' . $selmunicipalite . ' value="' . $list_municipalite['id_municipalite'] . '" >' . $list_municipalite['libelle_municipalite_fr'] . ' ' . $list_municipalite['libelle_municipalite_ar'] . '</option>';
                $selmunicipalite = "";
            }
		echo $municipalite . ';' . $marche;
        return;
	}

    public function add_user() {

        if ($this->input->post('user_profil') == "5") {
            $data_ajouter_user = array(
                'email' => $this->input->post('user_email'),
                'name' => $this->input->post('nom_user'),
                'password' => sha1($this->input->post('user_pass')),
                'code_imei' => sha1($this->input->post('code_imei')),
                'idRole' => $this->input->post('user_profil'),
                'id_region' => $this->input->post('user_regin'),
				'id_mg_ref' => $this->input->post('marche_gros'),
				'id_mg_ref_per' => $this->input->post('marche_gros_per'),
				'id_mg_ref_per2' => $this->input->post('marche_gros_per2'),
				'id_municipalite' => $this->input->post('user_municipalite'),
				'id_mgp_ref' => $this->input->post('marche_p_gros'),
				'id_mgp_ref_per' => $this->input->post('marche_p_gros_per'),
				'id_mgp_ref_per2' => $this->input->post('marche_p_gros_per2'),
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
            $id_user = $this->users_model->add_user_model($data_ajouter_user);
        }elseif($this->input->post('user_profil') == "2"){
			 $data_ajouter_user = array(
                'email' => $this->input->post('user_email'),
                'name' => $this->input->post('nom_user'),
                'password' => sha1($this->input->post('user_pass')),
                'code_imei' => sha1($this->input->post('code_imei')),
                'idRole' => $this->input->post('user_profil'),
                'id_region' => $this->input->post('user_regin'),
				'id_municipalite' => $this->input->post('user_municipalite'),
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
            $id_user = $this->users_model->add_user_model($data_ajouter_user);	
		}elseif($this->input->post('user_profil') == "13"){
			 $data_ajouter_user = array(
                'email' => $this->input->post('user_email'),
                'name' => $this->input->post('nom_user'),
                'password' => sha1($this->input->post('user_pass')),
                'code_imei' => sha1($this->input->post('code_imei')),
                'idRole' => $this->input->post('user_profil'),
                'id_region' => '3',
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
            $id_user = $this->users_model->add_user_model($data_ajouter_user);	
		}else {
            $data_ajouter_user = array(
                'email' => $this->input->post('user_email'),
                'name' => $this->input->post('nom_user'),
                'password' => sha1($this->input->post('user_pass')),
                'idRole' => $this->input->post('user_profil'),
                'id_region' => $this->input->post('user_regin'),
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
            $id_user = $this->users_model->add_user_model($data_ajouter_user);
        }

        if (($this->input->post('user_profil') == '5') || ($this->input->post('user_profil') == '2') || ($this->input->post('user_profil') == '11')) {
            //$marches = $this->input->post('user_marche');
			$marches = explode(",", $this->input->post('um_id_marches'));

            foreach ($marches as $marche) {
                $data_ajouter_user_marche = array(
                    'user' => $id_user,
                    'marche' => $marche
                );

                $this->users_model->add_user_marche_model($data_ajouter_user_marche);
            }
        }
    }
	
	function function_delete_user_id()
	{
		$id_user = $this->input->post('id_user');
		$this->users_model->delete_user_model($id_user);	
	}
	
	function function_update_user()
	{
		if ($this->input->post('user_profilM') == "5") {
            $data_update_user = array(
                'email' => $this->input->post('user_emailM'),
                'name' => $this->input->post('nom_userM'),
                'idRole' => $this->input->post('user_profilM'),
                'id_region' => $this->input->post('user_reginM'),
				'id_mg_ref' => $this->input->post('marche_grosM'),
				'id_mg_ref_per' => $this->input->post('marche_gros_perM'),
				'id_mg_ref_per2' => $this->input->post('marche_gros_perM2'),
				'id_municipalite' => $this->input->post('user_municipaliteM'),
				'id_mgp_ref' => $this->input->post('marche_p_grosM'),
				'id_mgp_ref_per' => $this->input->post('marche_p_gros_perM'),
				'id_mgp_ref_per2' => $this->input->post('marche_p_gros_perM2'),				
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
			if(!empty($this->input->post('user_passM'))){$data_update_user['password'] = sha1($this->input->post('user_passM'));}
			if(!empty($this->input->post('code_imeiM'))){$data_update_user['code_imei'] = sha1($this->input->post('code_imeiM'));}

            $this->users_model->update_user_model($this->input->post('id_userM'),$data_update_user);
			
			$this->users_model->delete_user_marche_model($this->input->post('id_userM'));
			$marches = explode(",", $this->input->post('ms_id_marches'));

            foreach ($marches as $marche) {
                $data_ajouter_user_marche = array(
                    'user' => $this->input->post('id_userM'),
                    'marche' => $marche
                );

                $this->users_model->add_user_marche_model($data_ajouter_user_marche);
            }
			
        } elseif ($this->input->post('user_profilM') == "2"){
			$data_update_user = array(
                'email' => $this->input->post('user_emailM'),
                'name' => $this->input->post('nom_userM'),
                'idRole' => $this->input->post('user_profilM'),
                'id_region' => $this->input->post('user_reginM'),
				'id_municipalite' => $this->input->post('user_municipaliteM'),
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
			if(!empty($this->input->post('user_passM'))){$data_update_user['password'] = sha1($this->input->post('user_passM'));}
		
            $this->users_model->update_user_model($this->input->post('id_userM'),$data_update_user);
			
			$this->users_model->delete_user_marche_model($this->input->post('id_userM'));
			$marches = explode(",", $this->input->post('ms_id_marches'));

            foreach ($marches as $marche) {
                $data_ajouter_user_marche = array(
                    'user' => $this->input->post('id_userM'),
                    'marche' => $marche
                );

                $this->users_model->add_user_marche_model($data_ajouter_user_marche);
            }
		}else {
            $data_update_user = array(
                'email' => $this->input->post('user_emailM'),
                'name' => $this->input->post('nom_userM'),
                'idRole' => $this->input->post('user_profilM'),
                'id_region' => $this->input->post('user_reginM'),
                'stus' => '1',
                'date_mis_a_jour_u' => date("Y-m-d H:i:s")
            );
			if(!empty($this->input->post('user_passM'))){$data_update_user['password'] = sha1($this->input->post('user_passM'));}
            $id_user = $this->users_model->update_user_model($this->input->post('id_userM'),$data_update_user);
        }
	
	}

}
