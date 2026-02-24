<?php
#[AllowDynamicProperties]
class Notif_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        
		public function get_all_notif_model()
		{
			$data=[];
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->query = $this->db->select('*')
			->from('notif')
			->where('status',1)
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{	
				switch ($this->session->userdata('profil')) {
						case 4:
							$btn='';
							break;
						default:
						   $btn='<button data-toggle="modal" onclick="getnotiftoUpdate(\''.$row['id_notif'].'\')" data-target="#updateNotifModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['id_notif']).'\')" class="btn btn-danger"><i class="icon-trash"></i></a>';
					}
				$data[] = array(
				'notif_ar' => '<b>Titre : '.$row['titre_notif_ar'].'</b><br>Texte : '.$row['texte_notif_ar'],
				'notif_fr' => '<b>Titre :'.$row['titre_notif_fr'].'</b><br>Texte :'.$row['texte_notif_fr'],
				'notif_en' => '<b>Titre :'.$row['titre_notif_en'].'</b><br>Texte :'.$row['texte_notif_en'],
				'date_notif' => $row['date_notif'],
				'date_m_notif' => $row['date_m_notif'],
				//'btn_detail_ccir' => '<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['name']).'\',\''.$row['id_ccir'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<button data-toggle="modal" onclick="getccirtoUpdate(\''.$row['id_ccir'].'\',\''.$row['name'].'\')" data-target="#updateCcirModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>'
				'btn_detail_notif' => $btn
			 );
			//array_push($data,$data1);
			}
			return $data;
		}
		
		
		
		public function get_notif_by_id_model($id_notif)
		{
			$this->query = $this->db->select('*')
			->from('notif')
			->where('id_notif',$id_notif)
			->get();
			return $this->query->row_array();
		}
		
		function add_notif_model($data_notif_user)
		{	
			$this->db->insert('notif', $data_notif_user);
		}
		

		function delete_notif_by_id_model($id_notif)
		{
			$this->db->delete('notif',array('id_notif' => $id_notif));	
		}
		

		public function update_notif_model($update_notif_model,$id_notif)
			{
				$this->db->where('id_notif', $id_notif);
				$this->db->update('notif', $update_notif_model); 
			}
			
		
			
}