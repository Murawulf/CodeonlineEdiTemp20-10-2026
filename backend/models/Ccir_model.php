<?php
#[AllowDynamicProperties]
class Ccir_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        
		public function get_all_ccir_model()
		{
			$data=[];
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('c.name,c.adresse,c.id_ccir,c.lib_court,delegation,localite,libelle_region_fr,c.id_region')
			->from('ccir c')
			->join('region_ref rr', 'c.id_region = rr.id_region')
			->where('c.id_ccir !=',1)
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{	
				$id_region ='';
				$this->query2 = $this->db->select('r.libelle_region_fr,r.libelle_region_ar,r.id_region')
				->from('ccir_region cr')
				->join('region_ref r', 'r.id_region = cr.id_region')
				->where('cr.id_ccir', $row['id_ccir'])
				->get();
					$n=count($this->query2->result_array());
					$i=1;
					$v= ',';
				foreach ($this->query2->result_array() as $key=>$r)
				{
					if($i == $n) {$v= '';}
					$id_region .= $r['libelle_region_fr'].$v;
					$i++;
				}
				 $data[] = array(
				'name' => $row['name'],
				'lib_court' => $row['lib_court'],
				'adresse' => $row['adresse'],
				'regionx' => $row['libelle_region_fr'].' // '.$row['delegation'].' // '.$row['localite'],
				'id_region' => $id_region,
				//'btn_detail_ccir' => '<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['name']).'\',\''.$row['id_ccir'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getccirtoUpdate(\''.$row['id_ccir'].'\',\''.$row['name'].'\')" data-target="#updateCcirModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>'
				'btn_detail_ccir' => '<button data-toggle="modal" onclick="getccirtoUpdate(\''.$row['id_ccir'].'\',\''.$id_region.'\',\''.$row['id_region'].'\')" data-target="#updateCcirModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_sup(\''.$row['name'].'\',\''.$row['id_ccir'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>'
			 );
			//array_push($data,$data1);
			}
			return $data;
		}
		
		public function get_all_user_ccir_model()
		{
			$data=[];
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('uc.id_user_ccir,uc.ccir_nom_user,uc.ccir_user_email,uc.phone,c.name,p.lib,uc.id_ccir,uc.id_profil')
			->from('ccir_user uc')
			->where('uc.id_profil !=',1)
			->join('ccir c', 'c.id_ccir = uc.id_ccir')
			->join('profiles p', 'uc.id_profil = p.id')
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{	
				 $data[] = array(
				'ccir_nom_user' => $row['ccir_nom_user'],
				'ccir_user_email' => $row['ccir_user_email'],
				'name_ccir' => $row['name'],
				'lib_profil' => $row['lib'],
				'ccir_user_phone' => $row['phone'],
				'btn_detail_ccir' => '<button data-toggle="modal" onclick="getccirusertoUpdate('.$row['id_user_ccir'].')" data-target="#updateuserccirModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_sup(\''.$row['ccir_nom_user'].'\',\''.$row['id_user_ccir'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>'
			 );
			//array_push($data,$data1);
			}
			return $data;
		}
		
		public function get_all_ccirs_model()
		{
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('*')
			->from('ccir')
			->where('id_ccir !=',1)
			->get();
			return $this->query->result_array();
		}
		
		public function get_all_profil_ccirs_model()
		{
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('*')
			->from('profiles')
			->get();
			return $this->query->result_array();
		}
		
		function add_user_ccir_model($data_ajouter_ccir_user)
		{	
			$this->db->insert('ccir_user', $data_ajouter_ccir_user);
			return $this->db->insert_id();
		}
		
		function get_cciruser_by_id_model($id_user_ccir)
		{
			$this->query = $this->db->select('id_ccir,id_profil,ccir_nom_user,ccir_user_email,phone,id_region')
			->from('ccir_user')
			->where('id_user_ccir',$id_user_ccir)
			->get();
			return $this->query->row_array();
		}
		
		function delete_ccir_region_model($id_ccir)
		{
			$this->db->delete('ccir_region',array('id_ccir' => $id_ccir));	
		}
		
		function delete_cciruser_by_id_model($id_user)
		{
			$this->db->delete('ccir_user',array('id_user_ccir' => $id_user));	
		}
		
		function add_ccir_model($data_ajouter_ccir)
		{	
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->db->insert('ccir', $data_ajouter_ccir);
			return $this->db->insert_id();
		}
		
		function add_ccir_region_model($data_ajouter_ccir_region)
		{	
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->db->insert('ccir_region', $data_ajouter_ccir_region);
		}
		
		function delete_ccir_model($id_ccir){
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->db->delete('ccir',array('id_ccir' => $id_ccir));	
		}
		
		public function update_ccir_model($data_update_ccir,$id_ccir)
			{
				$this->db->where('id_ccir', $id_ccir);
				$this->db->update('ccir', $data_update_ccir); 
			}
			
		public function update_user_ccir_model($data_update_ccir_user,$id_user_ccirM)
		{
				$this->db->where('id_user_ccir', $id_user_ccirM);
				$this->db->update('ccir_user', $data_update_ccir_user); 
		}
		
		public function get_regions_by_ccir_model($id_ccir)
        {
		   //$dbFP =  $this->load->database('dbFP', TRUE);
		   $this->query = $this->db->select('')
			->from('ccir_region cr')
			->join('region_ref r', 'r.id_region = cr.id_region')
			->where('cr.id_ccir',$id_ccir)
			->get();
			return $this->query->result_array();
        }
		
	
		
		public function get_ccir_by_id_model($id_ccir)
		{
			$this->query = $this->db->select('*')
			->from('ccir')
			->where('id_ccir',$id_ccir)
			->get();
			return $this->query->row_array();
			
		}
			
}