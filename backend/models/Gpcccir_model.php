<?php

// if (session_status() == PHP_SESSION_NONE) {
	// session_start();
// }
#[AllowDynamicProperties]
class Gpcccir_model extends CI_Model {
	function __construct()
    {
        parent::__construct();
    }

	public function get_all_segment_model(){
		 $this->query = $this->db->select('*')
			->from('segmentgpc')
			->where('status_s', 1)
			->get();
			return $this->query->result_array();
	}
	
	//fonction de récupération des données utilisateur
	public function set_all_segment_by_0_model()
	{
		$data_stu=array('status_s'=>0);
		$this->db->update('segmentgpc', $data_stu); 
	}
	
	public function set_segment_by_code_model($codesegment)
	{
		$data_stu=array('status_s'=>1);
		$this->db->where('codeSegment', $codesegment);
		$this->db->update('segmentgpc', $data_stu); 
	}
	
	public function set_all_famille_by_sg_0_model($codesg)
	{
		$data_stu=array('status_f'=>0);
		$this->db->where('codeSegment', $codesg);
		$this->db->update('famillegpc', $data_stu); 
	}
	
	public function set_famille_by_code_model($codefamille)
	{
		$data_stu=array('status_f'=>1);
		$this->db->where('codeFamille', $codefamille);
		$this->db->update('famillegpc', $data_stu); 
	}
	
	public function set_all_classe_by_famille_0_model($codefamille)
	{
		$data_stu=array('status_c'=>0);
		$this->db->where('codeFamille', $codefamille);
		$this->db->update('classegpc', $data_stu); 
	}
	function set_classe_c_by_code_model($codeclasse)
	{
		$data_stu=array('status_c'=>1);
		$this->db->where('codeClasse', $codeclasse);
		$this->db->update('classegpc', $data_stu); 
	}
	
	/*function set_classe_b_by_code_model($codeclasse)
	{
		$data_stu=array('status_b'=>1);
		$this->db->where('codeClasse', $codeclasse);
		$this->db->update('classegpc', $data_stu); 
	}*/
	/*function set_all_classe_by_0_model($codesg)
	{
		$data_stu=array('status_c'=>0,'status_b'=>0);
		$this->db->where('codeSeg', $codesg);
		$this->db->update('classegpc', $data_stu); 
	}*/
	
	function set_all_brique_by_class_0_model($codeclass)
	{
		$data_stu=array('status_br'=>0);
		$this->db->where('codeClasse', $codeclass);
		$this->db->update('brickgpc', $data_stu); 
	}
	
	function set_brique_by_code_model($codebrique)
	{
		$data_stu=array('status_br'=>1);
		$this->db->where('codeBrique', $codebrique);
		$this->db->update('brickgpc', $data_stu); 
	}
	
	function get_all_classe_by_code_segment_model($codesegment)
	{
		$this->query = $this->db->select('*')
			->from('classegpc')
			->where('codeSeg', $codesegment)
			->where('status_c', 1)
			->get();
			return $this->query->result_array();
	}
	
	function get_all_classe_by_code_famille_model($code_famille)
	{
		$this->query = $this->db->select('*')
			->from('classegpc')
			->where('codeFamille', $code_famille)
			->where('status_c', 1)
			->get();
			return $this->query->result_array();
	}
	
	function get_all_famille_by_code_segment_model($codesegment)
	{
		$this->query = $this->db->select('*')
			->from('famillegpc')
			->where('codeSegment', $codesegment)
			->where('status_f', 1)
			->get();
			return $this->query->result_array();
	}
	
	function get_all_brique_by_code_classe_model($codeClasse)
	{
		$this->query = $this->db->select('DISTINCT(libelleBrique),codeBrique,libelleBrique_ar,status_br')
			->from('brickgpc')
			->where('codeClasse', $codeClasse)
			->where('status_br', 1)
			//->group_by('libelleBrique')
			->get();
			return $this->query->result_array();
	}
	
	
	
	function get_brique_by_code_brique_model($code_brique)
	{
		$this->query = $this->db->select('codeBrique')
			->from('brickgpc')
			->where('codeBrique',$code_brique)
			->where('status_br', 1)
			->get();
			return $this->query->row_array();
	}
	
	function add_brique_model($data_brique)
	{
		$this->db->insert('brickgpc', $data_brique);
	}
	
	function update_segment_model($data_segment,$code_segment)
	{
		$this->db->where('codeSegment',$code_segment);
		$this->db->update('segmentgpc', $data_segment); 	
	}
	
	function update_famille_model($data_famille,$code_famille)
	{
		$this->db->where('codeFamille',$code_famille);
		$this->db->update('famillegpc', $data_famille);
	}
	
	function update_classe_model($data_classe,$code_Classe)
	{
		$this->db->where('codeClasse',$code_Classe);
		$this->db->update('classegpc', $data_classe);
	}
	
	function update_brique_model($data_brique,$code_brique)
	{
		$this->db->where('codeBrique',$code_brique);
		$this->db->update('brickgpc', $data_brique);
	}
}
?>