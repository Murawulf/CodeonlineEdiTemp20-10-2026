<?php
use Restserver\Libraries\REST_Controller;
defined('BASEPATH') OR exit('No direct script access allowed');

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
}
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    exit(0);
}

require APPPATH . 'libraries/REST_Controller.php';
require APPPATH . 'libraries/Format.php';

/**
 * Mobile API Controller � V1_fp
 *
 * FIX: Images are physically stored under the React/EDI app at
 *      https://civ-dev.codeonline-edi.net/
 *      The DB stores relative paths such as "/images/products/filename.jpg".
 *      This API normalises every image path to a full absolute URL so the
 *      mobile app (https://civ-fp.codeonline-edi.net/) can fetch them
 *      without knowing where the files actually live.
 */
class V1_fp extends REST_Controller {

    /**
     * Base URL of the server that physically hosts the uploaded images.
     * This is the React / Edi-dev app domain � NOT the mobile-app domain.
     * Change this constant if the React app ever moves to a different domain.
     */
    const IMAGES_BASE_URL = 'https://civ-dev.codeonline-edi.net';

    function __construct()
    {
        parent::__construct();
        $this->load->model('api_fp/api_model_fp');
    }

    /**
     * Normalise a single image path to a full absolute URL.
     *
     * Rules:
     *  - Already absolute (http:// or https://)  ? returned as-is
     *  - Relative path starting with "/"          ? prepend IMAGES_BASE_URL
     *  - Anything else (empty, null, whitespace)  ? skip (returns null)
     *
     * @param  string $path  Raw value from the DB
     * @return string|null   Absolute URL or null if the path is unusable
     */
    private function _resolve_image_url($path)
    {
        if (empty($path) || trim($path) === '') {
            return null;
        }
        $path = trim($path);
        // Already absolute
        if (strpos($path, 'http://') === 0 || strpos($path, 'https://') === 0) {
            return $path;
        }
        // Relative path � prefix with the images host
        return self::IMAGES_BASE_URL . '/' . ltrim($path, '/');
    }

    /**
     * Explode the semicolon-separated images column and resolve every path.
     * Returns a plain array of absolute image URLs (empty values are dropped).
     *
     * @param  string|null $raw  Value of the `images` column
     * @return array
     */
    private function _parse_images($raw)
    {
        if ($raw === null || $raw === '') {
            return [];
        }
        $parts  = explode(';', $raw);
        $result = [];
        foreach ($parts as $part) {
            $url = $this->_resolve_image_url($part);
            if ($url !== null) {
                $result[] = $url;
            }
        }
        return $result;
    }

    // -----------------------------------------------------------------------
    // GET  fiche_produit_by_gtin
    // -----------------------------------------------------------------------
    public function fiche_produit_by_gtin_get()
    {
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'fr'; break;
            case 'en-US': $x_lang = 'en'; break;
            default:      $x_lang = 'fr';
        }

        $response = $this->api_model_fp->fiche_produit_gtin($this->get('gtin'));

        if (!empty($response)) {
            // *** FIX: resolve image paths to absolute URLs ***
            $response['images'] = $this->_parse_images(
                is_array($response['images']) ? implode(';', $response['images']) : $response['images']
            );

            $response['netContent']         = '';
            $response['unitCodeNetContent'] = '';
            if ($response['telephone'] == null) { $response['telephone'] = ''; }
            if ($response['email']     == null) { $response['email']     = ''; }
            if ($response['site']      == null) { $response['site']      = ''; }

            switch ($response['codeCader']) {
                case 'Libre':       $response['codeCaderAr'] = '??';    break;
                case 'Subventionne':$response['codeCaderAr'] = '????';  break;
                case 'Encadre':     $response['codeCaderAr'] = '????';  break;
                default:            $response['codeCaderAr'] = '';
            }

            $response['serveur']       = 'local';
            $response['libelleBrique'] = $response['libelleBrique_' . $x_lang];
            unset($response['libelleBrique_fr']);
            unset($response['libelleBrique_en']);

            $this->response($response, REST_Controller::HTTP_OK);
        } else {
            $hub = $this->registry_fp($this->get('gtin'));
            if (!empty($hub)) {
                $this->response($hub, REST_Controller::HTTP_OK);
            } else {
                $this->gs1_FP($this->get('gtin'));
            }
        }
    }

    // -----------------------------------------------------------------------
    // GS1 fallback lookup
    // -----------------------------------------------------------------------
    function auth()
    {
        $username = 'GS1_API_USERNAME_REDACTED';   // SECRET tiers GS1 France — à remettre depuis le serveur/.env au déploiement
        $password = 'GS1_API_PASSWORD_REDACTED';   // (ne pas committer en clair ; idéalement déplacer en .env)
        $clt = curl_init();
        curl_setopt($clt, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($clt, CURLOPT_URL, 'https://api.gs1.fr/auth/connect/token');
        curl_setopt($clt, CURLOPT_POST, true);
        curl_setopt($clt, CURLOPT_USERPWD, $username . ':' . $password);
        curl_setopt($clt, CURLOPT_POSTFIELDS, [
            'grant_type' => 'client_credentials',
            'scope'      => 'Products.Read'
        ]);
        $auth_response = curl_exec($clt);
        if ($auth_response === false) {
            curl_close($clt);
            $this->response('NULL', REST_Controller::HTTP_OK);
        }
        curl_close($clt);
        return json_decode($auth_response, true);
    }

    public function gs1_FP($gtin)
    {
        $token = $this->auth();
        $ch = curl_init('https://api.gs1.fr/products/' . $gtin . '?api-version=v2');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token['access_token'],
            'Ocp-Apim-Subscription-Key: 13295cd4d95d487fab03315fb1219e86'
        ]);
        $data = curl_exec($ch);
        curl_close($ch);

        if ($data === '"Invalid control key"') {
            $this->response(['message' => 'Invalid control key'], REST_Controller::HTTP_NOT_FOUND);
        } elseif ($data === '"Invalid GTIN format. Please enter a GTIN code of 8,12, 13 or 14 characters"') {
            $this->response(['message' => 'Format GTIN invalide. Veuillez saisir un code GTIN de 13 ou 14 caract�res'], REST_Controller::HTTP_NOT_FOUND);
        } else {
            $GFP = json_decode($data, true);
            $brand         = !empty($GFP['itemOffered']['brand']['brandName'][0]['value'])        ? $GFP['itemOffered']['brand']['brandName'][0]['value']        : '';
            $subBrand      = !empty($GFP['itemOffered']['brand']['subBrandName'])                 ? $GFP['itemOffered']['brand']['subBrandName']                 : '';
            $productName   = !empty($GFP['itemOffered']['productDescription'][0]['value'])        ? $GFP['itemOffered']['productDescription'][0]['value']        : '';
            $shortName     = $productName;
            $gtin_val      = !empty($GFP['itemOffered']['gtin'])                                  ? $GFP['itemOffered']['gtin']                                  : '';
            $libelleBrique = !empty($GFP['itemOffered']['gpcDescription'])                        ? $GFP['itemOffered']['gpcDescription']                        : '';
            $netContent    = !empty($GFP['itemOffered']['netContent'][0]['quantity'])             ? $GFP['itemOffered']['netContent'][0]['quantity']             : '';
            $unitCode      = !empty($GFP['itemOffered']['netContent'][0]['unitCode'])             ? $GFP['itemOffered']['netContent'][0]['unitCode']             : '';
            $companyName   = !empty($GFP['itemOffered']['brandOwner']['companyName'])             ? $GFP['itemOffered']['brandOwner']['companyName']             : '';
            $gln           = !empty($GFP['itemOffered']['brandOwner']['globalLocationNumber'])    ? $GFP['itemOffered']['brandOwner']['globalLocationNumber']    : '';

            $this->response([
                'images'              => [],   // GS1 images are external � no path to rewrite
                'brand'               => $brand,
                'subBrand'            => $subBrand,
                'productName'         => $productName,
                'shortName'           => $shortName,
                'gtin'                => $gtin_val,
                'countryOfOrigin'     => '',
                'libelleBrique'       => $libelleBrique,
                'prixMin'             => '',
                'prixMax'             => '',
                'codeCader'           => '',
                'netContent'          => $netContent,
                'unitCodeNetContent'  => $unitCode,
                'companyName'         => $companyName,
                'gln'                 => $gln,
                'adresse'             => '',
                'telephone'           => '',
                'email'               => '',
                'site'                => '',
                'codeCaderAr'         => '',
                'serveur'             => 'gs1Organization'
            ], REST_Controller::HTTP_OK);
        }
    }

    // -----------------------------------------------------------------------
    // registry_fp — proxys minces vers le Hub PAESN (fallback cross-pays)
    // -----------------------------------------------------------------------
    private function registry_fp($gtin)
    {
        return $this->registry_call('/api/registry/fp?gtin=' . urlencode($gtin));
    }
    private function registry_fp_brand_categories($brand)
    {
        return $this->registry_call('/api/registry/fp/brand-categories?brand=' . urlencode($brand));
    }
    private function registry_fp_products($brand, $categoryCode, $page)
    {
        return $this->registry_call('/api/registry/fp/products?brand=' . urlencode($brand)
            . '&categoryCode=' . urlencode($categoryCode) . '&page=' . urlencode($page));
    }
    private function registry_call($path)
    {
        // URL + clé du Hub PAESN selon l'environnement (CI_ENV).
        if (ENVIRONMENT === 'production') {
            $hub_url = 'https://hub.codeonline-edi.net';            // TODO: Hub PROD Hetzner (à renseigner)
            $hub_key = 'REG-PROD-A-DEFINIR';                        // TODO: REGISTRY_API_KEY PROD
        } else {
            $hub_url = 'http://217.182.94.86:5010';                 // Hub DEV
            $hub_key = 'REG-EDI-2026-9b9909f7d244d103ef4d09cb';     // clé DEV
        }
        $xlang   = $this->input->get_request_header('x-lang');
        $ch = curl_init($hub_url . $path);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 4,
            CURLOPT_HTTPHEADER     => array('x-registry-key: ' . $hub_key, 'x-lang: ' . $xlang),
        ));
        $out  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($out === false || $code != 200) { return null; }
        return json_decode($out, true);
    }

    // -----------------------------------------------------------------------
    // GET  fiche_produit  (full list)
    // -----------------------------------------------------------------------
    public function fiche_produit_get()
    {
        $response = $this->api_model_fp->fiche_produit();
        $this->response($response, REST_Controller::HTTP_OK);
    }

    // -----------------------------------------------------------------------
    // GET  sponsors
    // -----------------------------------------------------------------------
    public function sponsors_get()
    {
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'FR'; break;
            case 'en-US': $x_lang = 'EN'; break;
            default:      $x_lang = 'EN';
        }

        $sponsors = $this->api_model_fp->all_sponsors();
        if (!empty($sponsors)) {
            if (count($sponsors) == 1) {
                $tablesponsors = [$sponsors[0]['url']];
            } else {
                $stable = '';
                foreach ($sponsors as $row) {
                    $stable .= $row['url'] . ';';
                }
                $stable        = rtrim($stable, ';');
                $tablesponsors = explode(';', $stable);
            }

            $titres_menu = $this->api_model_fp->get_titres_menu();
            $tablesmenu  = [
                (object) ['index' => 0, 'ar' => $titres_menu['Text_menu1_ar'], 'fr' => $titres_menu['Text_menu1_fr'], 'en' => $titres_menu['Text_menu1_en']],
                (object) ['index' => 1, 'ar' => $titres_menu['Text_menu2_ar'], 'fr' => $titres_menu['Text_menu2_fr'], 'en' => $titres_menu['Text_menu2_en']],
                (object) ['index' => 2, 'ar' => $titres_menu['Text_menu3_ar'], 'fr' => $titres_menu['Text_menu3_fr'], 'en' => $titres_menu['Text_menu3_en']],
            ];
            $url      = 'https://fp.codeonline-info.com/assets/pdf/helpDocument_' . $x_lang . '.pdf';
            $response = (object) ['menuPrincipal' => $tablesmenu, 'sponsors' => $tablesponsors, 'helpDocument' => $url];
            $this->response($response, REST_Controller::HTTP_OK);
        } else {
            $url      = 'https://fp.codeonline-info.com/assets/pdf/helpDocument_' . $x_lang . '.pdf';
            $response = (object) ['sponsors' => [], 'helpDocument' => $url];
            $this->response($response, REST_Controller::HTTP_NOT_FOUND);
        }
    }

    // -----------------------------------------------------------------------
    // GET  notifs
    // -----------------------------------------------------------------------
    public function notifs_get()
    {
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'fr'; break;
            case 'en-US': $x_lang = 'en'; break;
            default:      $x_lang = 'fr';
        }

        $Notiftable = [];
        $i          = 0;
        $notifs     = $this->api_model_fp->all_notif_active();
        foreach ($notifs as $notif) {
            $Notiftable[$i] = (object) [
                'idNotif'      => $notif['idNotif'],
                'titreNotif'   => $notif['titre_notif_' . $x_lang],
                'textNotif'    => $notif['texte_notif_' . $x_lang],
                'titreNotifAr' => $notif['titre_notif_ar'],
                'textNotifAr'  => $notif['texte_notif_ar']
            ];
            $i++;
        }

        if (!empty($notifs)) {
            $this->response($Notiftable, REST_Controller::HTTP_OK);
        } else {
            $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
        }
    }

    // -----------------------------------------------------------------------
    // GET  fiche_produit_marque_categorie_by_brand
    // -----------------------------------------------------------------------
    public function fiche_produit_marque_categorie_by_brand_get()
    {
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'fr'; break;
            case 'en-US': $x_lang = 'en'; break;
            default:      $x_lang = 'fr';
        }

        $brands = $this->api_model_fp->fiche_produit_name_brand($this->get('brand'));
        if (!empty($brands)) {
            if (count($brands) == 1) {
                $categories = $this->api_model_fp->marque_categorie_by_brand($this->get('brand'));
                if (count($categories) == 1) {
                    $response[0] = [
                        'brand'      => $brands[0]['nameBrand'],
                        'categories' => [(object) [
                            'name'    => $categories[0]['libelleBrique_' . $x_lang],
                            'name_ar' => $categories[0]['libelleBrique_ar'],
                            'code'    => $categories[0]['codeBrique']
                        ]]
                    ];
                } else {
                    $ctable = [];
                    $j      = 0;
                    foreach ($categories as $categorie) {
                        $ctable[$j] = (object) [
                            'name'    => $categorie['libelleBrique_' . $x_lang],
                            'name_ar' => $categories[0]['libelleBrique_ar'],
                            'code'    => $categorie['codeBrique']
                        ];
                        $j++;
                    }
                    $response[0] = ['brand' => $brands[0]['nameBrand'], 'categories' => $ctable];
                }
            } else {
                $brandtable = [];
                $i = 0;
                foreach ($brands as $brand) {
                    $categories = $this->api_model_fp->marque_categorie_by_brand_ext($brand['nameBrand']);
                    $ctable     = [];
                    $j          = 0;
                    if (count($categories) == 1) {
                        $brandtable[$i] = (object) [
                            'brand'      => $brand['nameBrand'],
                            'categories' => [(object) [
                                'name'    => $categories[0]['libelleBrique_' . $x_lang],
                                'name_ar' => $categories[0]['libelleBrique_ar'],
                                'code'    => $categories[0]['codeBrique']
                            ]]
                        ];
                    } else {
                        foreach ($categories as $categorie) {
                            $ctable[$j] = (object) [
                                'name'    => $categorie['libelleBrique_' . $x_lang],
                                'name_ar' => $categories[0]['libelleBrique_ar'],
                                'code'    => $categorie['codeBrique']
                            ];
                            $j++;
                        }
                        $brandtable[$i] = (object) ['brand' => $brand['nameBrand'], 'categories' => $ctable];
                    }
                    $i++;
                }
                $response = $brandtable;
            }
        } else {
            $hub = $this->registry_fp_brand_categories($this->get('brand'));
            if (!empty($hub)) {
                $this->response($hub, REST_Controller::HTTP_OK);
                return;
            }
            $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
            return;
        }

        $this->response($response, REST_Controller::HTTP_OK);
    }

    // -----------------------------------------------------------------------
    // GET  fiche_produit_by_brand_category
    // -----------------------------------------------------------------------
    public function fiche_produit_by_brand_category_get()
    {
        $brand        = $this->get('brand');
        $categoryCode = $this->get('categoryCode');
        $page         = $this->get('page');
        $pageSize     = 40;

        $total_fiche_produit = $this->api_model_fp->count_total_fiche_produit_categoryCode_brand($brand, $categoryCode);
        $total               = intval($total_fiche_produit['totalFP']);

        if ($total == 0) {
            $hub = $this->registry_fp_products($brand, $categoryCode, $page);
            if (!empty($hub) && !empty($hub['items'])) { $this->response($hub, REST_Controller::HTTP_OK); return; }
        }

        if ($total <= $pageSize) {
            $FPs = $this->api_model_fp->fiche_produit_categoryCode_brand_sans_limit($brand, $categoryCode);
        } else {
            $start = ($pageSize * $page) - $pageSize;
            $FPs   = $this->api_model_fp->fiche_produit_categoryCode_brand_with_limit($brand, $categoryCode, $start, $pageSize);
        }

        if (!empty($FPs)) {
            // *** FIX: resolve image paths for every product ***
            for ($k = 0; $k < count($FPs); $k++) {
                $FPs[$k]['images'] = $this->_parse_images(
                    is_array($FPs[$k]['images']) ? implode(';', $FPs[$k]['images']) : $FPs[$k]['images']
                );
            }
            $webtable = (object) ['items' => $FPs, 'total' => $total, 'pageSize' => $pageSize];
        } else {
            $webtable = (object) ['items' => [], 'total' => 0, 'pageSize' => $pageSize];
        }

        $this->response($webtable, REST_Controller::HTTP_OK);
    }

    // -----------------------------------------------------------------------
    // GET  fiche_produit_by_cader
    // -----------------------------------------------------------------------
    public function fiche_produit_by_cader_get()
    {
        $cader = $this->get('cader');
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'fr'; break;
            case 'en-US': $x_lang = 'en'; break;
            default:      $x_lang = 'fr';
        }

        if ($cader != 'Encadre') {
            $segments = $this->api_model_fp->fiche_produit_segment_cader($cader);
        } else {
            $segments = $this->api_model_fp->fiche_produit_segment_art('99000000');
        }

        if (!empty($segments)) {
            $cadertable = [];
            $btable     = [];
            $i          = 0;
            $j          = 0;

            foreach ($segments as $segment) {
                $stable = (object) [
                    'name_fr' => $segment['libelleSegment_' . $x_lang],
                    'name_ar' => $segment['libelleSegment_ar'],
                    'code'    => $segment['codeSegment']
                ];

                if ($cader != 'Encadre') {
                    $categories = $this->api_model_fp->fiche_produit_segment_categorie_cader($cader, $segment['codeSegment']);
                } else {
                    $categories = $this->api_model_fp->fiche_produit_segment_categorie_art('99000000');
                }

                foreach ($categories as $categorie) {
                    if ($cader != 'Encadre') {
                        $FPs = $this->api_model_fp->fiche_produit_by_categorie_cader($cader, $categorie['codeBrique']);
                    } else {
                        $FPs = $this->api_model_fp->fiche_produit_by_categorie_art($categorie['codeBrique']);
                    }

                    // *** FIX: resolve image paths ***
                    for ($k = 0; $k < count($FPs); $k++) {
                        $FPs[$k]['images'] = $this->_parse_images(
                            is_array($FPs[$k]['images']) ? implode(';', $FPs[$k]['images']) : $FPs[$k]['images']
                        );
                    }

                    $btable[$i] = (object) [
                        'name_fr' => $categorie['libelleBrique_' . $x_lang],
                        'name_ar' => $categorie['libelleBrique_ar'],
                        'code'    => $categorie['codeBrique'],
                        'FPs'     => $FPs
                    ];
                    $i++;
                }

                $cadertable[$j] = (object) ['segment' => $stable, 'categories' => $btable];
                $btable         = [];
                $i              = 0;
                $j++;
            }
        } else {
            $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
            return;
        }

        $this->response($cadertable, REST_Controller::HTTP_OK);
    }

    // -----------------------------------------------------------------------
    // GET  fiche_service_by_id
    // -----------------------------------------------------------------------
    public function fiche_service_by_id_get()
    {
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'fr'; break;
            case 'en-US': $x_lang = 'en'; break;
            default:      $x_lang = 'fr';
        }

        $response = $this->api_model_fp->fiche_service_id($this->get('idService'));
        if (!empty($response)) {
            // *** FIX: resolve image paths ***
            $response['images'] = $this->_parse_images(
                is_array($response['images']) ? implode(';', $response['images']) : $response['images']
            );

            if ($response['telephone'] == null) { $response['telephone'] = ''; }
            if ($response['email']     == null) { $response['email']     = ''; }
            if ($response['site']      == null) { $response['site']      = ''; }

            $response['serveur']       = 'local';
            $response['libelleBrique'] = $response['libelleBrique_' . $x_lang];
            unset($response['libelleBrique_fr']);
            unset($response['libelleBrique_en']);

            $response['titreService'] = $response['titreService_' . $x_lang];
            unset($response['titreService_fr']);
            unset($response['titreService_en']);

            $response['texteService'] = $response['texteService_' . $x_lang];
            unset($response['texteService_fr']);
            unset($response['texteService_en']);

            $this->response($response, REST_Controller::HTTP_OK);
        } else {
            $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
        }
    }

    // -----------------------------------------------------------------------
    // GET  fiche_services_by_categories
    // -----------------------------------------------------------------------
    public function fiche_services_by_categories_get()
    {
        $xlang = $this->input->get_request_header('x-lang');
        switch ($xlang) {
            case 'fr-FR': $x_lang = 'fr'; break;
            case 'en-US': $x_lang = 'en'; break;
            default:      $x_lang = 'fr';
        }

        $segment = $this->api_model_fp->get_segment_service('120000000');
        if (!empty($segment)) {
            $servicetable = [];
            $i            = 0;
            $j            = 0;
            $btable       = [];

            $stable = (object) [
                'libelleSegment'    => $segment['libelleSegment_' . $x_lang],
                'libelleSegment_ar' => $segment['libelleSegment_ar'],
                'codeSegment'       => $segment['codeSegment']
            ];

            $categories = $this->api_model_fp->fiche_service_segment_categorie_service('120000000');
            if (!empty($categories)) {
                foreach ($categories as $categorie) {
                    $FPs = $this->api_model_fp->fiche_service_by_brique($categorie['codeBrique']);

                    // *** FIX: resolve image paths ***
                    for ($k = 0; $k < count($FPs); $k++) {
                        $FPs[$k]['images'] = $this->_parse_images(
                            is_array($FPs[$k]['images']) ? implode(';', $FPs[$k]['images']) : $FPs[$k]['images']
                        );
                        $FPs[$k]['titreService'] = $FPs[$k]['titreService_' . $x_lang];
                        unset($FPs[$k]['titreService_fr']);
                        unset($FPs[$k]['titreService_en']);
                    }

                    $btable[$i] = (object) [
                        'libelleBrique'    => $categorie['libelleBrique_' . $x_lang],
                        'libelleBrique_ar' => $categorie['libelleBrique_ar'],
                        'codeBrique'       => $categorie['codeBrique'],
                        'FPs'              => $FPs
                    ];
                    $i++;
                }
                $servicetable[$j] = (object) ['segment' => $stable, 'categories' => $btable];
            } else {
                $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
                return;
            }
        } else {
            $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
            return;
        }

        $this->response($servicetable, REST_Controller::HTTP_OK);
    }
}