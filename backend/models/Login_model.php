<?php
#[AllowDynamicProperties]
class Login_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        }

        public function check_user($username,$password)
        {
			$password=Sha1($password);
			
		   $this->query = $this->db->select('email,id_producteur,raison_socialle,city,region')
			->from('producteur')
			->where(array('email'=>$username,'pwd'=>$password,'statut'=>1))
			->limit(1)->get();
			
			return $this->query->row_array();
        }
		
		 public function check_user_ccri($username,$password)
        {
			$password=Sha1($password);
			
		   $this->query = $this->db->select('uc.id_user_ccir,uc.id_ccir,uc.id_profil,uc.ccir_nom_user,uc.ccir_user_email,uc.phone,c.name,p.lib')
			->from('ccir_user uc')
			->join('ccir c', 'c.id_ccir = uc.id_ccir')
			->join('profiles p', 'uc.id_profil = p.id')
			->where(array('ccir_user_email'=>$username,'pwd'=>$password))
			->limit(1)->get();
			
			return $this->query->row_array();
        }
		
		public function check_industriel_model($username,$password)
        {
			$passwordh=Sha1($password);
			
		   $this->query = $this->db->select('id,nom')
			->from('entreprises')
			->where(array('prenom'=>$username,'password'=>$passwordh))
			->limit(1)->get();
			
			return $this->query->row_array();
        }
		
		public function update_user_ccri_model($id_user_ccri,$data_update_user)
		{
			$this->db->where('id_user_ccir', $id_user_ccri);
			$this->db->update('ccir_user', $data_update_user);
		}
		
		public function reset_erticode($id_user,$data_code)
		{
			$this->db->where('id_user_ccir', $id_user);
			$this->db->update('ccir_user', $data_code); 
		}
		
		public function reset_certicode_producteur($id_user,$data_code)
		{
			$this->db->where('id_producteur', $id_user);
			$this->db->update('producteur', $data_code); 
		}
		
		public function check_erticode($id_user_ccir,$certicode)
		{
			$this->query = $this->db->select('ccir_user_email,id_user_ccir,ccir_nom_user,id_profil')
			->from('ccir_user')
			->where(array('id_user_ccir'=>$id_user_ccir,'certicode'=>$certicode))
			->limit(1)->get();
			
			return $this->query->row_array();
		} 
		
		public function check_erticode_producteur($id_user,$certicode)
		{
			$this->query = $this->db->select('email,id_producteur,raison_socialle')
			->from('producteur')
			->where(array('id_producteur'=>$id_user,'certicode'=>$certicode))
			->limit(1)->get();
			
			return $this->query->row_array();
		}
}