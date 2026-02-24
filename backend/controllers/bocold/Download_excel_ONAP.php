<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Download_excel_ONAP extends CI_Controller {

    public function __construct() {
        parent::__construct();
		$this->load->helper('download');
        $this->load->model('journal_tarif_model');
		$this->load->model('regions_model');
		$this->load->model('produits_vrac_model');
		$this->load->model('municipalite_model');
		
    }

    public function download_xslx() {
		$namef = '';
		$marche = $this->input->get('id');
		$date_jour = $this->input->get('d');
		 $file = './assets/xslx/';
		 switch (explode("/", $date_jour)['1']) {
			case "01":
				$namef .= "january.xlsx";
				break;
			case "02":
				$namef .= "february.xlsx";
				break;
			case "03":
				$namef .= "march.xlsx";
				break;
			case "04":
				$namef .= "april.xlsx";
				break;
			case "05":
				$namef .= "may.xlsx";
				break;
			case "06":
				$namef .= "july.xlsx";
				break;
			case "07":
				$namef .= "august_july.xlsx";
				break;
			case "08":
				$namef .= "august_july.xlsx";
				break;
			case "09":
				$namef .= "september.xlsx";
				break;
			case "10":
				$namef .= "october.xlsx";
				break;
			case "11":
				$namef .= "november.xlsx";
				break;
			case "12":
				$namef .= "december.xlsx";
				break;
		}
		
		$marchee = $this->regions_model->get_marche_region_by_id_model($marche);
		$name_marche = $marchee['libelle_marche_ar'];
		$name_region = $marchee['libelle_region_ar'];
		if($marchee['status']==2){
			$file.= 'mg_'.$namef;
		}else{$file.= $namef;}
        
		$this->load->library('Libexcel');
		$phpExcel = PHPExcel_IOFactory::load($file);
		// Get the first sheet

		$sheet = $phpExcel->getActiveSheet();
		$rowIterator = $phpExcel->getActiveSheet()->getRowIterator();
		$array_data = array();
		foreach($rowIterator as $row){
			$rowIndex = $row->getRowIndex ();
			if($rowIndex>7){
			$array_data[$rowIndex] = array('A'=>'', 'B'=>'','C'=>'','D'=>'');	 
				//strlen ( string $string )
				$cell = $sheet->getCell('A' . $rowIndex);
				if (strlen ( $cell )<10){
					$array_data[$rowIndex]['A'] = $cell->getCalculatedValue(); 
				}
			 }
		}
		$ids='';
		foreach($array_data as $arr){
			if($arr['A'] != ''){$ids.=$arr['A'].",";}
		}
		$ids= substr($ids, 0, -1);
		$id_produit = explode(",", $ids);
		$list_produit = $this->journal_tarif_model->get_distinct_produit_uonat_by_date_marche_model($date_jour, $marche,$id_produit);
		//$sheet->getCell('C3')->setValue($name_marche);
		$sheet->getCell('A3')->setValue('الإدارة الجهوية للتجارة بـ'.$name_region);
		$sheet->getCell('D3')->setValue('سوق'.' '.$name_marche);
		
		$i = 8;
		if($marchee['status']==2){
			$ql=0;
			$qf = 0;
			$qp =0;
			
			$sheet->getCell('G1')->setValue(' التاريخ : '.$date_jour);
			foreach($id_produit as $code){
			$key = array_search($code, array_column($list_produit, 'code_tarif_produit'));

			if(is_numeric($key))
			{
					switch ($list_produit[$key]['id_type_prod_vrac']) {
					case "5":
						$qp += $list_produit[$key]['quantite'];
						break;
					case "2":
						$qf += $list_produit[$key]['quantite'];
						break;
					case "1":
						$ql += $list_produit[$key]['quantite'];
						break;
					}
					$sheet->getCell('E' . $i)->setValue($list_produit[$key]['quantite']);
					$sheet->getCell('F' . $i)->setValue($list_produit[$key]['prix_min']);
					$sheet->getCell('G' . $i)->setValue($list_produit[$key]['prix_usage']);
					$sheet->getCell('H' . $i)->setValue($list_produit[$key]['prix_max']);				
			}else{
				$sheet->getCell('E' . $i)->setValue('');
				$sheet->getCell('F' . $i)->setValue('');
				$sheet->getCell('G' . $i)->setValue('');
				$sheet->getCell('H' . $i)->setValue('');
			}
			$i++;
			}
			$i= $i-3;
			$sheet->getCell('E' . $i)->setValue($ql);
			$i++;
			$sheet->getCell('E' . $i)->setValue($qf);
			$i++;
			$sheet->getCell('E' . $i)->setValue($qp);
		}else{
			$sheet->getCell('D1')->setValue(' التاريخ : '.$date_jour);
			foreach($id_produit as $code){
			$key = array_search($code, array_column($list_produit, 'code_tarif_produit'));

			if(is_numeric($key))
			{
					$sheet->getCell('C' . $i)->setValue($list_produit[$key]['prix_min']);
					$sheet->getCell('D' . $i)->setValue($list_produit[$key]['prix_usage']);
					$sheet->getCell('E' . $i)->setValue($list_produit[$key]['prix_max']);
			}else{
				$sheet->getCell('C' . $i)->setValue('');
				$sheet->getCell('D' . $i)->setValue('');
				$sheet->getCell('E' . $i)->setValue('');
			}
			$i++;
			}
		}

		$objWriter = new PHPExcel_Writer_Excel2007($phpExcel);
		
		$filename= $name_marche.'_'.$date_jour.'.xlsx'; 
		header('Content-Type: application/vnd.ms-excel');
		header('Content-Disposition: attachment;filename="'.$filename.'"'); 
		header('Cache-Control: max-age=0'); 
		$objWriter->save('php://output');
    }
	
	function download()
	{
	  $file = "http://www.codeonline.info/pdf/codeonline_info_mail.pdf";
	  $fileName = "codeonline_info_mail.pdf";
     // get file content
     $data = file_get_contents ( $file );
     //force download
     force_download ( $fileName, $data );

	}
	
	public function download_xslx_prduit_vrac() {
		
		$produits_vracs = $this->produits_vrac_model->get_all_produits_vrac_excel_model();
        
		//load our new PHPExcel library
		 $this->load->library('Libexcel');
		 $file = './assets/xslx/test.xlsx';
		 $phpExcel = PHPExcel_IOFactory::load($file);
		// Get the first sheet

		$sheet = $phpExcel->getActiveSheet();
		$i = 1;
		foreach($produits_vracs as $produits_vrac){
			    $sheet->getCell('A' . $i)->setValue($produits_vrac['id_produit_ref']);
				$sheet->getCell('B' . $i)->setValue($produits_vrac['code_tarif_produit']);
				$sheet->getCell('C' . $i)->setValue($produits_vrac['id_type_prod_vrac']);
				$sheet->getCell('D' . $i)->setValue($produits_vrac['libelle_court_fr']);
				$sheet->getCell('E' . $i)->setValue($produits_vrac['libelle_court_ar']);
				$sheet->getCell('F' . $i)->setValue($produits_vrac['nutriments']);
				$sheet->getCell('G' . $i)->setValue($produits_vrac['unite_nutriments']);
				$sheet->getCell('H' . $i)->setValue($produits_vrac['vitamines']);
				$sheet->getCell('I' . $i)->setValue($produits_vrac['unite_vitamines']);
				$sheet->getCell('J' . $i)->setValue($produits_vrac['allegation_nutritionnelle']);
			$i++;
		}

		$objWriter = new PHPExcel_Writer_Excel2007($phpExcel);
		
		$filename= 'produit_vrac.xlsx'; 
		header('Content-Type: application/vnd.ms-excel');
		header('Content-Disposition: attachment;filename="'.$filename.'"'); 
		header('Cache-Control: max-age=0'); 
		$objWriter->save('php://output');
    }
	
	public function download_journal_inc_xslx() {
		$m = array("1" => "الخـضروات", "2" => "الغـلال", "3" => "اللحـوم", "4" => "الـدواجــن", "5" => "الأسمـاك", "6" => "زيوت", "7" => "سيول", "8" => "خضر جافة", "9" => "توابل");
		$m_fr = array("1" => "Légumes", "2" => "Fruits", "3" => "Viandes", "4" => "Volailles", "5" => "Poissons", "6" => "Huiles", "7" => "Liquides", "8" => "Légumes secs", "9" => "Epices");
		$marche = $this->input->get('id');
		$date_jour = $this->input->get('d');
		$file = './assets/xslx/';
		$namef = "journal_inc.xlsx";
	
		$list_produit = $this->journal_tarif_model->get_distinct_produit_by_date_marche_inc_model($date_jour, $marche);
		$marchee = $this->regions_model->get_marche_region_by_id_model($marche);
		$municipalite = $this->municipalite_model->get_municipalite_by_marche_model($marche);
		$name_marche = $marchee['libelle_marche_ar'];
		$name_region = $marchee['libelle_region_ar'];
		if($marchee['status']==1){
			$file.= $namef;
		}else if(($marchee['status']==3)&&($this->session->userdata('profil') == '10')||($this->session->userdata('profil') == '11')){
			$file.= 'mg_poisson_'.$namef;
		}else{$file.= 'mg_'.$namef;}
		//$file .= $namef;
		$this->load->library('Libexcel');
		$phpExcel = PHPExcel_IOFactory::load($file);
		$sheet = $phpExcel->getActiveSheet();
		$sheet->getCell('B2')->setValue('ولاية '.$marchee['libelle_region_ar']);
		$sheet->getCell('D3')->setValue('ســوق '.$marchee['libelle_marche_ar']);
		$sheet->getCell('F3')->setValue($date_jour);
		if(($this->session->userdata('profil') != '10')&&($this->session->userdata('profil') != '11')){
			if(!empty($municipalite)){$sheet->getCell('B3')->setValue($municipalite['libelle_municipalite_ar']);}
		}
		$i = 10;
		$first_id_type_prod_vrac = $list_produit[0]['id_type_prod_vrac'];
		$sheet->getCell('B9')->setValue($m[$first_id_type_prod_vrac]);
		$P=0;$V=0;$VO=0;$F=0;$L=0;
		$pP=0;$pV=0;$pVO=0;$pF=0;$pL=0;
		foreach($list_produit as $produits_vrac){
			
			if($marchee['status']==1){
					//Marché détail
					if($first_id_type_prod_vrac == $produits_vrac['id_type_prod_vrac'])
						{
							$sheet->getCell('A' . $i)->setValue($produits_vrac['code_tarif_produit']);
							$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
							$sheet->getCell('B' . $i)->setValue($produits_vrac['libelle_court_ar']);
							$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
							$sheet->getCell('C' . $i)->setValue($produits_vrac['libelle_court_fr']);
							$sheet->duplicateStyle($sheet->getStyle('C10'), 'C' . $i);
							$sheet->getCell('D' . $i)->setValue($produits_vrac['prix_min']);
							$sheet->duplicateStyle($sheet->getStyle('D10'), 'D' . $i);
							$sheet->getCell('E' . $i)->setValue($produits_vrac['prix_usage']);
							$sheet->duplicateStyle($sheet->getStyle('E10'), 'E' . $i);
							$sheet->getCell('F' . $i)->setValue($produits_vrac['prix_max']);
							$sheet->duplicateStyle($sheet->getStyle('F10'), 'F' . $i);
						}else{
							$first_id_type_prod_vrac = $produits_vrac['id_type_prod_vrac'];
							$border_style= array('borders' => array('bottom' => array('style' => PHPExcel_Style_Border::BORDER_THIN,'color' => array('argb' => '00000000'))));
							$style = $sheet->getStyle("A" . $i.":F". $i)->applyFromArray($border_style);
							$i++;
							$sheet->getCell('A' . $i)->setValue('الرمز');
							$sheet->duplicateStyle($sheet->getStyle('A9'), 'A' . $i);
							
							$sheet->getCell('B' . $i)->setValue($m[$first_id_type_prod_vrac]);
							$sheet->duplicateStyle($sheet->getStyle('B9'), 'B' . $i);
							
							$sheet->getCell('C' . $i)->setValue($m_fr[$first_id_type_prod_vrac]);
							$sheet->duplicateStyle($sheet->getStyle('C9'), 'C' . $i);
							
							$sheet->getCell('D' . $i)->setValue('السعر الأدنى');
							$sheet->duplicateStyle($sheet->getStyle('D9'), 'D' . $i);
							
							$sheet->getCell('E' . $i)->setValue('السعر المتداول');
							$sheet->duplicateStyle($sheet->getStyle('E9'), 'E' . $i);
							
							$sheet->getCell('F' . $i)->setValue('السعر الأقصى');
							$sheet->duplicateStyle($sheet->getStyle('F9'), 'F' . $i);
							
							$i++;
							$sheet->getCell('A' . $i)->setValue($produits_vrac['code_tarif_produit']);
							$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
							$sheet->getCell('B' . $i)->setValue($produits_vrac['libelle_court_ar']);
							$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
							$sheet->getCell('C' . $i)->setValue($produits_vrac['libelle_court_fr']);
							$sheet->duplicateStyle($sheet->getStyle('C10'), 'C' . $i);
							$sheet->getCell('D' . $i)->setValue($produits_vrac['prix_min']);
							$sheet->duplicateStyle($sheet->getStyle('D10'), 'D' . $i);
							$sheet->getCell('E' . $i)->setValue($produits_vrac['prix_usage']);
							$sheet->duplicateStyle($sheet->getStyle('E10'), 'E' . $i);
							$sheet->getCell('F' . $i)->setValue($produits_vrac['prix_max']);
							$sheet->duplicateStyle($sheet->getStyle('F10'), 'F' . $i);
						}
				}else{
					//Marché de gros
					//$P=0;$V=0;$VI=0;$F=0;$L=0;
					//$pP=0;$pV=0;$pVO=0;$pF=0;$pL=0;
					switch ($produits_vrac['id_type_prod_vrac']) {
					case "1"://Légumes
						$L += $produits_vrac['quantite'];
						$pL += $produits_vrac['quantite']*$produits_vrac['prix_usage'];
						break;
					case "2"://Fruits
						$F += $produits_vrac['quantite'];
						$pF += $produits_vrac['quantite']*$produits_vrac['prix_usage'];
						break;
					case "3"://Viandes
						$V += $produits_vrac['quantite'];
						$pV += $produits_vrac['quantite']*$produits_vrac['prix_usage'];
						break;
					case "4"://Volailles
						$VO += $produits_vrac['quantite'];
						$pVO += $produits_vrac['quantite']*$produits_vrac['prix_usage'];
						break;
					case "5"://Poissons
						$P += $produits_vrac['quantite'];
						$pP += $produits_vrac['quantite']*$produits_vrac['prix_usage'];
						break;
					}
					if($first_id_type_prod_vrac == $produits_vrac['id_type_prod_vrac'])
						{
							$sheet->getCell('A' . $i)->setValue($produits_vrac['code_tarif_produit']);
							$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
							$sheet->getCell('B' . $i)->setValue($produits_vrac['libelle_court_ar']);
							$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
							$sheet->getCell('C' . $i)->setValue($produits_vrac['libelle_court_fr']);
							$sheet->duplicateStyle($sheet->getStyle('C10'), 'C' . $i);
							$sheet->getCell('D' . $i)->setValue($produits_vrac['quantite']);
							$sheet->duplicateStyle($sheet->getStyle('D10'), 'D' . $i);
							$sheet->getCell('E' . $i)->setValue($produits_vrac['prix_min']);
							$sheet->duplicateStyle($sheet->getStyle('E10'), 'E' . $i);
							$sheet->getCell('F' . $i)->setValue($produits_vrac['prix_usage']);
							$sheet->duplicateStyle($sheet->getStyle('F10'), 'F' . $i);
							$sheet->getCell('G' . $i)->setValue($produits_vrac['prix_max']);
							$sheet->duplicateStyle($sheet->getStyle('G10'), 'G' . $i);
						}else{
							$first_id_type_prod_vrac = $produits_vrac['id_type_prod_vrac'];
							$border_style= array('borders' => array('bottom' => array('style' => PHPExcel_Style_Border::BORDER_THIN,'color' => array('argb' => '00000000'))));
							$style = $sheet->getStyle("A" . $i.":G". $i)->applyFromArray($border_style);
							$i++;
							$sheet->getCell('A' . $i)->setValue('الرمز');
							$sheet->duplicateStyle($sheet->getStyle('A9'), 'A' . $i);
							
							$sheet->getCell('B' . $i)->setValue($m[$first_id_type_prod_vrac]);
							$sheet->duplicateStyle($sheet->getStyle('B9'), 'B' . $i);
							
							$sheet->getCell('C' . $i)->setValue($m_fr[$first_id_type_prod_vrac]);
							$sheet->duplicateStyle($sheet->getStyle('C9'), 'C' . $i);
							
							$sheet->getCell('D' . $i)->setValue('الكميات بالكلغ');
							$sheet->duplicateStyle($sheet->getStyle('D9'), 'D' . $i);
							
							$sheet->getCell('E' . $i)->setValue('السعر الأدنى');
							$sheet->duplicateStyle($sheet->getStyle('E9'), 'E' . $i);
							
							$sheet->getCell('F' . $i)->setValue('السعر المتداول');
							$sheet->duplicateStyle($sheet->getStyle('F9'), 'F' . $i);
							
							$sheet->getCell('G' . $i)->setValue('السعر الأقصى');
							$sheet->duplicateStyle($sheet->getStyle('G9'), 'G' . $i);
							
							$i++;
							$sheet->getCell('A' . $i)->setValue($produits_vrac['code_tarif_produit']);
							$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
							$sheet->getCell('B' . $i)->setValue($produits_vrac['libelle_court_ar']);
							$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
							$sheet->getCell('C' . $i)->setValue($produits_vrac['libelle_court_fr']);
							$sheet->duplicateStyle($sheet->getStyle('C10'), 'C' . $i);
							$sheet->getCell('D' . $i)->setValue($produits_vrac['quantite']);
							$sheet->duplicateStyle($sheet->getStyle('D10'), 'D' . $i);
							$sheet->getCell('E' . $i)->setValue($produits_vrac['prix_min']);
							$sheet->duplicateStyle($sheet->getStyle('E10'), 'E' . $i);
							$sheet->getCell('F' . $i)->setValue($produits_vrac['prix_usage']);
							$sheet->duplicateStyle($sheet->getStyle('F10'), 'F' . $i);
							$sheet->getCell('G' . $i)->setValue($produits_vrac['prix_max']);
							$sheet->duplicateStyle($sheet->getStyle('G10'), 'G' . $i);
						}
				}
				$first_id_type_prod_vrac = $produits_vrac['id_type_prod_vrac'];
			$i++;
		}
		
		if(($marchee['status']==2)||($marchee['status']==3)){
			$i++;
			$border_style= array('borders' => array('bottom' => array('style' => PHPExcel_Style_Border::BORDER_THIN,'color' => array('argb' => '00000000'))));
			$style = $sheet->getStyle("A" . $i.":C". $i)->applyFromArray($border_style);
			$i++;
			$sheet->getCell('A' . $i)->setValue('الرمز');
			$sheet->duplicateStyle($sheet->getStyle('A9'), 'A' . $i);
							
			$sheet->getCell('B' . $i)->setValue('الـمجـمـوع');
			$sheet->duplicateStyle($sheet->getStyle('B9'), 'B' . $i);
							
			$sheet->getCell('C' . $i)->setValue('الكميات بالكلغ');
			$sheet->duplicateStyle($sheet->getStyle('G9'), 'C' . $i);
			if($marchee['status']==2){
			$i++;
			$sheet->getCell('A' . $i)->setValue('100');
			$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
			$sheet->getCell('B' . $i)->setValue('الخـضروات');
			$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
			$sheet->getCell('C' . $i)->setValue($L);
			$sheet->duplicateStyle($sheet->getStyle('G10'), 'C' . $i);
			
			$i++;
			$sheet->getCell('A' . $i)->setValue('200');
			$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
			$sheet->getCell('B' . $i)->setValue('الغـلال');
			$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
			$sheet->getCell('C' . $i)->setValue($F);
			$sheet->duplicateStyle($sheet->getStyle('G10'), 'C' . $i);
			
			$i++;
			$sheet->getCell('A' . $i)->setValue('300');
			$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
			$sheet->getCell('B' . $i)->setValue('اللحـوم');
			$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
			$sheet->getCell('C' . $i)->setValue($V);
			$sheet->duplicateStyle($sheet->getStyle('G10'), 'C' . $i);
			
			$i++;
			$sheet->getCell('A' . $i)->setValue('400');
			$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
			$sheet->getCell('B' . $i)->setValue('الـدواجــن');
			$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
			$sheet->getCell('C' . $i)->setValue($VO);
			$sheet->duplicateStyle($sheet->getStyle('G10'), 'C' . $i);
			}
			$i++;
			$sheet->getCell('A' . $i)->setValue('500');
			$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
			$sheet->getCell('B' . $i)->setValue('الأسمـاك');
			$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
			$sheet->getCell('C' . $i)->setValue($P);
			$sheet->duplicateStyle($sheet->getStyle('G10'), 'C' . $i);
			if($this->session->userdata('profil') == '2')
			{
			$i++;$i++;
			$sheet->getCell('A' . $i)->setValue('000');
			$sheet->duplicateStyle($sheet->getStyle('A10'), 'A' . $i);
			$sheet->getCell('B' . $i)->setValue('رقم المعاملات');
			$sheet->duplicateStyle($sheet->getStyle('B10'), 'B' . $i);
			$cf=$pP+$pV+$pVO+$pF+$pL;
			$sheet->getCell('C' . $i)->setValue(number_format($cf, 0, ',', ' '));
			$sheet->duplicateStyle($sheet->getStyle('G10'), 'C' . $i);
			}
			
		}
		$i++;$i++;
		$objDrawing = new PHPExcel_Worksheet_Drawing();
		$objDrawing->setPath('./assets/img/logo_codeonline_reporting.png');
		$objDrawing->setCoordinates('C' . $i);                      
		//setOffsetX works properly
		$objDrawing->setOffsetX(5); 
		$objDrawing->setOffsetY(5);                
		//set width, height
		$objDrawing->setWidth(100); 
		$objDrawing->setHeight(35); 
		$objDrawing->setWorksheet($phpExcel->getActiveSheet());
		
		/*$objDrawingmunicipalite = new PHPExcel_Worksheet_Drawing();
		$objDrawingmunicipalite->setPath('./assets/municipalite/MunicipalitedeGabes_logo_20191224112734.png');
		$objDrawingmunicipalite->setCoordinates('C3');                      
		
		$objDrawingmunicipalite->setOffsetX(5); 
		$objDrawingmunicipalite->setOffsetY(5);                
		
		$objDrawingmunicipalite->setWidth(100); 
		$objDrawingmunicipalite->setHeight(35); 
		$objDrawingmunicipalite->setWorksheet($phpExcel->getActiveSheet());*/
		
		$objWriter = new PHPExcel_Writer_Excel2007($phpExcel);	
		$filename= $marchee['libelle_marche_ar'].'_journal INC_'.$date_jour.'.xlsx';
		header('Content-Type: application/vnd.ms-excel');
		header('Content-Disposition: attachment;filename="'.$filename.'"'); 
		header('Cache-Control: max-age=0'); 
		$objWriter->save('php://output');
	}
	
}
