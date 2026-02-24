<?php
#[AllowDynamicProperties]
class Users_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        public function get_all_users_model()
        {
		   $marche = '';
		   $id_marche = '';
		   $this->query = $this->db->select('u.*,r.*,pf.lib')
			->from('users u')
			->join('profiles pf', 'u.idRole = pf.id')
			->join('region_ref r', 'u.id_region = r.id_region')
			->where('u.idRole !=','1')
			->order_by("id_user", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $this->query2 = $this->db->select('um.*,m.*')
					->from('user_marche um')
					->join('marche_ref m', 'um.marche = m.id_marche')
					->where('user',$row['id_user'])
					->get();
					$n=count($this->query2->result_array());
					$i=1;
					$v= ',';
				foreach ($this->query2->result_array() as $key=>$r)
				{
					if($i == $n) {$v= '';}
					$marche .= $r['libelle_marche_fr'].'; ';
					$id_marche .= $r['id_marche'].$v;
					$i++;
				}
				if($row['idRole'] == 2){
					$this->query3 = $this->db->select('*')
						->from('municipalite')
						->where('id_municipalite',$row['id_municipalite'])
						->get();
					foreach ($this->query3->result_array() as $key=>$rm)
					{
						$libelle_municipalite = ' / '.$rm['libelle_municipalite_fr'];
					}
				}else {$libelle_municipalite ='';}
				
				 $data[] = array(
				'email' => $row['email'],
				'name' => $row['name'],
				'lib_profil' => $row['lib'],
				'region' => $row['libelle_region_fr'].$libelle_municipalite,
				'marche' => $marche,
				'btn_detail_user' => '<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['name']).'\',\''.$row['id_user'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getusers(\''.$row['id_user'].'\',\''.addslashes($row['name']).'\',\''.addslashes($row['email']).'\',\''.addslashes($row['idRole']).'\',\''.addslashes($row['id_region']).'\',\''.$id_marche.'\',\''.addslashes($row['id_municipalite']).'\',\''.addslashes($row['id_mg_ref']).'\',\''.addslashes($row['id_mg_ref_per']).'\',\''.addslashes($row['id_mg_ref_per2']).'\',\''.addslashes($row['id_mgp_ref']).'\',\''.addslashes($row['id_mgp_ref_per']).'\',\''.addslashes($row['id_mgp_ref_per2']).'\')" data-target="#updateuserModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>'
			 );
			 $marche = '';
			 $id_marche = '';
			}
			return $data;
        }
		
		public function get_all_profil_model()
        {
		   $this->query = $this->db->select('*')
			->from('profiles')
			->where('id !=','1')
			->get();
			return $this->query->result_array();
        }
		
		function get_all_produits_vrac_simple_by_type_model($type_vc)
		{
			 $this->query = $this->db->select('*')
			->from('produits_vrac_ref')
			->where('id_type_prod_vrac',$type_vc)
			->order_by("libelle_court_fr")
			->get();
			return $this->query->result_array();
		}
		
		function add_user_model($data_ajouter_user)
		{	
			$this->db->insert('users', $data_ajouter_user);	
			return $this->db->insert_id();
		}
		
		function add_user_marche_model($data_ajouter_user_marche)
		{
			$this->db->insert('user_marche', $data_ajouter_user_marche);	
		}
		
		function delete_user_model($id_user){
			$this->db->delete('users',array('id_user' => $id_user));
		}
		
		function update_user_model($id_user,$data_update_user)
		{
			$this->db->where('id_user', $id_user);
			$this->db->update('users', $data_update_user); 
		}
		
		function delete_user_marche_model($id_user)
		{
			$this->db->delete('user_marche',array('user' => $id_user));
		}
		
		
			
		
}