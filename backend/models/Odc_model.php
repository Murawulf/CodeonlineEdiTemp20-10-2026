<?php
#[AllowDynamicProperties]
class Odc_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 
		
		public function anomalies_type_odc_model()
        {
		   $this->query = $this->db->select('*')
			->from('anomalies_type_odc')
			->order_by("libelle_anomalie_odc_fr")
			->get();
			return $this->query->result_array();
        }
		
		public function add_anomalie_odc_model($data_ajouter_anomalie)
		{	
			$this->db->insert('journal_anomalies_odc', $data_ajouter_anomalie);	
		}

        public function get_all_anomalies_odc_model()
        {

		   $data = false;
		   $this->query = $this->db->select('jao.*,r.*,u.name,ato.*')
			->from('journal_anomalies_odc jao')
			->join('anomalies_type_odc ato', 'jao.id_type_anomalie = ato.id_type_anomalie_odc')
			->join('region_ref r', 'jao.region_anomalie = r.id_region')
			->join('users u', 'jao.id_user = u.id_user')
			->order_by("date_mis_a_jour_odc", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		

				$btn='';
				if(($this->session->userdata('profil')=='15'))
				{
					$btn='<a href="javascript:;" onclick="msgbox_confirma_sup(\''.addslashes($row['commentaire']).'\',\''.$row['id_journ_anomalie_odc'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="geta(\''.$row['id_journ_anomalie_odc'].'\')" data-target="#updateaModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				}
				
				$data[] = array(
				'type_anomalie' => $row['libelle_anomalie_odc_fr'].' '.$row['libelle_anomalie_odc_ar'],
				'region' => $row['libelle_region_fr'].' '.$row['libelle_region_ar'],
				'commentaire' => $row['commentaire'],
				'latitude' => $row['lati_anomalie'],
				'longitude' => $row['long_anomalie'],
				'createur' => $row['name'],				
				'url_image' => '<a class="lightbox-type" href="'.base_url()."assets".$row['url_image'].'"><center><img style="max-width: 40px; max-height: 40px;" src='.base_url()."assets".$row['url_image'].' ></a>',
				'date' => $row['date_mis_a_jour_odc'],
				'btn_detail_a' => $btn
			 );
			//array_push($data,$data1);
			}
			return $data;
        }
			
		function get_anomalie_odc_by_id_anomalie_odc_model($id_journ_anomalie_odc)
		{
			 $this->query = $this->db->select('*')
			->from('journal_anomalies_odc')
			->where('id_journ_anomalie_odc',$id_journ_anomalie_odc)
			->get();
			return $this->query->row_array();
		}
				
		public function delete_anomalie_odc_model($id)
		{
			$this->db->delete('journal_anomalies_odc',array('id_journ_anomalie_odc' => $id));		
		}
		
		public function update_anomalie_odc_model($data_ajouter_anomalie,$id_anomalie)
		{
			$this->db->where('id_journ_anomalie_odc', $id_anomalie);
			$this->db->update('journal_anomalies_odc', $data_ajouter_anomalie); 
		}
		
}