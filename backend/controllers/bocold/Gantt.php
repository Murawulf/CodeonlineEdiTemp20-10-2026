<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Gantt extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper('url');
        $this->load->library('session');
        $this->load->model('gantt_model');
    }

    public function index() {
        if ($this->session->userdata('name') != '') {
            $data = array('activehome' => '', 'activeproduits' => '', 'activetarif' => '', 'activejournaltarif' => '',
                'activejournaltarifarchive' => '', 'activeuser' => '', 'activepanier' => '',
                'activemarche' => '', 'activeanomalies' => '', 'activeprodcon' => '', 'activeentreprise' => '',
				'activedashboard' => 'active','activemarcheperipherique'=>'','activejournaltarifcrd' => '');
			if ($this->session->userdata('profil') == '1') {
				$data['projets']=$this->gantt_model->get_all_projet_model();
				//$data['marches']=json_encode($this->regions_model->get_all_marche_magicsuggest_model());
				
			
			//$data['produits_vrac']=json_encode($produits_vrac);
			$data['profil']=$this->session->userdata('profil');
			
            $this->load->view('boc/gantt_views', $data);
			} else {
				header("Location:login");
			}
    }
	}
	
	public function function_get_graoh(){
		date_default_timezone_set('Africa/Tunis');
		$data = array();
		$id_projet = $this->input->get('p');
		$v=',';
		$series='';

			$tasks=$this->gantt_model->get_task_projet_graph_model($id_projet);
			$datas='';
				foreach ($tasks as $task) {
					list($ds, $ms, $ys) = explode("/", $task['start_date']);
					$ms = $ms-1;
					list($de, $me, $ye) = explode("/", $task['end_date']);
					$me = $me-1;
					$datas.='{start: Date.UTC('.$ys.', '.$ms.', '.$ds.'),end: Date.UTC('.$ye.', '.$me.', '.$de.'), completed: '.$task['progss'].',name: "'.$task['name_task'].'"}'.$v;	
				}
				$datas = substr($datas, 0, -1);
				$p=$this->gantt_model->get_projet_by_id_model($id_projet);
				$series.='{name: "'.$p['name_projet'].'",data: ['.$datas.']}';
		$data['series']=$series;
		$data['dip_projet']=$p['Description_projet'];
		$data['name_projet']= $p['name_projet'];
		$this->load->view('boc/graph_gantt_views', $data);
	}
	
	public function add_task()
	{
		 $data_ajouter_task = array(
                'id_projet' => $this->input->post('projet'),
                'name_task' => $this->input->post('name_task'),
                'start_date' => $this->input->post('start_day'),
                'end_date' => $this->input->post('end_day'),
                'progss' => $this->input->post('progres_task')
            );
            $this->gantt_model->add_task_model($data_ajouter_task);
	}



}
