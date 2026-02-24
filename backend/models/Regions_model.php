<?php
#[AllowDynamicProperties]
class Regions_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        public function get_all_users_model()
        {

		   $this->query = $this->db->select('u.*,pf.lib')
			->from('users u')
			->join('profiles pf', 'u.idRole = pf.id')
			->order_by("date_mis_a_jour_u", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'email' => $row['email'],
				'name' => $row['name'],
				'lib_profil' => $row['lib'],
				'stus_user' => $row['stus']
				//'btn_detail_user' => '<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle_court_fr']).'\',\''.$row['id_produit_ref'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getfpvc(\''.$row['id_produit_ref'].'\',\''.$row['code_tarif_produit'].'\',\''.addslashes($row['id_type_prod_vrac']).'\',\''.addslashes($row['libelle_court_fr']).'\',\''.addslashes($row['libelle_court_ar']).'\',\''.$row['libelle_court_en'].'\',\''.addslashes($row['poids_usage']).'\',\''.addslashes($row['type_mesure']).'\',\''.addslashes($row['url_icons']).'\')" data-target="#updatevcModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>'
			 );
			//array_push($data,$data1);
			}
			return $data;
        }
		
		public function get_all_marche_model()
		{
			$this->query = $this->db->select('m.id_municpalite_ref,m.tolerance,m.tolerance,m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr,r.libelle_region_fr,r.libelle_region_ar,m.marche_long,m.marche_lat,m.status')
			->from('marche_ref m')
			->join('region_ref r', 'm.id_region = r.id_region')
			//->join('municipalite mu', 'mu.id_municipalite = m.id_municpalite_ref')mu.libelle_municipalite_fr,mu.libelle_municipalite_ar,
			//Marché désactivé Marché détail Marché de gros
			->order_by("m.id_marche", "desc")
			->get();
			$status='';
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 switch ($row['status']) {
					case 0:
						$status = "Marché désactivé";
						break;
					case 1:
						$status = "Marché détail";
						break;
					case 2:
						$status = "Marché de gros";
						break;
					case 3:
						$status = "Marché de Gros Poissons";
						break;
				}
				$this->query2 = $this->db->select('libelle_municipalite_fr')
					->from('municipalite')
					->where('id_municipalite',$row['id_municpalite_ref'])
					->get();
					$municipalite = $this->query2->row_array();
				 $data[] = array(
				'libelle_marche_fr' => $row['libelle_marche_fr'],
				'libelle_marche_ar' => $row['libelle_marche_ar'],
				'region' => $row['libelle_region_fr'].' '.$row['libelle_region_ar'],
				'municipalite' => $municipalite['libelle_municipalite_fr'] ,
				'marche_long' => $row['marche_long'],
				'marche_lat' => $row['marche_lat'],
				'status' => $status ,
				'tolerance' => $row['tolerance'],
				'btn_detail_marche' => '<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['libelle_marche_fr']).'\',\''.$row['id_marche'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getMarchetoUpdate(\''.$row['id_marche'].'\',\''.$row['libelle_marche_fr'].'\',\''.addslashes($row['libelle_marche_ar']).'\',\''.addslashes($row['id_region']).'\',\''.addslashes($row['marche_lat']).'\',\''.addslashes($row['marche_long']).'\',\''.addslashes($row['status']).'\',\''.addslashes($row['tolerance']).'\',\''.$row['id_municpalite_ref'].'\')" data-target="#updateMarcheModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>'
			 );
			//array_push($data,$data1);
			}
			return $data;
		}
		
		function add_marche_model($data_ajouter_marche)
		{	
			$this->db->insert('marche_ref', $data_ajouter_marche);	
		}
		
		function delete_marche_model($id_marche){
			$this->db->delete('marche_ref',array('id_marche' => $id_marche));	
		}
		
		function update_marche_id_marche_model($id_marcheM,$data_update_marche)
		{
			$this->db->where('id_marche', $id_marcheM);
			$this->db->update('marche_ref', $data_update_marche); 
		}
		
		public function get_all_regions_model()
        {
		   $this->query = $this->db->select('*')
			->from('region_ref')
			->where('id_region !=','5')
			->get();
			return $this->query->result_array();
        }
		
		public function get_regions_by_ccir_model($id_ccir)
        {
		   $this->query = $this->db->select('*')
			->from('ccir_region cr')
			->join('region_ref r', 'r.id_region = cr.id_region')
			->where('cr.id_ccir',$id_ccir)
			->get();
			return $this->query->result_array();
        }
		
		public function get_regions_by_userccir_model($id_user)
		{
			$this->query = $this->db->select('r.libelle_region_fr,r.libelle_region_ar,r.id_region')
			->from('ccir_user cu')
			->join('region_ref r', 'r.id_region = cu.id_region')
			->where('cu.id_user_ccir',$id_user)
			->get();
			return $this->query->result_array();
		}
		
		public function get_all_regions_mgp_model()
        {
		   $this->query = $this->db->select('*')
			->from('region_ref')
			->where('mgp','1')
			->get();
			return $this->query->result_array();
        }
		
		public function get_marches_by_region_model($id_regin)
        {
		   $this->query = $this->db->select('*')
			->from('marche_ref')
			->where('id_region',$id_regin)
			->get();
			return $this->query->result_array();
        }
		
		public function get_marche_by_id_model($id_marche)
        {
		   $this->query = $this->db->select('*')
			->from('marche_ref')
			->where('id_marche',$id_marche)
			->get();
			return $this->query->row_array();
        }
		
		public function get_type_marche_by_id_journal_model($id_journ_tarif)
		{
			 $this->query = $this->db->select('m.status')
			->from('marche_ref m ')
			->join('journal_tarifaire j', 'm.id_marche = j.id_marche')
			->where('j.id_journ_tarif',$id_journ_tarif)
			->get();
			return $this->query->row_array();
		}
		
		public function get_id_produit_by_id_journal_model($id_journ_tarif)
		{
			 $this->query = $this->db->select('id_produit_ref')
			->from('journal_tarifaire')
			->where('id_journ_tarif',$id_journ_tarif)
			->get();
			return $this->query->row_array();
		}
		
		public function get_region_byid_model($id_region)
        {
		   $this->query = $this->db->select('*')
			->from('region_ref')
			->where('id_region',$id_region)
			->get();
			return $this->query->row_array();
        }
		
		public function get_marches_by_region_model2($id_regin)
        {
		   $this->query = $this->db->select('id_marche as id, libelle_marche_fr as name')
			->from('marche_ref')
			->where('id_region',$id_regin)
			->or_where('status',2)
			->get();
			return $this->query->result_array();
        }
		
		public function get_marches_poissons_by_region_model2($id_regin)
        {
		   $this->query = $this->db->select('id_marche as id, libelle_marche_fr as name')
			->from('marche_ref')
			->where('id_region',$id_regin)
			->where('status',3)
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
		}
			
		public function delete_produits_vrac_model($id_produit)
		{
			$this->db->delete('produits_vrac_ref',array('id_produit_ref' => $id_produit));		
		}
		
		public function update_produits_vrac_id_produit_model($id_produits_vrac,$data_update_va)
		{
			$this->db->where('id_produit_ref', $id_produits_vrac);
			$this->db->update('produits_vrac_ref', $data_update_va); 
		}
		

		
		public function get_all_type_produits_vrac_model()
        {
		   $this->query = $this->db->select('*')
			->from('type_produit_vrac')
			->get();
			return $this->query->result_array();
        }
		
		public function get_all_marche_magicsuggest_model()
		{
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr,r.libelle_region_fr,r.libelle_region_ar')
			->from('marche_ref m')
			->join('region_ref r', 'm.id_region = r.id_region')
			->where('m.status !=',0)
			->order_by("r.libelle_region_fr")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'].' région: '.$row['libelle_region_fr'].' '.$row['libelle_region_ar'],
				);
			}
			return $data;
		}
		
		public function get_marche_magicsuggest_by_region_model($id_region)
		{
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr')
			->from('marche_ref m')
			->where('m.id_region',$id_region)
			->where('m.status !=',0)
			->order_by("m.id_marche", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		public function get_marche_magicsuggest_by_region_order_by_marche_model($id_region)
		{
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr')
			->from('marche_ref m')
			->where('m.id_region',$id_region)
			->where('m.status !=',0)
			->order_by('m.libelle_marche_fr')
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		public function get_marche_magicsuggest_by_marche_model($marches)
		{
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr')
			->from('marche_ref m')
			 ->where_in('id_marche', array($marches))
			->order_by("m.id_marche", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		
		public function get_marche_poisson_magicsuggest_by_region_model($id_region)
		{
			$data=false;
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr')
			->from('marche_ref m')
			->where('m.id_region',$id_region)
			->where('m.status',3)
			->order_by("m.id_marche", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		
		public function get_marche_poisson_magicsuggest_by_marche_model($id_marche)
		{
			$data=false;
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr')
			->from('marche_ref m')
			->where('m.id_marche',$id_marche)
			->order_by("m.id_marche", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		
		public function get_all_marche_poisson_magicsuggest_model()
		{
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr,r.libelle_region_fr,r.libelle_region_ar')
			->from('marche_ref m')
			->join('region_ref r', 'm.id_region = r.id_region')
			->where('m.status',3)
			->order_by("r.libelle_region_fr")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'].' région: '.$row['libelle_region_fr'].' '.$row['libelle_region_ar'],
				);
			}
			return $data;
		}
		
		public function get_marches_gros_model()
        {
		   $this->query = $this->db->select('*')
			->from('marche_ref')
			->where('status','2')
			->get();
			return $this->query->result_array();
        }
		
		public function get_marches_p_gros_model()
        {
		   $this->query = $this->db->select('*')
			->from('marche_ref')
			->where('status','3')
			->get();
			return $this->query->result_array();
        }
		
		public function get_marche_region_by_id_model($id_marche)
        {
		   $this->query = $this->db->select('m.*,r.*')
			->from('marche_ref m')
			->join('region_ref r', 'm.id_region = r.id_region')
			->where('id_marche',$id_marche)
			->get();
			return $this->query->row_array();
        }
		
		public function get_marche_magicsuggest_by_region_order_by_marche_d_model($id_region,$id_produit,$day)
		{
			$this->query = $this->db->select('m.id_marche,m.id_region,m.libelle_marche_ar,m.libelle_marche_fr')
			->from('region_ref r')
			->join('marche_ref m', 'm.id_region = r.id_region')
			->join('journal_tarifaire jt', 'm.id_marche = jt.id_marche')
			->where('r.id_region',$id_region)
			->where('jt.date_journ',$day)
			->where('jt.id_produit_ref',$id_produit)
			//->where('m.status !=',0)
			->order_by('m.libelle_marche_fr')
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		
		public function get_all_region_magicsuggest_model()
		{
			$this->query = $this->db->select('libelle_region_fr,libelle_region_ar,id_region')
			->from('region_ref')
			->where('id_region !=',5)
			->order_by("libelle_region_fr")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_region'],
				'name' => $row['libelle_region_fr'].' '.$row['libelle_region_ar'],
				);
			}
			return $data;
		}
		
		public function get_marches_gros_model2()
		{
			$this->query = $this->db->select('id_marche,id_region,libelle_marche_ar,libelle_marche_fr')
			->from('marche_ref m')
			->where('status',2)
			->order_by("id_marche", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_marche'],
				'name' => $row['libelle_marche_fr'].' '.$row['libelle_marche_ar'],
				);
			}
			return $data;
		}
		
		public function get_delegation_by_region_model($region)
		{
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('DISTINCT(delegation)')
			->from('tunisie')
			->where('id_region',$region)
			->get();
			return $this->query->result_array();
		}
		
		public function get_delegation_model()
		{
			$this->query = $this->db->select('DISTINCT(delegation)')
			->from('tunisie')
			->get();
			return $this->query->result_array();
		}
		
		public function function_get_localite_by_delegation_model($name_delegation)
		{
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('localite,code_postal')
			->from('tunisie')
			->where('delegation',$name_delegation)
			->get();
			return $this->query->result_array();
		}
		
		public function get_region_delegation_model($localite)
		{
			$this->query = $this->db->select('DISTINCT(delegation),id_region')
			->from('tunisie')
			->where('localite like', $localite)
			->get();
			return $this->query->row_array();
		}
		
	public function get_all_regions_model2()
        {
		   $this->query = $this->db->select('id_region,libelle_region_fr,libelle_region_ar')
			->from('region_ref')
			->where('id_region !=','5')
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_region'],
				'name' => $row['libelle_region_fr'].' '.$row['libelle_region_ar'],
				);
			}
			return $data;
        }
		
}