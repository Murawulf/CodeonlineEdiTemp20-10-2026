<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Gpccepex extends CI_Controller {

	public function __construct()
        {
                parent::__construct();
				$this->load->helper('url');
				$this->load->library('session');
				$this->load->model('gpcccir_model');
				
                 
        }
		
	public function index()
	{ 
		if($this->session->userdata('name')!='')
		{
		$data = array('activehome' => '', 'activeprodcon' => '', 'activegpc' => 'active','header'=>'headercepex','activeprodcont' => '','activenotif' => '');
		$data['segments']=$this->gpcccir_model->get_all_segment_model();
		$this->load->view('gpcccir_views',$data);
		}else{ header("Location:login");}
		
	}
	
	function fun_set_segment_gpc()
	{
		$list_code_segment = $this->input->post('list_code_segment');
		$list_segment = explode(";", $list_code_segment);
		$this->gpcccir_model->set_all_segment_by_0_model();
		$result = count($list_segment);
			
			for($i = 0; $i < $result; $i++){
					$this->gpcccir_model->set_segment_by_code_model($list_segment[$i]);
				}

	}
	

	
	function fun_set_famille_gpc()
	{
		$list_code_famille = $this->input->post('list_code_famille');
		$codesg = $this->input->post('codesg');
		$list_famille = explode(";", $list_code_famille);
		$this->gpcccir_model->set_all_famille_by_sg_0_model($codesg);
		$result = count($list_famille);
			
			for($i = 0; $i < $result; $i++){
					$this->gpcccir_model->set_famille_by_code_model($list_famille[$i]);
				}
	}
	
	function fun_set_classe_gpc()
	{
		$list_code_class_c = $this->input->post('list_code_class_c');
		$list_classe_c = explode(";", $list_code_class_c);
		
		//$list_code_class_b = $this->input->post('list_code_class_b');
		//$list_classe_b = explode(";", $list_code_class_b);
		
		//$codesg = $this->input->post('codesg');
		$codefamille = $this->input->post('codefami');
		
		$this->gpcccir_model->set_all_classe_by_famille_0_model($codefamille);
		
		$result = count($list_classe_c);
			
			for($i = 0; $i < $result; $i++){
					$this->gpcccir_model->set_classe_c_by_code_model($list_classe_c[$i]);
				}
			/*for($j = 0; $j < $result; $j++){
					$this->gpcccir_model->set_classe_b_by_code_model($list_classe_b[$j]);
				}*/
	}
	
	function fun_set_brique_gpc()
	{
		$list_code_brique = $this->input->post('list_code_brique');
		$codeclass = $this->input->post('codeclass');
		$list_brique = explode(";", $list_code_brique);
		$this->gpcccir_model->set_all_brique_by_class_0_model($codeclass);
		$result = count($list_brique);
			
			for($i = 0; $i < $result; $i++){
					$this->gpcccir_model->set_brique_by_code_model($list_brique[$i]);
				}
	}
	
	function fun_get_table_famille()
	{
		$code_segment = $this->input->get('cs');
		$data['familles']=$this->gpcccir_model->get_all_famille_by_code_segment_model($code_segment);
		$data['codesegment']=$code_segment;
		$this->load->view('table_gpcccir_views',$data);
	}
	
	function fun_get_table_classe()
	{
		$code_famille = $this->input->get('cf');
		$data['classes']=$this->gpcccir_model->get_all_classe_by_code_famille_model($code_famille);
		$data['code_famille']=$code_famille;
		$this->load->view('table_gpcccir_class_views',$data);
	}

	function fun_get_table_brique()
	{
		$codeClasse = $this->input->get('cb');
		$data['briques']=$this->gpcccir_model->get_all_brique_by_code_classe_model($codeClasse);
		$data['codeclass']=$codeClasse;
		$this->load->view('table_gpcccir_brique_views',$data);
	}
	
	//briquegpc
public function read_xslx_briquegpc() {
ini_set('max_execution_time', -1);
set_time_limit(-1);
		 $file = './assets/GS1_gpc_FR.xlsx';
		
        
		$this->load->library('Libexcel');
		$phpExcel = PHPExcel_IOFactory::load($file);
		// Get the first sheet

		$sheet = $phpExcel->getActiveSheet();
		$rowIterator = $phpExcel->getActiveSheet()->getRowIterator();
		$array_data = array();
		foreach($rowIterator as $row){
			$rowIndex = $row->getRowIndex ();
			var_dump($rowIndex);
			if($rowIndex>1){
				//echo $sheet->getCell('A' . $rowIndex);
				$brique = $this->gpcccir_model->get_brique_by_code_brique_model($sheet->getCell('G' . $rowIndex));
				if(empty($brique))
				{
					 $data_brique = array(
					   'codeBrique' => $sheet->getCell('G' . $rowIndex) ,
					   'ordre_brique' => 0 ,
					   'libelleBrique' => $sheet->getCell('H' . $rowIndex) ,
					   'codeClasse' => $sheet->getCell('E' . $rowIndex) ,
					   'status_br' => 1 
					);
					$this->gpcccir_model->add_brique_model($data_brique);
				}
				
			}
		}
}

public function get_famille_by_segment()
{
	$this->output->set_content_type('application/json')->set_output(json_encode($this->gpcccir_model->get_all_famille_by_code_segment_model($this->input->post('code_segment'))));
}

public function get_classs_by_famille()
{
	$this->output->set_content_type('application/json')->set_output(json_encode($this->gpcccir_model->get_all_classe_by_code_famille_model($this->input->post('code_famille'))));
}
public function	get_brick_by_classs()
{
	$this->output->set_content_type('application/json')->set_output(json_encode($this->gpcccir_model->get_all_brique_by_code_classe_model($this->input->post('code_class'))));
}

public function function_update_segment()
{
	$data_segment = array(
		   'libelleSegment' => $this->input->post('Segment_FRM') ,
		   'libelleSegment_a' => $this->input->post('Segment_ARM') 
		);
	$this->gpcccir_model->update_segment_model($data_segment,$this->input->post('code_segmentM'));
}	

public function function_update_famille()
{
	$data_famille = array(
		   'libelleFamille' => $this->input->post('Famille_FRM') ,
		   'libelleFamille_ar' => $this->input->post('Famille_ARM') 
		);
	$this->gpcccir_model->update_famille_model($data_famille,$this->input->post('code_familleM'));
}	

public function function_update_Classe()
{
	$data_classe = array(
		   'libelleClasse' => $this->input->post('Classe_FRM') ,
		   'libelleClasse_ar' => $this->input->post('Classe_ARM') 
		);
	$this->gpcccir_model->update_classe_model($data_classe,$this->input->post('code_ClasseM'));
}

public function function_update_brique()
{
	$data_brique = array(
		   'libelleBrique' => $this->input->post('brique_FRM') ,
		   'libelleBrique_ar' => $this->input->post('brique_ARM') 
		);
	$this->gpcccir_model->update_brique_model($data_brique,$this->input->post('code_briqueM'));
}

}
