<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Inport_excel_produit extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->model('journal_tarif_model');
		$this->load->model('regions_model');
		$this->load->model('produits_vrac_model');
		
    }

    public function read_xslx() {

		 $file = './assets/xslx/produit.xlsx';
		
        
		$this->load->library('Libexcel');
		$phpExcel = PHPExcel_IOFactory::load($file);
		// Get the first sheet

		$sheet = $phpExcel->getActiveSheet();
		$rowIterator = $phpExcel->getActiveSheet()->getRowIterator();
		$array_data = array();
		foreach($rowIterator as $row){
			$rowIndex = $row->getRowIndex ();
			//var_dump($rowIndex);
			if($rowIndex>1){
			$array_data[$rowIndex] = array('A'=>'', 'B'=>'','C'=>'');	 
				//strlen ( string $string )
				
				/*echo $sheet->getCell('A' . $rowIndex);
				echo $sheet->getCell('F' . $rowIndex);
				echo $sheet->getCell('G' . $rowIndex);
				echo $sheet->getCell('H' . $rowIndex);
				echo $sheet->getCell('I' . $rowIndex);
				echo $sheet->getCell('J' . $rowIndex);
				echo $sheet->getCell('K' . $rowIndex);
				echo $sheet->getCell('L' . $rowIndex);*/
				$produit = $this->produits_vrac_model->get_produits_vrac_by_code_model($sheet->getCell('A' . $rowIndex));
				if(empty($produit))
				{
					 $data_ajouter_vc = array(
					   'code_tarif_produit' => $sheet->getCell('A' . $rowIndex) ,
					   'id_type_prod_vrac' => 5 ,
					   'code_sous_famille' => 5 ,
					   'libelle_court_fr' => $sheet->getCell('C' . $rowIndex)  ,
					   'libelle_court_ar' => $sheet->getCell('B' . $rowIndex) ,
					   'classement' => 100 ,
					   'poids_usage' => 1 ,
					   'type_mesure' => 'KG' ,
					   'date_mis_a_jour_vc' => date("Y-m-d H:i:s")
					);
					$this->produits_vrac_model->add_produits_vrac_model($data_ajouter_vc);
				}
			 }
			 
		}
		/*$ids='';
		foreach($array_data as $arr){
			if($arr['A'] != ''){$ids.=$arr['A'].",";}
		}*/
		
}
//briquegpc
public function read_xslx_briquegpc() {

		 $file = './assets/GS1_gpc_FR.xlsx';
		
        
		$this->load->library('Libexcel');
		$phpExcel = PHPExcel_IOFactory::load($file);
		// Get the first sheet

		$sheet = $phpExcel->getActiveSheet();
		$rowIterator = $phpExcel->getActiveSheet()->getRowIterator();
		$array_data = array();
		foreach($rowIterator as $row){
			$rowIndex = $row->getRowIndex ();
			//var_dump($rowIndex);
			if($rowIndex>1){
				echo $sheet->getCell('A' . $rowIndex);
				/*$produit = $this->produits_vrac_model->get_produits_vrac_by_code_model($sheet->getCell('A' . $rowIndex));
				if(empty($produit))
				{
					 $data_ajouter_vc = array(
					   'code_tarif_produit' => $sheet->getCell('A' . $rowIndex) ,
					   'id_type_prod_vrac' => 5 ,
					   'code_sous_famille' => 5 ,
					   'libelle_court_fr' => $sheet->getCell('C' . $rowIndex)  ,
					   'libelle_court_ar' => $sheet->getCell('B' . $rowIndex) ,
					   'classement' => 100 ,
					   'poids_usage' => 1 ,
					   'type_mesure' => 'KG' ,
					   'date_mis_a_jour_vc' => date("Y-m-d H:i:s")
					);
					$this->produits_vrac_model->add_produits_vrac_model($data_ajouter_vc);
				}*/
				
			}
		}
}
	
	
	
}
