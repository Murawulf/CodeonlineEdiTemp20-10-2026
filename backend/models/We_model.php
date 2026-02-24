<?php
#[AllowDynamicProperties]
class We_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        
		public function get_all_fp_model()
        {
		   $this->query = $this->db->select('id,codebrique')
			->from('fiche_produit')
			//->where('nb_images',0)
			->get();
			return $this->query->result_array();
        }
		
		public function get_all_produit_b_model()
        {
		   $DB1 = $this->load->database('olddb',true);
		   $this->query = $DB1->select('id,images')
			->from('fiche_produit')
			//->where('nb_images', 5)
			->where('imagedone', 0)
			//->where('brand', 'APERICUBE')
			->get();
			return $this->query->result_array();
        }
		
		public function update_old_produits_conditionne_id_produit_model($id_produits_c)
		{
			 $DB1 = $this->load->database('olddb',true);
			$DB1->where('id', $id_produits_c);
			$DB1->update('fiche_produit', array('imagedone' => 1)); 
		}
		
		public function get_min_id_fp_model($gtin)
		{
			$this->query = $this->db->select('min(id) as minid,gtin,libelle,count(gtin) as nbGtin')
			->from('fiche_produit')
			->where('gtin',$gtin)
			//->group_by('gtin')
			//->having(count('*')> 1)
			->get();
			return $this->query->row_array();
		}
		
		public function delete_n_fp_model($id_FP){
			$this->db->delete('nourriture_boisson',array('id_FP' => $id_FP));
		}
		
		public function delete_fp_model($id_FP){
			$this->db->delete('fiche_produit',array('id' => $id_FP));
		}
		
		public function update_produits_conditionne_id_produit_model($id_produits_c,$data_update_c)
		{
			$this->db->where('id', $id_produits_c);
			$this->db->update('fiche_produit', $data_update_c); 
		}
		
	function find_code_class($brik)
	{
		$this->query = $this->db->select("b.codeClasse")
		->from('brickgpc b')
		->where('b.codeBrique',$brik)
		->get();			
		return $this->query->row_array();
	}
	
	public function get_all_fp_EmptyName_model()
        {
		   $this->query = $this->db->select('*')
			->from('fiche_produit')
			//->where('nb_images', 5)
			->where('libelle', '')
			//->where('brand', 'APERICUBE')
			->get();
			return $this->query->result_array();
        }
		
	public function get_all_fp_14_model()
        {
		   $this->query = $this->db->select('id,gtin')
			->from('fiche_produit')
			//->where('nb_images', 5)
			//->where('libelle', '')
			//->where('brand', 'APERICUBE')
			->get();
			return $this->query->result_array();
        }
}