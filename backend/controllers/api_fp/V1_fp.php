  <?php
  use Restserver\Libraries\REST_Controller;
  defined('BASEPATH') OR exit('No direct script access allowed');
	
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');    // cache for 1 day
}
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
 
  if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
        header("Access-Control-Allow-Methods: POST, POST, OPTIONS");         
 
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
 
    exit(0);
}
  // This can be removed if you use __autoload() in config.php OR use Modular Extensions
  /** @noinspection PhpIncludeInspection */
  //To Solve File REST_Controller not found
  require APPPATH . 'libraries/REST_Controller.php';
  require APPPATH . 'libraries/Format.php';

  /**
   * This is an example of a few basic user interaction methods you could use
   * all done with a hardcoded array
   *
   * @package         CodeIgniter
   * @subpackage      Rest Server
   * @category        Controller
   * @author          Phil Sturgeon, Chris Kacerguis
   * @license         MIT
   * @link            https://github.com/chriskacerguis/codeigniter-restserver
   */
  class V1_fp extends REST_Controller {

    function __construct()
    {
          // Construct the parent class
      parent::__construct();
      $this->load->model('api_fp/api_model_fp');
    }
	
	public function fiche_produit_by_gtin_get()
    {
		//echo strlen($this->get('gtin'));
		//if(strlen($this->get('gtin'))==13){$gtin=$this->get('gtin');}else{$gtin = '0'.$this->get('gtin');}
		$xlang=$this->input->get_request_header('x-lang');
		 switch ($xlang) {
			case 'fr-FR':
				$x_lang = 'fr';
				break;
			case 'en-US':
				$x_lang = 'en';
				break;
			default:
				$x_lang = 'fr';
			}
		$response = $this->api_model_fp->fiche_produit_gtin($this->get('gtin'));
		 //var_dump(json_encode($response, true));
		 if(!empty($response))
		 {
			if(($response['images']==null)||($response['images']=='')){$response['images']=[];}
			else{
				//$images = ;
				 $response['images'] = explode(";", $response['images']);
			}
			//if($response['netContent']==null){$response['netContent']='';$response['unitCodeNetContent']='';}
			$response['netContent']='';$response['unitCodeNetContent']='';
			if($response['telephone']==null){$response['telephone']='';}
			if($response['email']==null){$response['email']='';}
			if($response['site']==null){$response['site']='';}
			switch ($response['codeCader']) {
					case 'Libre':
					$response['codeCaderAr'] = "حر";
						break;
					case 'Subventionne':
					$response['codeCaderAr'] = "مدعم";
						break;
					case 'Encadre':
					$response['codeCaderAr'] = "مؤطر";
						break;
					 default:
					   $response['codeCaderAr'] = "";
			}
			$response['serveur']="local";
			$response['libelleBrique'] = $response['libelleBrique_'.$x_lang];
			unset($response['libelleBrique_fr']); 
			unset($response['libelleBrique_en']); 
			$this->response($response, REST_Controller::HTTP_OK);
		 }else{
			$this->gs1_FP($this->get('gtin'));
		 }
    }
	
	/*public function FP_by_gtin_get($gtin)
    {
		 $response = $this->api_model_fp->fiche_produit_gtin($gtin);
		
			 return $response;
		 
    }
   
   public function fiche_produit_by_brand_get()
    {
     $response = $this->api_model_fp->fiche_produit_brand($this->get('brand'));

     $this->response($response, REST_Controller::HTTP_OK);
    }*/
	
   function auth()
	{
		$username ='a5ab302c-7e3c-4b6b-b112-18e8a6abe00f_NETCONSULTINGEUROPELTD';
		$password ='o3vq-3i@Gf?3-j$S';
	   $clt = curl_init();
	   curl_setopt($clt, CURLOPT_RETURNTRANSFER, true);
	   curl_setopt($clt, CURLOPT_URL, "https://api.gs1.fr/auth/connect/token");
	   curl_setopt($clt, CURLOPT_POST, true);
	   curl_setopt($clt, CURLOPT_USERPWD, $username . ":" . $password);
	   /* uncomment this line if you don't have the required SSL certificates */
	   // curl_setopt($cl, CURLOPT_SSL_VERIFYPEER, false);
	   curl_setopt($clt, CURLOPT_POSTFIELDS, array(
		 "grant_type" => "client_credentials",
		 "scope'=>'Products.Read"
		 //"client_id" => "my@email.address",
		 //"client_secret" => "my password"
	   ));
	   $auth_response = curl_exec($clt);
	   if ($auth_response === false)
	   {
		  echo "Failed to authenticate\n";
		  var_dump(curl_getinfo($clt));
		  curl_close($clt);
		  $this->response('NULL', REST_Controller::HTTP_OK);
	   }
	   curl_close($clt);
	   //$this->response(json_decode($auth_response, true), REST_Controller::HTTP_OK);
	   return json_decode($auth_response, true);
	}
	
	public function gs1_FP($gtin)
	{
		$token= $this->auth();
		//$gtin='0745240170808';
		//$token = "<REDACTED_EXPIRED_SANDBOX_TOKEN>";
			//setup the request, you can also use CURLOPT_URL
			$ch = curl_init('https://api.gs1.fr/products/'.$gtin.'?api-version=v2');
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			// Returns the data/output as a string instead of raw data
			//curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

			//Set your auth headers
			curl_setopt($ch, CURLOPT_HTTPHEADER, array(
			   'Content-Type: application/json',
			   'Authorization: Bearer ' . $token['access_token'],
			   'Ocp-Apim-Subscription-Key: 13295cd4d95d487fab03315fb1219e86'
			   ));

			// get stringified data/output. See CURLOPT_RETURNTRANSFER
			
			$data = curl_exec($ch);
			//=="Invalid control key"){var_dump('test');} json_decode(curl_exec($ch), true);
			// get info about the request
			//$info = curl_getinfo($ch);
			// close curl resource to free up system resources
			curl_close($ch);
			/* $response = [
					"serveur" => "gs1",
					"FP"=>json_decode($data, true)
				  ];*/
			//$FP = json_decode($data, true);
			//$FP['serveur']="gs1";
			if($data == "\"Invalid control key\"")
			{$this->response([
                    'message' => 'Invalid control key'
                ], REST_Controller::HTTP_NOT_FOUND);}
			elseif($data == '"Invalid GTIN format. Please enter a GTIN code of 8,12, 13 or 14 characters"')
			{
				$this->response([
                    'message' => 'Format GTIN invalide. Veuillez saisir un code GTIN de 13 ou 14 caractères'
                ], REST_Controller::HTTP_NOT_FOUND); // NOT_FOUND (404) being the HTTP response code
			}else{
				$GFP = json_decode($data, true);
				if(!empty($GFP['itemOffered']['targetMarket']['targetMarketCountries'][0]['countryCode'])){$Numericcode = $GFP['itemOffered']['targetMarket']['targetMarketCountries'][0]['countryCode'];}else{$Numericcode=0;}
				//$pays = $this->api_model_fp->fiche_pays_Numericcode($Numericcode);
				$pays = '';
				if(!empty($pays)){$countryOfOrigin=$pays['libelle'];}else{$countryOfOrigin='';}
				if(!empty($GFP['itemOffered']['brand']['brandName'][0]['value'])){$brand = $GFP['itemOffered']['brand']['brandName'][0]['value'];}else{$brand='';}
				if(!empty($GFP['itemOffered']['brand']['subBrandName'])){$subBrand = $GFP['itemOffered']['brand']['subBrandName'];}else{$subBrand='';}
				if(!empty($GFP['itemOffered']['productDescription'][0]['value'])){$productName = $GFP['itemOffered']['productDescription'][0]['value'];$shortName = $GFP['itemOffered']['productDescription'][0]['value'];}else{$productName='';$shortName ='';}
				if(!empty($GFP['itemOffered']['gtin'])){$gtin = $GFP['itemOffered']['gtin'];}else{$gtin='';}
				if(!empty($GFP['itemOffered']['gpcDescription'])){$libelleBrique = $GFP['itemOffered']['gpcDescription'];}else{$libelleBrique='';}
				if(!empty($GFP['itemOffered']['netContent'][0]['quantity'])){$netContent = $GFP['itemOffered']['netContent'][0]['quantity'];}else{$netContent = '';}
				if(!empty($GFP['itemOffered']['netContent'][0]['unitCode'])){$unitCodeNetContent = $GFP['itemOffered']['netContent'][0]['unitCode'];}else{$unitCodeNetContent = '';}
				if(!empty($GFP['itemOffered']['brandOwner']['companyName'])){$companyName = $GFP['itemOffered']['brandOwner']['companyName'];}else{$companyName = '';}
				if(!empty($GFP['itemOffered']['brandOwner']['globalLocationNumber'])){$gln = $GFP['itemOffered']['brandOwner']['globalLocationNumber'];}else{$gln = '';}
				//if(!empty($GFP['itemOffered']['tradeItemImageUrl']
				$this->response([
				"images" => [],
				"brand"  => $brand,
				"subBrand" => $subBrand,
				"productName" => $productName,
				"shortName" => $shortName,
				"gtin"   => $gtin,
				"countryOfOrigin" => $countryOfOrigin,
				"libelleBrique" => $libelleBrique,
				"prixMin" => '',
				"prixMax" => '',
				"codeCader" => '',
				"netContent" => $netContent,
				"unitCodeNetContent" => $unitCodeNetContent,
				"companyName" => $companyName,
				"gln" => $gln,
				"adresse" => "",
				"telephone" => "",
				"email" => "",
				"site" => "",
				"codeCaderAr" => '',
				"serveur" => 'gs1Organization' 
				], 
				REST_Controller::HTTP_OK);
				//$this->response($GFP['itemOffered'], REST_Controller::HTTP_OK);
				}
	}

    public function fiche_produit_get()
    {
     $response = $this->api_model_fp->fiche_produit();


     $this->response($response, REST_Controller::HTTP_OK);
   }
   
   public function sponsors_get()
    {
     $xlang=$this->input->get_request_header('x-lang');
		 switch ($xlang) {
			case 'fr-FR':
				$x_lang = 'FR';
				break;
			case 'en-US':
				$x_lang = 'EN';
				break;
			default:
				$x_lang = 'EN';
			}
	 $sponsors = $this->api_model_fp->all_sponsors();
	 if(!empty($sponsors)){
		 
			 if(count($sponsors)==1)
			 {	$tablesponsors = array($sponsors[0]['url']);
			 }else{
				$stable ='';
				foreach($sponsors as $row){
					$stable.=$row['url'];
					$stable.=';';
				}
				$stable = substr_replace($stable ,"", -1);
				$tablesponsors = explode(";", $stable);
			}
		$titres_menu = $this->api_model_fp->get_titres_menu();
		$tablesmenu[0] = (object) ['index' => 0,'ar' => $titres_menu['Text_menu1_ar'] ,'fr' => $titres_menu['Text_menu1_fr'] ,'en' => $titres_menu['Text_menu1_en']];
		$tablesmenu[1] = (object) ['index' => 1,'ar' => $titres_menu['Text_menu2_ar'] ,'fr' => $titres_menu['Text_menu2_fr'] ,'en' => $titres_menu['Text_menu2_en']];
		$tablesmenu[2] = (object) ['index' => 2,'ar' => $titres_menu['Text_menu3_ar'] ,'fr' => $titres_menu['Text_menu3_fr'] ,'en' => $titres_menu['Text_menu3_en']];;
		$url = "https://fp.codeonline-info.com/assets/pdf/helpDocument_".$x_lang.".pdf";
		$response = (object) ['menuPrincipal' => $tablesmenu ,'sponsors' => $tablesponsors , 'helpDocument' => $url ];
		 $this->response($response, REST_Controller::HTTP_OK);
	 }else{
		$response = (object) ['sponsors' => [] , 'helpDocument' => $url  ];
		 $this->response($response, REST_Controller::HTTP_NOT_FOUND); 
	 }
   }
   
    public function notifs_get()
    {
		$xlang=$this->input->get_request_header('x-lang');
		 switch ($xlang) {
			case 'fr-FR':
				$x_lang = 'fr';
				break;
			case 'en-US':
				$x_lang = 'en';
				break;
			default:
				$x_lang = 'fr';
			}
		$Notiftable =[];
		$i=0;
     $notifs = $this->api_model_fp->all_notif_active();
		foreach($notifs as $notif){
			$Notiftable[$i]= (object) ['idNotif' => $notif['idNotif'] , 'titreNotif' => $notif['titre_notif_'.$x_lang], 'textNotif' => $notif['texte_notif_'.$x_lang], 'titreNotifAr' => $notif['titre_notif_ar'], 'textNotifAr' => $notif['texte_notif_ar'] ];
			$i++;
		}
	 if(!empty($notifs)){
		 $this->response($Notiftable, REST_Controller::HTTP_OK);
	 }else{
		 $notifs = (object) [];
		 $this->response($notifs, REST_Controller::HTTP_NOT_FOUND); 
	 }
   }
   
   	public function fiche_produit_marque_categorie_by_brand_get()
    {
		$xlang=$this->input->get_request_header('x-lang');
		 switch ($xlang) {
			case 'fr-FR':
				$x_lang = 'fr';
				break;
			case 'en-US':
				$x_lang = 'en';
				break;
			default:
				$x_lang = 'fr';
			}
     $brands = $this->api_model_fp->fiche_produit_name_brand($this->get('brand'));
	 if(!empty($brands)){
			if(count($brands)==1)
			{	
				//$tablesponsors = array($sponsors[0]['url']);
				$categories = $this->api_model_fp->marque_categorie_by_brand($this->get('brand'));
					//var_dump($categories);
					if(count($categories)==1)
					{
						$response [0]= ['brand' => $brands[0]['nameBrand'] , 'categories' => array((object) ['name' => $categories[0]['libelleBrique_'.$x_lang] , 'name_ar' => $categories[0]['libelleBrique_ar'] , 'code' => $categories[0]['codeBrique']]) ];
					}else{
						$ctable =[];
						$j=0;
						foreach($categories as $categorie){
							$ctable[$j]=(object) ['name' => $categorie['libelleBrique_'.$x_lang] , 'name_ar' => $categories[0]['libelleBrique_ar'] , 'code' => $categorie['codeBrique']];
							$j++;
						}
						$response [0]= ['brand' => $brands[0]['nameBrand'] , 'categories' => $ctable ];
					}
				
			}else{
				$brandtable =[];
				$i=0;
				$j=0;
					foreach($brands as $brand){
						$categories = $this->api_model_fp->marque_categorie_by_brand_ext($brand['nameBrand']);
							if(count($categories)==1)
							{
								$brandtable[$i]= (object) ['brand' => $brand['nameBrand'] , 'categories' => array((object) ['name' => $categories[0]['libelleBrique_'.$x_lang], 'name_ar' => $categories[0]['libelleBrique_ar'] , 'code' => $categories[0]['codeBrique']]) ];
							
							}else{
								$ctable =[];
								foreach($categories as $categorie){
									$ctable[$j]=(object) ['name' => $categorie['libelleBrique_'.$x_lang], 'name_ar' => $categories[0]['libelleBrique_ar'] , 'code' => $categorie['codeBrique']];
									$j++;
								}
								$brandtable[$i]= (object) ['brand' => $brand['nameBrand'] , 'categories' => $ctable ];	
								$ctable=[];
							}
							
							$i++;$j=0;
					}
				$response = $brandtable;
				}
	 }else{
		$response = (object) [];
		 $this->response($response, REST_Controller::HTTP_NOT_FOUND); 
	 }

     $this->response($response, REST_Controller::HTTP_OK);
    }
	
	public function fiche_produit_by_brand_category_get()
	{
		$brand = $this->get('brand');
		$categoryCode = $this->get('categoryCode');
		$page = $this->get('page');
		$pageSize = 40;
		$total_fiche_produit = $this->api_model_fp->count_total_fiche_produit_categoryCode_brand($brand,$categoryCode);
		$FPtable =[];
		//$stable=[];
		$webtable=[];
		$i=0;
		$j=0;
		$total=intval($total_fiche_produit["totalFP"]);
		if($total_fiche_produit["totalFP"]<=$pageSize)
		{
			$FPs = $this->api_model_fp->fiche_produit_categoryCode_brand_sans_limit($brand,$categoryCode);
				if(!empty($FPs))
				{
					for ($k = 0; $k < count($FPs); $k++) {
						  if(($FPs[$k]['images']==null)||($FPs[$k]['images']=='')){$FPs[$k]['images']=[];}
							else{
								 $FPs[$k]['images'] = explode(";", $FPs[$k]['images']);
							}
						}
					$FPtable = $FPs;
					$webtable =  (object) ['items' => $FPtable , 'total' => $total, 'pageSize' => $pageSize ];
				}else{$webtable =  (object) ['items' => $FPtable , 'total' => 0, 'pageSize' => $pageSize ];}
		}else{
			$start = ($pageSize*$page) - ($pageSize);
			$FPs = $this->api_model_fp->fiche_produit_categoryCode_brand_with_limit($brand,$categoryCode,$start,$pageSize);
			if(!empty($FPs))
				{
					for ($k = 0; $k < count($FPs); $k++) {
						  if(($FPs[$k]['images']==null)||($FPs[$k]['images']=='')){$FPs[$k]['images']=[];}
							else{
								 $FPs[$k]['images'] = explode(";", $FPs[$k]['images']);
							}
						}
					$FPtable = $FPs;
					$webtable =  (object) ['items' => $FPtable , 'total' => $total, 'pageSize' => $pageSize ];
				}else{$webtable =  (object) ['items' => $FPtable , 'total' => 0, 'pageSize' => $pageSize ];}
		}
		$this->response($webtable, REST_Controller::HTTP_OK);
	}
	
	public function fiche_produit_by_cader_get()
    {
     $cader = $this->get('cader');
	 $xlang=$this->input->get_request_header('x-lang');
	 switch ($xlang) {
				case 'fr-FR':
					$x_lang = 'fr';
					break;
				case 'en-US':
					$x_lang = 'en';
					break;
				default:
				  $x_lang = 'fr';
			}
	if($cader!='Encadre'){$segments = $this->api_model_fp->fiche_produit_segment_cader($cader);}else{$segments = $this->api_model_fp->fiche_produit_segment_art('99000000');}

	 if (!empty($segments))
	 {
		$cadertable =[];
		//$stable=[];
		$btable=[];
		$i=0;
		$j=0;
		
		foreach($segments as $segment){
			
			
			$stable=(object) ['name_fr' => $segment['libelleSegment_'.$x_lang] ,'name_ar' => $segment['libelleSegment_ar'] , 'code' => $segment['codeSegment']];

			if($cader!='Encadre')
			{$categories = $this->api_model_fp->fiche_produit_segment_categorie_cader($cader,$segment['codeSegment']);}
			else{$categories = $this->api_model_fp->fiche_produit_segment_categorie_art('99000000');}
			
			foreach($categories as $categorie){
				
				if($cader!='Encadre')
				{$FPs = $this->api_model_fp->fiche_produit_by_categorie_cader($cader,$categorie['codeBrique']);}
				else{$FPs = $this->api_model_fp->fiche_produit_by_categorie_art($categorie['codeBrique']);}
				
				for ($k = 0; $k < count($FPs); $k++) {
				  if(($FPs[$k]['images']==null)||($FPs[$k]['images']=='')){$FPs[$k]['images']=[];}
					else{
						 $FPs[$k]['images'] = explode(";", $FPs[$k]['images']);
					}
				}
				
				$btable[$i]=(object) ['name_fr' => $categorie['libelleBrique_'.$x_lang] ,'name_ar' => $categorie['libelleBrique_ar'] , 'code' => $categorie['codeBrique'], 'FPs' => $FPs];				
				$i++;
			}
				$cadertable[$j] =  (object) ['segment' => $stable , 'categories' => $btable ];
				$btable=[];
			$i=0;$j++;
		}
	 }else{
		$response = (object) [];
		$this->response($response, REST_Controller::HTTP_NOT_FOUND);  
	 }
	 $this->response($cadertable, REST_Controller::HTTP_OK);
    }
	
	public function fiche_service_by_id_get()
    {
		$xlang=$this->input->get_request_header('x-lang');
		 switch ($xlang) {
			case 'fr-FR':
				$x_lang = 'fr';
				break;
			case 'en-US':
				$x_lang = 'en';
				break;
			default:
				$x_lang = 'fr';
			}
		$response = $this->api_model_fp->fiche_service_id($this->get('idService'));
		 //var_dump(json_encode($response, true));
		 if(!empty($response))
		 {
			if(($response['images']==null)||($response['images']=='')){$response['images']=[];}
			else{
				//$images = ;
				 $response['images'] = explode(";", $response['images']);
			}
			if($response['telephone']==null){$response['telephone']='';}
			if($response['email']==null){$response['email']='';}
			if($response['site']==null){$response['site']='';}
			
			$response['serveur']="local";
			$response['libelleBrique'] = $response['libelleBrique_'.$x_lang];
			unset($response['libelleBrique_fr']); 
			unset($response['libelleBrique_en']);
			
			$response['titreService'] = $response['titreService_'.$x_lang];
			unset($response['titreService_fr']); 
			unset($response['titreService_en']);
			
			$response['texteService'] = $response['texteService_'.$x_lang];
			unset($response['texteService_fr']); 
			unset($response['texteService_en']);
			$this->response($response, REST_Controller::HTTP_OK);
		 }else{
			$response = (object) [];
			$this->response($response, REST_Controller::HTTP_NOT_FOUND);  
		 }
    }
	
	public function fiche_services_by_categories_get()
    {
	 $xlang=$this->input->get_request_header('x-lang');
	 switch ($xlang) {
				case 'fr-FR':
					$x_lang = 'fr';
					break;
				case 'en-US':
					$x_lang = 'en';
					break;
				default:
				  $x_lang = 'fr';
			}
	$segment = $this->api_model_fp->get_segment_service('120000000');

	 if (!empty($segment))
	 {
		$servicetable =[];
		$i=0;
		$j=0;
			$stable=(object) ['libelleSegment' => $segment['libelleSegment_'.$x_lang] ,'libelleSegment_ar' => $segment['libelleSegment_ar'] , 'codeSegment' => $segment['codeSegment']];


		    $categories = $this->api_model_fp->fiche_service_segment_categorie_service('120000000');
				if (!empty($categories))
				{
			
					foreach($categories as $categorie){

						$FPs = $this->api_model_fp->fiche_service_by_brique($categorie['codeBrique']);
						
						for ($k = 0; $k < count($FPs); $k++) {
						  if(($FPs[$k]['images']==null)||($FPs[$k]['images']=='')){$FPs[$k]['images']=[];}
							else{
								 $FPs[$k]['images'] = explode(";", $FPs[$k]['images']);
							}
							$FPs[$k]['titreService'] = $FPs[$k]['titreService_'.$x_lang];
							unset($FPs[$k]['titreService_fr']); 
							unset($FPs[$k]['titreService_en']);
						}
						
						
						$btable[$i]=(object) ['libelleBrique' => $categorie['libelleBrique_'.$x_lang] ,'libelleBrique_ar' => $categorie['libelleBrique_ar'] , 'codeBrique' => $categorie['codeBrique'], 'FPs' => $FPs];				
						$i++;
					}
					$servicetable[$j] =  (object) ['segment' => $stable , 'categories' => $btable ];
				}else{
					$response = (object) [];
					$this->response($response, REST_Controller::HTTP_NOT_FOUND); 
				}
			
	 }else{
		$response = (object) [];
		$this->response($response, REST_Controller::HTTP_NOT_FOUND);  
	 }
	 $this->response($servicetable, REST_Controller::HTTP_OK);
    }

}
    


