<?php
#[AllowDynamicProperties]
class Session_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 
		public function get_name_session_model()
        {
		   $this->query = $this->db->select('version_number')
			->from('version')
			->get();
			return $this->query->row_array();
        }
		
		public function nbdownload()
		{
			$this->db->set('nb_download', 'nb_download+1', FALSE);
			$this->db->update('download');
		}

}