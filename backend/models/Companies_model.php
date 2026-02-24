<?php
#[AllowDynamicProperties]
class Companies_model extends CI_Model {


        public function __construct()
        {
                // Call the CI_Model constructor
                parent::__construct();
        } 

        public function get_all_entreprises_model()
        {
			$data=[];
		   //$dbFP =  $this->load->database('dbFP', TRUE);
		   $this->query = $this->db->select('id_producteur,raison_socialle,gln,site,personne_contact,email,telephone,adresse,city,localite,postalCode,id_ccir,pays,region,nb_fp,status_ent')
			->from('producteur')
			->where('pays', 788)
			//->where('id_ccir', $id_ccir)
			->order_by("id_producteur", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				$id_segment ='';
				$this->query2 = $this->db->select('s.libelleSegment,s.libelleSegment_a,s.codeSegment')
				->from('producteur_segment ps')
				->join('segmentgpc s', 's.codeSegment = ps.id_segment')
				->where('ps.id_producteur', $row['id_producteur'])
				->get();
					$n=count($this->query2->result_array());
					$i=1;
					$v= ',';
					$code_Segment = '';
				foreach ($this->query2->result_array() as $key=>$r)
				{
					if($i == $n) {$v= '';}
					$id_segment .= $r['libelleSegment'].$v;
					$code_Segment .= $r['codeSegment'].$v;
					$i++;
				}
				
				$nb_produit=0;
				
				 $this->query3 = $this->db->select('id')
				->from('fiche_produit fp')
				->where('fp.idEntreprise', $row['id_producteur'])
				->get();
				$nb_produit=count($this->query3->result_array());
				
				//if($this->session->userdata('profil') ==1){
					
				/*$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>
				&nbsp;&nbsp;
				<a href="javascript:;" onclick="msgbox_confirm_send_email(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" class="btn btn-info"><i class="icon-key"></i></a>
				&nbsp;&nbsp;
				<button data-toggle="modal" onclick="getcompanies(\''.$row['id_producteur'].'\',\''.addslashes($row['raison_socialle']).'\',\''.addslashes($row['email']).'\',\''.addslashes($row['adresse']).'\',\''.addslashes($row['personne_contact']).'\',\''.addslashes($row['telephone']).'\',\''.addslashes($row['gln']).'\',\''.addslashes($row['nb_fp']).'\')" data-target="#updateptModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				*/
				
				
				//}else{}
				$pub ='';
				switch ($this->session->userdata('profil')) {
						case 1:
							$btn='
							  <div class="btn-group">
								<button type="button" class="btn btn-info dropdown-toggle" data-toggle="dropdown">Action <span class="caret"></span></button>
								<ul class="dropdown-menu" role="menu">
								  <li><a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" ><i class="icon-trash"></i> Supprimer</a></li>
								  <li><a href="javascript:;" onclick="msgbox_confirm_send_email(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" ><i class="icon-key"></i> Envoyer Compte</a></li>
								  <li><a href="javascript:;" data-toggle="modal" onclick="getcompanies(\''.$row['id_producteur'].'\',\''.$row['raison_socialle'].'\',\''.$row['email'].'\',\''.$row['adresse'].'\',\''.$row['personne_contact'].'\',\''.$row['telephone'].'\',\''.$row['gln'].'\',\''.$row['nb_fp'].'\',\''.$code_Segment.'\',\''.$row['status_ent'].'\')" data-target="#updateptModal" ><i class="icon-edit"></i> Modifier</a></li>
								</ul>
							  </div>';
							$pub = 'R: '.$nb_produit.' / E: '.$row['nb_fp'];
							break;
						case 4:
							$btn='';
							$pub = $nb_produit ;
							break;
						case 5:
							$btn='';
							$pub = $nb_produit ;
							break;
						default:
						   $btn='<a href="javascript:;" onclick="msgbox_confirm_send_email(\''.$row['raison_socialle'].'\',\''.$row['id_producteur'].'\')" class="btn btn-info"><i class="icon-key"></i></a>';
						   $pub = 'R: '.$nb_produit.' / E: '.$row['nb_fp'];
					}
				$data[] = array(
				'raison_socialle' => $row['raison_socialle'],
				//'logo_ea' => '<a class="lightbox-type" href="'."http://www.codeonline.info/imgvrac/".$row['image'].'"><center><img style="max-width: 40px; max-height: 40px;" src='."http://www.codeonline.info/imgvrac/".$row['image'].' ></a>',
				'adresse' => $row['adresse'],
				'email' => $row['email'],
				'personne_contact' => $row['personne_contact'],
				'gln' => $row['gln'],
				'telephone' => $row['telephone'],
				'site' => $row['site'],
				'pays' => $row['pays'],
				'postalCode' => $row['postalCode'],
				'city' => $row['city'] ,
				'status_ent' =>  $row['status_ent'],
				'region' => $row['region'] .' / '. $row['localite'],
				'segments' => $id_segment,
				'nb_produit' =>  $pub,
				'btn_detail_ept' => $btn
			 );

			}
			return $data;
        }
		
		public function get_all_entreprises_by_ccir_model($id_ccir)
		 {
		   $data=[];
		   //$dbFP =  $this->load->database('dbFP', TRUE);
		   $this->query = $this->db->select('id_producteur,raison_socialle,gln,site,personne_contact,email,telephone,adresse,city,localite,postalCode,id_ccir,pays,region')
			->from('producteur')
			->where('pays', 788)
			->where('id_ccir', $id_ccir)
			->order_by("id_producteur", "desc")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				
				$id_segment ='';
				$this->query2 = $this->db->select('s.libelleSegment,s.libelleSegment_a,s.codeSegment')
				->from('producteur_segment ps')
				->join('segmentgpc s', 's.codeSegment = ps.id_segment')
				->where('ps.id_producteur', $row['id_producteur'])
				->get();
					$n=count($this->query2->result_array());
					$i=1;
					$v= ',';
				foreach ($this->query2->result_array() as $key=>$r)
				{
					if($i == $n) {$v= '';}
					$id_segment .= $r['libelleSegment'].$v;
					$i++;
				}
				
				$nb_produit=0;
				
				 $this->query3 = $this->db->select('id')
				->from('fiche_produit fp')
				->where('fp.idEntreprise', $row['id_producteur'])
				->get();
				$nb_produit=count($this->query3->result_array());
				if($this->session->userdata('profil') ==1){
				$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.$row['raison_socialle'].'\',\''.$row['id_producteur'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>&nbsp;&nbsp;<a href="javascript:;" onclick="msgbox_confirm_send_email(\''.$row['raison_socialle'].'\',\''.$row['id_producteur'].'\')" class="btn btn-info"><i class="icon-key"></i></a>';
				}else{$btn='<a href="javascript:;" onclick="msgbox_confirm_send_email(\''.$row['raison_socialle'].'\',\''.$row['id_producteur'].'\')" class="btn btn-info"><i class="icon-key"></i></a>';
				}
				$data[] = array(
				'raison_socialle' => $row['raison_socialle'],
				//'logo_ea' => '<a class="lightbox-type" href="'."http://www.codeonline.info/imgvrac/".$row['image'].'"><center><img style="max-width: 40px; max-height: 40px;" src='."http://www.codeonline.info/imgvrac/".$row['image'].' ></a>',
				'adresse' => $row['adresse'],
				'email' => $row['email'],
				'personne_contact' => $row['personne_contact'],
				'gln' => $row['gln'],
				'telephone' => $row['telephone'],
				'site' => $row['site'],
				'pays' => $row['pays'],
				'postalCode' => $row['postalCode'],
				'city' => $row['city'],
				'localite' =>  $row['localite'],
				'region' => $row['region'],
				'segments' => $id_segment,
				'nb_produit' => $nb_produit,
				'btn_detail_ept' => $btn
			 );
			//array_push($data,$data1);
			}
			return $data;
        }
		
		 public function get_all_entreprises_by_secteur_region_model($secteurs,$id_region)
        {
			$data=false;
		   //$dbFP =  $this->load->database('dbFP', TRUE);
		   if($secteurs==0)
		   {
		   $this->query = $this->db->select('p.id_producteur,p.raison_socialle,p.gln,p.site,p.personne_contact,p.email,p.telephone,p.adresse,p.city,p.localite,p.postalCode,p.id_ccir,p.pays,p.region,p.nb_fp,p.status_ent')
			->from('producteur p')
			->join('region_ref r', 'r.libelle_region_fr = p.region')
			->where('pays', 788)
			->where('r.id_region', $id_region)
			->order_by("id_producteur", "desc")
			->get();
		   }
		   if(($secteurs!=0)&&($id_region!=0))
		   {
			$this->query = $this->db->select('p.id_producteur,p.raison_socialle,p.gln,p.site,p.personne_contact,p.email,p.telephone,p.adresse,p.city,p.localite,p.postalCode,p.id_ccir,p.pays,p.region,p.nb_fp,p.status_ent')
			->from('producteur p')
			->join('region_ref r', 'r.libelle_region_fr = p.region')
			->join('producteur_segment ps', 'ps.id_producteur = p.id_producteur')
			->where('pays', 788)
			->where('r.id_region', $id_region)
			->where('ps.id_segment', $secteurs)
			->order_by("id_producteur", "desc")
			->get();
		   }
		   if($id_region==0)
		   {
		   $this->query = $this->db->select('p.id_producteur,p.raison_socialle,p.gln,p.site,p.personne_contact,p.email,p.telephone,p.adresse,p.city,p.localite,p.postalCode,p.id_ccir,p.pays,p.region,p.nb_fp,p.status_ent')
			->from('producteur p')
			->join('region_ref r', 'r.libelle_region_fr = p.region')
			->join('producteur_segment ps', 'ps.id_producteur = p.id_producteur')
			->where('pays', 788)
			->where('ps.id_segment', $secteurs)
			->order_by("id_producteur", "desc")
			->get();
		   }
			foreach ($this->query->result_array() as $key=>$row)
			{		
				$id_segment ='';
				$this->query2 = $this->db->select('s.libelleSegment,s.libelleSegment_a,s.codeSegment')
				->from('producteur_segment ps')
				->join('segmentgpc s', 's.codeSegment = ps.id_segment')
				->where('ps.id_producteur', $row['id_producteur'])
				->get();
					$n=count($this->query2->result_array());
					$i=1;
					$v= ',';
					$code_Segment = '';
				foreach ($this->query2->result_array() as $key=>$r)
				{
					if($i == $n) {$v= '';}
					$id_segment .= $r['libelleSegment'].$v;
					$code_Segment .= $r['codeSegment'].$v;
					$i++;
				}
				
				$nb_produit=0;
				
				 $this->query3 = $this->db->select('id')
				->from('fiche_produit fp')
				->where('fp.idEntreprise', $row['id_producteur'])
				->get();
				$nb_produit=count($this->query3->result_array());
				
				//if($this->session->userdata('profil') ==1){
					
				/*$btn='<a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" class="btn btn-danger"><i class="icon-trash"></i></a>
				&nbsp;&nbsp;
				<a href="javascript:;" onclick="msgbox_confirm_send_email(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" class="btn btn-info"><i class="icon-key"></i></a>
				&nbsp;&nbsp;
				<button data-toggle="modal" onclick="getcompanies(\''.$row['id_producteur'].'\',\''.addslashes($row['raison_socialle']).'\',\''.addslashes($row['email']).'\',\''.addslashes($row['adresse']).'\',\''.addslashes($row['personne_contact']).'\',\''.addslashes($row['telephone']).'\',\''.addslashes($row['gln']).'\',\''.addslashes($row['nb_fp']).'\')" data-target="#updateptModal" class="btn btn-warning" type="button"> <i class="icon-edit"></i> </button>';
				*/
				
				
				//}else{}
				$pub ='';
				switch ($this->session->userdata('profil')) {
						case 1:
							$btn='
							  <div class="btn-group">
								<button type="button" class="btn btn-info dropdown-toggle" data-toggle="dropdown">Action <span class="caret"></span></button>
								<ul class="dropdown-menu" role="menu">
								  <li><a href="javascript:;" onclick="msgbox_confirm_sup(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" ><i class="icon-trash"></i> Supprimer</a></li>
								  <li><a href="javascript:;" onclick="msgbox_confirm_send_email(\''.addslashes($row['raison_socialle']).'\',\''.$row['id_producteur'].'\')" ><i class="icon-key"></i> Envoyer Compte</a></li>
								  <li><a href="javascript:;" data-toggle="modal" onclick="getcompanies(\''.$row['id_producteur'].'\',\''.$row['raison_socialle'].'\',\''.$row['email'].'\',\''.$row['adresse'].'\',\''.$row['personne_contact'].'\',\''.$row['telephone'].'\',\''.$row['gln'].'\',\''.$row['nb_fp'].'\',\''.$code_Segment.'\',\''.$row['status_ent'].'\')" data-target="#updateptModal" ><i class="icon-edit"></i> Modifier</a></li>
								</ul>
							  </div>';
							$pub = 'R: '.$nb_produit.' / E: '.$row['nb_fp'];
							break;
						case 4:
							$btn='';
							$pub = $nb_produit ;
							break;
						case 5:
							$btn='';
							$pub = $nb_produit ;
							break;
						default:
						   $btn='<a href="javascript:;" onclick="msgbox_confirm_send_email(\''.$row['raison_socialle'].'\',\''.$row['id_producteur'].'\')" class="btn btn-info"><i class="icon-key"></i></a>';
						   $pub = 'R: '.$nb_produit.' / E: '.$row['nb_fp'];
					}
				$data[] = array(
				'raison_socialle' => $row['raison_socialle'],
				//'logo_ea' => '<a class="lightbox-type" href="'."http://www.codeonline.info/imgvrac/".$row['image'].'"><center><img style="max-width: 40px; max-height: 40px;" src='."http://www.codeonline.info/imgvrac/".$row['image'].' ></a>',
				'adresse' => $row['adresse'],
				'email' => $row['email'],
				'personne_contact' => $row['personne_contact'],
				'gln' => $row['gln'],
				'telephone' => $row['telephone'],
				'site' => $row['site'],
				'pays' => $row['pays'],
				'postalCode' => $row['postalCode'],
				'city' => $row['city'] ,
				'status_ent' =>  $row['status_ent'],
				'region' => $row['region'] .' / '. $row['localite'],
				'segments' => $id_segment,
				'nb_produit' =>  $pub,
				'btn_detail_ept' => $btn
			 );

			}
			return $data;
        }
		
		
		function add_entreprises_model($data_ajouter_ep)
		{	
			//$dbFP =  $this->load->database('dbFP', TRUE);
			$this->db->insert('producteur', $data_ajouter_ep);	
			return $this->db->insert_id();
		}
		
		function add_segment_ep_model($data_ajouter_ep_seg)
		{
			$this->db->insert('producteur_segment', $data_ajouter_ep_seg);
		}
		
		public function delete_entp_segment_model($id_etp)
		{
			$this->db->delete('producteur_segment',array('id_producteur' => $id_etp));
		}
		
		public function update_entreprise_model($id_entreprise,$data_ajouter_eptm)
		{
			$this->db->where('id_producteur', $id_entreprise);
			$this->db->update('producteur', $data_ajouter_eptm); 
		}
		
		function get_entreprise_model($id_ept)
		{
			 $this->query = $this->db->select('p.id_producteur,p.raison_socialle,p.gln,p.pays,p.site,p.personne_contact,p.service,p.email,p.tel_mobile,p.telephone,p.fax,p.adresse,p.region,p.city,p.localite,p.postalCode,p.nb_fp,p.id_ccir,r.id_region,status_ent')
			->from('producteur p')
			->join('region_ref r', 'r.libelle_region_fr = p.region')
			->where('p.id_producteur',$id_ept)
			->get();
			return $this->query->row_array();
		}
		
		function check_entreprise_model($id_comp_m,$pwd1)
		{
			$this->query = $this->db->select('id_producteur')
			->from('producteur')
			->where('id_producteur',$id_comp_m)
			->where('pwd',sha1($pwd1))
			->get();
			return $this->query->row_array();
		}
		
		function get_all_d_entreprise_model()
		{
			$this->query = $this->db->select('id_producteur,raison_socialle,personne_contact')
			->from('producteur')
			->order_by("raison_socialle")
			->get();
			foreach ($this->query->result_array() as $key=>$row)
			{		
				 $data[] = array(
				'id' => $row['id_producteur'],
				'name' => $row['raison_socialle'].' '.$row['personne_contact'],
				);
			}
			return $data;
		}

		public function delete_entreprise_model($id_ep)
		{
			$this->db->delete('producteur',array('id_producteur' => $id_ep));		
		}
		
		public function get_all_entreprises_t_model()
        {
		   $this->query = $this->db->select('id_producteur,raison_socialle')
			->from('producteur')
			->where('pays', 788)
			->order_by("id_producteur", "desc")
			->get();
			return $this->query->result_array();
		}
		
		public function get_secteur_active_graph_model()
		{
			$this->query = $this->db->select('s.libelleSegment,s.codeSegment')
			->from('segmentgpc s')
			->where('s.status_s', 1)
			->get();
			return $this->query->result_array();
		}
		
		public function get_ept_secteur_active_graph_model($codeSegment)
		{
			$this->query = $this->db->select('count(ps.id_producteur) as nb_ept')
			->from('producteur_segment ps')
			->join('producteur p', 'ps.id_producteur = p.id_producteur')
			->where('ps.id_segment', $codeSegment)
			->where('p.status_ent', 'A')
			->get();
			return $this->query->row_array();
		}
		
		public function check_if_entreprise_service_model($id_ep)
		{
			$this->query = $this->db->select('count(ps.id_producteur) as nb_ept')
			->from('producteur_segment ps')
			->join('producteur p', 'ps.id_producteur = p.id_producteur')
			->where('p.id_producteur', $id_ep)
			->where('ps.id_segment', 120000000)
			->get();
			return $this->query->row_array();
		}
		
		public function get_all_segment_by_producteur_garph_model($id_user)
		{
			$this->query = $this->db->select('s.codeSegment,s.libelleSegment')
			->from('segmentgpc s')
			->join('producteur_segment ps', 'ps.id_segment = s.codeSegment')
			->where('ps.id_producteur',$id_user)
			->where('ps.id_segment!=',120000000)
			->order_by("s.libelleSegment")
			->get();
			return $this->query->result_array();
		}
		
		
}