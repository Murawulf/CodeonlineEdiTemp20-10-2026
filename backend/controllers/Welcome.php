<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Welcome extends CI_Controller {

	/**
	 * Index Page for this controller.
	 *
	 * Maps to the following URL
	 * 		http://example.com/index.php/welcome
	 *	- or -
	 * 		http://example.com/index.php/welcome/index
	 *	- or -
	 * Since this controller is set as the default controller in
	 * config/routes.php, it's displayed at http://example.com/
	 *
	 * So any other public methods not prefixed with an underscore will
	 * map to /index.php/welcome/<method_name>
	 * @see https://codeigniter.com/user_guide/general/urls.html
	 */
	 
	 public function __construct()
        {
                parent::__construct();
				$this->load->model('we_model');	
				$this->load->model('gpc_model');					
        }
	/*public function index()
	{
		$this->load->view('welcome_message');
	}*/
	
	/*public function index()
	{
		$FPs = $this->we_model->get_all_fp_model();
		foreach($FPs as $FP)
		{
			if($FP['nbGtin']==2){
			echo '////////////////'.$FP['nbGtin'].'///////////'.$FP['libelle'].'//////////////'.$FP['gtin'].'<br>';
			//$F = $this->we_model->get_min_id_fp_model($FP['gtin']);
			//$this->we_model->delete_n_fp_model($F['minid']);
			//$this->we_model->delete_fp_model($F['minid']);
			}
		}
	}*/
	
	
	/*public function countryOfOrigin()
	{
		$FPs = $this->we_model->get_all_produit_b_model();

		
		$data_ajouter_fp = array(
				   'countryOfOrigin' => '056'
		 );
		foreach($FPs as $FP)
		{
			$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
		}
	}*/
	/*$newImages='';
				$i=0;
				 $images = explode(";", $FP['images']);
				 foreach($images as $image)
				 {
					
				 }
				 $newImages = substr_replace($newImages ,"", -1);
				 echo  $newImages.$i.'/////////////<br>';
				 $newImages='';$i=0;*/
	public function checkimage()
	{
		$FPs = $this->we_model->get_all_produit_b_model();
		//var_dump($FPs);
		foreach($FPs as $FP)
		{
			$images = explode(";", $FP['images']);
			$i=0;
			$newImages ='';
				foreach($images as $image)
				{
					if( @exif_imagetype($image)) 
						{
							$newImages .= $image.';';$i++;

						}
				}
				
				if($i != 0)
				{
					$newImages = substr_replace($newImages ,"", -1);
					$data_ajouter_fp = array(
							   'images' => $newImages,
							   'nb_images' => $i,
							   'done_new' => 1
							   
							 );
						$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
						$this->we_model->update_old_produits_conditionne_id_produit_model($FP['id']);
				}else{
					$data_ajouter_fp = array(
							   'done_new' => 1
							 );
					$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
					$this->we_model->update_old_produits_conditionne_id_produit_model($FP['id']);
					}
		}
	}
	
	public function findclass()
	{
		$FPs = $this->we_model->get_all_fp_model();
		foreach($FPs as $FP)
		{
			$class=$this->we_model->find_code_class($FP['codebrique']);
			$data_ajouter_fp = array(
						   'codeClasse' => $class['codeClasse']
						 );
			
			$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
		}
		
	}
	
	public function findEmptyName()
	{
		$FPs = $this->we_model->get_all_fp_EmptyName_model();
		//print_r($FPs);
		$i=0;
		foreach($FPs as $FP)
		{
			if(!empty($FP['short_libelle']))
			{
				$data_ajouter_fp = array(
						   'libelle' => $FP['short_libelle']
						 );
			
			$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
			}else{
				if(!empty($FP['subBrand']))
				{
					
					$data_ajouter_fp = array(
						   'libelle' => $FP['subBrand']
						 );
			
					$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
				}
			}
			$i++;
		}
		echo $i;
	}
	
	public function findGTIN14()
	{
		$FPs = $this->we_model->get_all_fp_14_model();
		//print_r($FPs);
		$i=0;
		foreach($FPs as $FP)
		{
			if(strlen($FP['gtin'])==14){$gtin = substr($FP['gtin'], 1); }
			
				$data_ajouter_fp = array(
						   'gtin' => $gtin
						 );
			
			$this->we_model->update_produits_conditionne_id_produit_model($FP['id'],$data_ajouter_fp);
			echo $gtin.'<br>';
			$i++;
		}
		echo $i;
	}
	
	public function updateBrik1()
	{
		//load our new PHPExcel library
		 $this->load->library('Libexcel');
		 $file = './assets/xslx/gpcen.xlsx';
		$phpExcel = PHPExcel_IOFactory::load($file);
		// Get the first sheet

		$sheet = $phpExcel->getActiveSheet();
		$rowIterator = $phpExcel->getActiveSheet()->getRowIterator();
		$i=0;
		foreach($rowIterator as $row){
			$rowIndex = $row->getRowIndex ();
			$data_brique = array(
						   'libelleBrique_en' => $sheet->getCell('K' . $rowIndex)
						 );
			$this->gpc_model->update_brique_model($data_brique,$sheet->getCell('J' . $rowIndex));
			$i++;

		}
		echo $i;
		//$json = file_get_contents($file); 
  
		// Decode the JSON file 
		//$json_data = json_decode($json,true); 
		  
		// Display data 
		//print_r($json_data);
	}
}
