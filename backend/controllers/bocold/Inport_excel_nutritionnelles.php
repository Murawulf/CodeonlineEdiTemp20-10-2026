<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Inport_excel_nutritionnelles extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->model('journal_tarif_model');
		$this->load->model('regions_model');
		$this->load->model('produits_vrac_model');
		
    }

    public function read_xslx() {

		 $file = './assets/xslx/_Infos  nutritionnelles_produit_frais_20191011.xlsx';
		
        
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
			$array_data[$rowIndex] = array('A'=>'', 'F'=>'','G'=>'','H'=>'', 'I'=>'','J'=>'','K'=>'','L'=>'','M'=>'');	 
				//strlen ( string $string )
				
				/*echo $sheet->getCell('A' . $rowIndex);
				echo $sheet->getCell('F' . $rowIndex);
				echo $sheet->getCell('G' . $rowIndex);
				echo $sheet->getCell('H' . $rowIndex);
				echo $sheet->getCell('I' . $rowIndex);
				echo $sheet->getCell('J' . $rowIndex);
				echo $sheet->getCell('K' . $rowIndex);
				echo $sheet->getCell('L' . $rowIndex);*/
			$this->produits_vrac_model->update_produits_vrac_model($sheet->getCell('A' . $rowIndex),$sheet->getCell('F' . $rowIndex) ,$sheet->getCell('G' . $rowIndex),$sheet->getCell('H' . $rowIndex),$sheet->getCell('I' . $rowIndex),$sheet->getCell('J' . $rowIndex),$sheet->getCell('K' . $rowIndex),$sheet->getCell('L' . $rowIndex),$sheet->getCell('M' . $rowIndex));

				
			 }
			 
		}
		/*$ids='';
		foreach($array_data as $arr){
			if($arr['A'] != ''){$ids.=$arr['A'].",";}
		}*/
		
}

	
	
	
}
