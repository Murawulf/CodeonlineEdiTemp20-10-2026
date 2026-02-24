<?php
defined('BASEPATH') OR exit('No direct script access allowed');
class Journal_tarif_archive extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->library('encrypt');
				
				$this->load->model('journal_tarif_archive_model');
                 
        }
		
	public function index()
	{ 	
			if($this->session->userdata('name')!='')
			{
			$data=array('activehome'=>'','activeproduits'=>'','activetarif'=>'','activejournaltarif'=>'','activepanier'=>'',
			'activejournaltarifarchive'=>'active','activeuser'=>'','activemarche'=>'',
			'activeanomalies'=>'','activeprodcon'=>'','activeentreprise'=>'',
			'activedashboard' => '','activemarcheperipherique'=>'');
			if($this->session->userdata('profil')=='4')
			{
				$list_date=$this->journal_tarif_archive_model->get_all_date_tarif_by_old_mois_model();

				$tab_dates='';
			
				foreach($list_date as $date)
				{
					$dates = explode('/',$date['date_journ']);
					$d = $dates[0];
					$m = $dates[1];
					$y = $dates[2];
					$day = $y.'/'.$m.'/'.$d;
					
					if((strtotime($day) >= $this->debutMois()) && (strtotime($day)<=$this->finMois()))
					{
						$tab_dates[]=$date['date_journ'];
					}
				}
				$data['list_dates']=$tab_dates;
				$this->load->view('boc/Journal_tarif_archive_chefregion_views',$data);
			}else{$this->load->view('boc/Journal_tarif_archive_chefregion_views',$data);}
			
			}else{ header("Location:login");}
	}

		function debutMois(){
			$year = date("Y") ;
			$month = date("m");
			if($month=='01')
			{$month = '12';$year =date("Y")-1;}
			else{
					if($month<10)
					{
						$month = date("n")-1;
						$month='0'.$month;
					}else{$month=$month-1;}
				}
			$firstday =$year."/".$month."/01";
			return strtotime($firstday);
		}
	
		function finMois(){
			$year = date("Y") ;
			$month = date("m"); 
			if($month=='01')
			{$month = '12';$year =date("Y")-1;}
			else{
					if($month<10)
					{
						$month = date("n")-1;
						$month='0'.$month;
					}else{$month=$month-1;}
				}
			$day = date("t");
			$lastday = $year."/".$month."/".$day;
			return strtotime($lastday);
		}
	
	
}
