<?php
ini_set("display_errors", 0);
error_reporting(E_ERROR | E_PARSE | E_ALL);
set_time_limit(120);
include("/var/www/www_magazooms/database_mysqli.php");
include ("/var/www/www_magazooms/sanitizeCHR.php");
include ("/var/www/www_magazooms/php/checkUserAgent.php");
include("/var/www/www_magazooms/twilio/sendSMS.php");

$isMobile = check_user_agent('mobile');
$timestamp = date('ymdis');
$agent = $_SERVER['HTTP_USER_AGENT'];

$win10  = (preg_match("/Windows NT 10.0/",$agent));
$chrome = (preg_match("/Chrome/",$agent));

if($win10 && $chrome){
	
	$jsScript = "<script language=javascript>";
	$warn[] = 'WINDOWS 10  / CHROME WEB BROWSER';
	$warn[] ='-----------BUG WARNING------------';
	$warn[] = '';
	$warn[] = 'Chrome may disable all mouse clicks on the screen due to a bug in the Chrome application.';
	$warn[] = '';
	$warn[] = 'If you encounter this problem please visit the URL below to learn how you can resolve this problem';
	$warn[] = '';
	$warn[] = 'http://ccm.net/faq/40811-google-chrome-how-to-disable-touch-input';

	
	$warn = implode('\r\n',$warn);
	
	$jsScript .="  alert('".$warn."')";
	$jsScript .="</script>";
	echo $jsScript;	
}



$agent = explode("(", $agent);
$agent = explode(")", $agent[1]);
$domain = $_SERVER['SERVER_NAME'];
$uri = $_SERVER['REQUEST_URI'];
$pageNum = $_GET['pageNum'];

$arg = preg_split('/\//', $uri);

$search = $_GET['search'];
$searchTxt = $_GET['search'];


if(count($arg)>3){
	//echo strpos(trim($arg[3]), "search");
	//exit; 
	
	if(strpos(trim($arg[3]), "search")==0){
		$search = explode("=", trim($arg[3]));
		$searchTxt = $search[1];
		//echo $search;
	}else{
		$top =  trim($arg[3]);
		$select = "select pageSeq from toc ";
		$select .= " left join magazooms on (magazooms.recordID = toc.mzID) ";
		$select .= " where toc.seo_topic like'%".$top."%' and magazooms.seo_title = '".$arg[2]."' ";
		$res = mysqli_query($db,$select);
		$row = mysqli_fetch_row($res);
		$p = $row[0];
		$pageNum = $p;
	}
	
}

$thisURL = $domain.$ruri;

$agentProps = explode(";", $agent[0]);
$device = ($_GET['device']) ? 1 : strtoLower($agentProps[0]) ;

$android = explode("(", $_SERVER['HTTP_USER_AGENT']);
$android = explode(";", $android[1]);
$redirectScript = '';

$appleDevice = strcmp(strtoLower($device),"ipad") == 0 || strcmp(strtoLower($device),"iphone") == 0 ;
$action = "loading";
$actionValue = (isset($ref)) ? "emailed" : "direct";
$urlRefer = $HTTP_REFERER;
$ID = ($_GET['mzID']) ?  $_GET['mzID'] : "130220090318" ;

$dbrs = $_GET['drs'];


$viewMode = isset($_GET['vm']) ? $_GET['vm'] : 0;
$auto = isset($_GET['auto']) ? $_GET['auto'] : 0;
$useremail = $_GET['u'] . $_POST['u'] ;
$mz=  $_GET['m'];

$user = $_GET['u'] . $_POST['u'];
$pwd = $_GET['p'] . $_POST['p'];
$opener = $_GET['o'];
$psource = $_GET['s'];
$logging = $_GET['l'];
$spread = (isset($_GET['spread'])) ? $_GET['spread'] : 2;

$updateSettingsJS = ($user=='admin') ?"<script type=\"text/javascript\" src=\"js/updateSettings.js\"></script>" : "";

$whereCondition = " magazooms.recordID ='".$ID."' and magazooms.seo_title is not null ";

if(isset($mz)&& $mz!=''){
	//$mz= preg_replace("/[_|-]/"," ",$m);		
	$whereCondition = " magazooms.seo_title = '".$mz."'  order by releasedate DESC limit 1";
	//$whereCondition = " magazooms.meta_title = '".$m."'";
}


$select = "select `meta_title`, `meta_description`, `meta_keywords` , magazooms.clientID , magazooms.recordID, magazooms.paid ,accounts.status, magazooms.pubID,";
$select .= " accounts.googleUA ,accounts.company,accounts.colorA ,accounts.colorB,accounts.backgroundStyle, accounts.toolbar3D,accounts.subdomain,magazines.title";
$select .= " ,magazooms.seo_title,accounts.short_name from magazooms left join accounts on (magazooms.clientID=accounts.recordID) left join magazines on (magazooms.pubID=magazines.recordID) WHERE ";
$select .= $whereCondition;


$mzResult = mysqli_query($db,$select);

$res = $mzResult;

$missing = "<!DOCTYPE html><head><base href='http://www.magazooms.com/HTML5/' ><title>Missing Publication</title>";
$missing .= "<meta charset='UTF-8'><meta http-equiv = 'Content-Type' content = 'text/html; charset=utf-8' >";
$missing .=" <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>";
$missing .=" </head>";
$missing .=" <body style='font-family:Verdana;margin:20%;text-align:center;background-color: rgb(64, 62, 61);color:white;font-size:18px;font-weight:bold;'/>";
$missing .="Sorry, the publication requested was not found.<br><br>Please check your URL.";
$missing .= "<br><span style='font-weight:normal;font-size:10px;'>".$_SERVER['SERVER_NAME'].$_SERVER['REQUEST_URI']."</span>";
$missing .="</body></html>";


if(mysqli_num_rows($mzResult)<1){


	$whereCondition = " magazooms.seo_title like '%".$mz."%'";
	
	$select = "select `meta_title`, `meta_description`,`meta_keywords`,magazooms.clientID ,magazooms.recordID,magazooms.paid ,accounts.status, magazooms.pubID, ";
	$select .= "accounts.googleUA ,accounts.company,accounts.colorA ,accounts.colorB,accounts.backgroundStyle,"; 
	$select .= "accounts.toolbar3D,accounts.subdomain,magazines.title,magazooms.seo_title,accounts.short_name from magazooms left join accounts on (magazooms.clientID=accounts.recordID)";
	$select .= "  left join magazines on (magazooms.pubID=magazines.recordID)  WHERE ".$whereCondition;
	$select .= " order by releasedate DESC limit 1";
	
	
	
	$res = mysqli_query($db,$select);
	
	if(mysqli_num_rows($res)< 1){
		echo $missing;
		exit;
	}
	
}


//exit;

while ($row = mysqli_fetch_row($res)) {
	$meta_description = $row[1];
	$meta_keywords = mysqli_real_escape_string($db,$row[2]);
	$accountID = $row[3];
	$ID = $row[4];
	$paid = $row[5];
	$accountStatus = $row[6];
	$googleUA = !isset($pubID) ? $row[8] : $row[7];
	$company = !isset($pubID) ? $row[9] : $row[8];
	
	$colorA = !isset($pubID) ? $row[10] : $row[9];
	$colorB = !isset($pubID) ? $row[11] : $row[10];
	$backgroundStyle = !isset($pubID) ? $row[12] : $row[11];
	$toolbar3D = !isset($pubID) ? $row[13] : $row[12];
	$subdomain = !isset($pubID) ? $row[14] : $row[13];
	$pubTitle = !isset($pubID) ? $row[15] : $row[14];
	$seoTitle = !isset($pubID) ? $row[16] : $row[15];
	$shortName = !isset($pubID) ? $row[17] : $row[16];

	$shortName = preg_replace('/[\,|\'|\.]/',"",$shortName);
	$shortNameStr = preg_replace('/\s/', "-", $shortName);
	
	$pubID = !isset($pubID) ? $row[7] : $pubID;
	$meta_title = $row[0];
	$companyStr = preg_replace('/[\,|\'|\.]/',"",$company);
	$companyStr = preg_replace('/\s/', "-", $companyStr);
	$pubTitle = preg_replace('/ and /', " ", $pubTitle);
	$pubTitle = preg_replace('/\s/', "-", $pubTitle);
	

	if (is_file('/var/www/www_magazooms/appIcons/'.$companyStr.'.png')) {
		$appIcon = $companyStr.".png";
	} else {
		$appIcon = "mzooms.png";
	}
	
	
}

//$subdomain = ((!isset($subdomain) || $subdomain =='' ) || $_SERVER['SERVER_NAME']=="www.magazooms.com") ?  "http://www.magazooms.com" : "http://".$subdomain ;

$ipadImage = "http://".$domain."/images/iPad/".$shortNameStr."-".$pubTitle.".png";

if(stripos(strtoLower($device),"iphone")!==false ){
	
	$appResult = mysqli_query($db,$appQuery);
	
	$appRecord = mysqli_fetch_row($appResult);
	$appName = ($appRecord[0]!='') ? $appRecord[0] : "/HTML5HD/$mz";
	
	$redirectScript = "<script language=javascript>";
	$redirectScript .="  setTimeout(\"location.href=\'".$appName."\'\",10)";
	$redirectScript .="</script>";	
	//echo $redirectScript;
	//exit;
}


if(stripos($android[2],"android")!==false){
	//echo $android[2];
	//echo "Android";
	$isMobile = 1;
	$newURL = "/publish/".$accountID."/".$pubID."/packages/".$ID."/package/pdf/".$ID.".pdf";	
	$redirectScript = "<script language=javascript>";
	$redirectScript .="  setTimeout(\"location.href='".$newURL."\'\",10)";
	$redirectScript .="</script>";	
	//echo $redirectScript;
	//exit;
}

if($device=="ipad"){
	
	$isMobile = 1;
	$ipadURL = $domain.'/HTML5HD/'.$seoTitle;
	
	$args = explode("?",$uri);
	
	$deskTopURL = $domain. (count($args)>1) ? $args[0]."?device=none&".$args[1] : $uri."?device=none";

	$msgTxt ="Use the iPad version <br>";
	$msgTxt .="<a href='http://".$ipadURL."'> <img src='$ipadImage' style='margin:10px;width:90px;border-radius:6px;'></a><br> or <a href=$deskTopURL> standard desktop version?</a>";
			
	$msg = "<!DOCTYPE html><head><base href='../../HTML5/' ><title>Select Version</title>";
	$msg .= "<meta charset='UTF-8'><meta http-equiv = 'Content-Type' content = 'text/html; charset=utf-8' >";
	$msg .=" <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>";
	$msg .="<style> a{color:white;decoration:none;}</style>";
	$msg .=" </head>";
	$msg .=" <body style='font-family:Verdana;margin:20%;text-align:center;background-color: rgb(64, 62, 61);color:white;font-size:12px;font-weight:bold;'/>";
	$msg .= $msgTxt;
	$msg .="</body></html>";
	
	echo $msg;
	exit;

	
}

if($opener==''){
	$selectOpener = "select opener,openerURL from magazines where recordID = '".$pubID."'";
	$resOpener = mysqli_query($db,$selectOpener);
	$rowOpener = mysqli_fetch_row($resOpener);
	$opener = (is_File("/var/www/www_magazooms/opener/".$rowOpener[0])) ? $rowOpener[0] : "";
	$openerURL = (isset($rowOpener[1]))? str_replace("https", "http", $rowOpener[1])."?t=".date('His', time()): "";

}


//(isset($backgroundStyle)){
	$acctStyles = "var acctBackgroundStyle = \"".$backgroundStyle."\"\r\n";
//}
//if(isset($toolbar3D)){
	$acctStyles .= "var acctToolbar3D = \"".$toolbar3D."\"\r\n";


$glowcolor = ($colorB) ? $colorB : "#00c2fd";

$glow = "@-webkit-keyframes myglow {0% {opacity:.1;background: $glowcolor;}50%   {-webkit-transform: scale(1.5); opacity:.8;}100% {-webkit-transform: scale(1);background: transparent;}}";
$glow .= "@keyframes mymglow {0%  {opacity:.1;filter: alpha(opacity=10);background: $glowcolor;}50% { transform: scale(1.5);opacity:.8;}100% {transform: scale(1); background: transparent;}}";
$glow .= "@-moz-keyframes myglow {0%{-moz-opacity:.1;filter: alpha(opacity=10);background: $glowcolor;}50% {-moz-transform: scale(1.5); opacity:.8;}100% {-moz-transform: scale(1);background: transparent;}}";

$glow .="\r\r.clear:hover, .clearShadow:hover,.call:hover, .customLink-1:hover, .pageLink:hover, .webLink:hover, webLink1:hover{opacity:0.5;filter: alpha(opacity=50);background: $glowcolor; -webkit-transform: scale(1.5); transform:scale(1.5);-moz-transform:scale(1.5);}\r";


$glow .= ".round:hover{border:4px ".$glowcolor." solid;opacity:0.5;filter: alpha(opacity=50);}\r";

$googleUAarr = array();

array_push($googleUAarr, 'UA-4616221-1');

$GAarr = (isset($googleUA) && $googleUA!='') ? explode(",",$googleUA) : '';

foreach($GAarr as $a){
	array_push($googleUAarr, $a);
}


$meta_keywords = strHygiene($meta_keywords);

preg_match('<keywords>' , $meta_keywords,$matches);

if(count($matches)==1){
	$keywords  = str_replace("<keywords>","",$meta_keywords);
	$keywords  = str_replace("</keywords>","",$keywords );
	$meta_keywords = $keywords;
}

$cover = $domain."/publish/".$accountID."/".$pubID."/packages/".$ID."/package/thumbs/".$ID."_1.gif";
$microLogo = (is_file("/var/www/www_magazooms/microLogos/".$accountID.".png")) ? "http://www.magazooms.com/microLogos/".$accountID.".png" : "";
$splash = (is_file("/var/www/www_magazooms/splash/".$accountID.".png")) ? "http://www.magazooms.com/splash/".$accountID.".png" : "";



$thisURL = $_SERVER['REQUEST_URI'];


include('/var/www/www_magazooms/browser.php');

$br = new Browser;
$platform = $br -> Platform;
$browser = $br -> Name;
$version = $br -> Version;
$aol = $br -> AOL;
$ip = @$REMOTE_ADDR;
if ($ip == '') {
	$ip = $_SERVER['REMOTE_ADDR'];
}
$lang = substr($_SERVER['HTTP_ACCEPT_LANGUAGE'],0,5);
$lang = strtolower($lang);

// check to see if this is a test or prospect publication

if(in_array('UA-4616221-2', $googleUAarr)){
	
	$sms = $_SERVER['SERVER_NAME']."/".$mz." ".$lang;
	$sms .= " by ".$ip;

	//test to see if this is foriegn language user
	preg_match('/cs|de|es|fr/', $lang, $langmatches);
	if(count($langmatches)>0){
		sendSMS($sms);
	}
}

$os = trim($agentProps[1]);
$dateStamp = date('Y-m-d', time());
$timeStamp = date('His', time());
$thisURL = $domain.$thisURL;

if($browser=="MSIE" && $version < 9){
	$redirectScript = "<script language='javascript'>\n";
	//$redirectScript .="  setTimeout(\nfunction(){\n";
	$msgTxt = "Sorry, this HTML5 version is not compatible with Internet Explorer ".$version."<br>Update to IE 9 or try another browser such as FireFox, Chrome, or Safari";
	//$msg .="\\r\\r..or do you want to open the Flash Version now ?'";
	
	$msg = "<!DOCTYPE html><head><base href='http://www.magazooms.com/HTML5/' ><title>Missing Publication</title>";
	$msg .= "<meta charset='UTF-8'><meta http-equiv = 'Content-Type' content = 'text/html; charset=utf-8' >";
	$msg .=" <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>";
	$msg .=" </head>";
	$msg .=" <body style='font-family:Verdana;margin:20%;text-align:center;background-color:#202020;color:white;font-size:12px;font-weight:bold;'/>";
	$msg .= $msgTxt;
	$msg .="</body></html>";
	
	echo $msg;
	exit;
}	

$googleA_JS = "var _gaq = _gaq || [];\r\n";

foreach($googleUAarr as $GAA){
	$googleA_JS .= "_gaq.push(['_setAccount', '$GAA']);  _gaq.push(['_trackPageview']);\r\n";
}


$googleA_JS .=  "(function() {
    var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js'\r\n;
    /*ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/u/ga_debug.js';*/
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
  })();";



$metaTags = "<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>".chr(10);

if($appleDevice > 0){
	$metaTags .= '<meta name="apple-mobile-web-app-capable" content="yes">'.chr(10);
	$metaTags .= '<meta name="apple-mobile-web-app-status-bar-style" content="black">'.chr(10);
	$metaTags .= '<meta name = "apple-touch-fullscreen" content = "YES" >'.chr(10);
	$metaTags .= '<link rel="apple-touch-icon" href='.$domain.'/appIcons/'.$appIcon.' >'.chr(10);
}
else{
	$metaTags .="<link rel='shortcut icon' sizes='196x196' href=".$domain."/appIcons/".$appIcon." >".chr(10);
}

$colorB = (!$colorB) ? "#5b5b5b" : $colorB;
?>
<!DOCTYPE html>
<head>
<base href="../../HTML5b/" >
<title><?php echo $meta_title; ?></title>
<meta charset="UTF-8">
<meta http-equiv = "Content-Type" content = "text/html; charset=utf-8" >
<meta name="keywords" lang="en-us"  content="<?php echo $meta_keywords; ?>">
<?php echo $metaTags;?>

<meta http-equiv="X-UA-Compatible" content="IE=edge">

<meta property = "og:title" content = "<?php echo $meta_title; ?>" >
<meta property = "og:type" content = "article" >
<meta property = "og:url" content = "<?php echo $thisURL; ?>" >
<meta property = "og:image" content = "<?php echo $cover; ?>" >
<meta property = "og:site_name" content = "<?php echo $company; ?>">
<meta property = "fb:fb_app_id" content = "174546709227911" >
<meta property = "og:description" content = "<?php echo $meta_description; ?>" >



<link type="text/css" title="default" rel="stylesheet" href="css/scrollbar.css?ts=<?php echo  $timeStamp;?>">
<link type="text/css" id="textures" rel="stylesheet" href="../../CSS/textures.css?ts=<?php echo  $timeStamp;?>" >
<link type="text/css" id="textures" rel="stylesheet" href="../../CSS/customLinks.css?ts=<?php echo  $timeStamp;?>" >		
<link type="text/css" id="textures" rel="stylesheet" href="../../CSS/annotations.css?ts=<?php echo  $timeStamp;?>" >
<link type="text/css" id="textures" rel="stylesheet" href="../../CSS/icons.css?ts=<?php echo  $timeStamp;?>" >	
<link type="text/css" id="textures" rel="stylesheet" href="../../CSS/tag.css?ts=<?php echo  $timeStamp;?>" >
<link type="text/css" id="lang" rel="stylesheet" href="../../language/CSS/language.css?ts=<?php echo  $timeStamp;?>" >
<link type="text/css" title="default" rel="stylesheet" href="css/savePage.css?ts=<?php echo  $timeStamp;?>">
<link type="text/css" title="default" rel="stylesheet" href="css/myStyle.css?ts=<?php echo  $timeStamp;?>">

<style><?php echo $glow;?></style>

<script type="text/javascript" src="http://code.jquery.com/jquery-1.9.1.js"></script>
<!-- <script type="text/javascript" src="http://code.jquery.com/jquery-1.8.3.js" >  </script>  -->
<script type="text/javascript" src="../../JS/utilities.js" ></script>
<script type="text/javascript" src="../../language/language.js" ></script>
<script type="text/javascript" src="resources/debugEvents.js" ></script>

<?php echo $updateSettingsJS;?>
<script type="text/javascript" src="turn/extras/modernizr.2.5.3.min.js"></script>

<script type="text/javascript" src="http://code.jquery.com/ui/1.10.3/jquery-ui.js"></script>
<!-- <script src="http://ajax.googleapis.com/ajax/libs/jqueryui/1.8/jquery-ui.min.js" ></script> -->

<!-- <script src="http://code.jquery.com/jquery-migrate-1.2.1.js"></script> -->
<script type="text/javascript" src="../../JS/spinner.js" ></script>
<script type="text/javascript" src="js/search.js" ></script>
<script type="text/javascript" src="js/magazine.js" ></script>
<script type="text/javascript" src="js/autoturn.js" ></script>
<script type="text/javascript" src="js/download.js" ></script>
<script type="text/javascript" src="js/shopping.js" ></script>
<script type="text/javascript" src="js/tooltip.js" ></script>	 	 
<script type="text/javascript" src="js/database.js" ></script>
<script type="text/javascript" src="js/modifyURL.js" ></script>
<script type="text/javascript" src="js/alert.js" ></script>
<!-- <script type="text/javascript" src="../../JS/jQuery.colourPicker.js" ></script> -->

<script type="text/javascript" src="turn/lib/hash.js"></script>
<script type="text/javascript" src="js/jquery.localize.js"></script>

<script TYPE="text/javascript">
var config = {};
config.auto = "<?php echo $auto;?>";
config.lang  =  "<?php echo $lang;?>";
config.colorA  =  "<?php echo $colorA;?>";
config.colorB =  "<?php echo $colorB;?>";
config.opener = "<?php echo $opener;?>";
config.openerURL = "<?php echo $openerURL;?>";
config.openerHasShown = false;
config.isMobile = "<?php echo $isMobile;?>";
config.domain = "<?php echo $domain;?>";
config.useremail = "<?php echo $useremail;?>";

var version = "2.8";
var logging = "<?php echo $logging;?>";
var browser = "<?php echo $browser;?>";
var psource = "<?php echo $psource;?>";
var device = "<?php echo $device;?>";

var viewMode = "<?php echo $viewMode;?>";

var pageViews = 0;

var display = {};

var snd;
var spintarget;

var usr ="<?php echo $user; ?>";
var pwd ="<?php echo $pwd; ?>";

var databaseEnabled = false;
var touchEnabled = false;
var fullScreen = false;
var defaultClickEvent;

var UI = {};
var magazoom = {};
var tocData = {}
var thisBaseURL = $('base').prop('href')+"index.php?"
var appIcon = "http://"+config.domain+"/appIcons/<?php echo $appIcon;?>";

<?php echo $acctStyles;?>

var microLogo = "<?php echo $microLogo;?>"
var splash = "<?php echo $splash;?>"
var isLoaded = 0;
var isHiResolution = 0
var shoppingInformed = 0;
var popupInformed = 0;
var toolbarTopHeight = 34;
var toolbarBotHeight = 40;
var magazineHeight;
var magazineWidth;
var showToolBars = true;
var firstPageWithProduct = new Array();

var toolbar3D;
var isDragging;
var texturesCSS;
var textureOpt;
var colorOptions;// used for color selector
var thisInt;
var os = '<?php echo $os;?>';
var ssInsert
var showHideX = 0
var showHideY = 0
var paginationRowLimit=2;
var timeDelay = 8000;
var showTime = 6000;
var hideTime = 1000;
var today = new Date();

//spinner settings
var opts = {
  lines: 8, // The number of lines to draw
  length: 0, // The length of each line
  width: 8, // The line thickness
  radius: 10, // The radius of the inner circle
  corners: 1, // Corner roundness (0..1)
  rotate: 0, // The rotation offset
  color: '#FFF', // #rgb or #rrggbb
  speed: 1, // Rounds per second
  trail: 42, // Afterglow percentage
  shadow: true, // Whether to render a shadow
  hwaccel: false, // Whether to use hardware acceleration
  className: 'spinner', // The CSS class to assign to the spinner
  zIndex: 90000000000000000, // The z-index (defaults to 2000000000)
  top: 'auto', // Top position relative to parent in px
  left: 'auto' // Left position relative to parent in px
};
var spinner;
var loadingspinner
var tStamp;
var sessionID;


//database vars
var databaseResults = null;
var dbrs="<?php echo $dbrs; ?>"  // resets the database to clear any corruption or errors all data is lost.
var columnNames = new Array();


var pageDisplayWidth, pageDisplayHeight, winOrientation, dynamicPageWidth, dynamicPageHeight;
var buttonStyle=1;
var keywords = "<?php echo $keywords; ?>";
var keywordArr = new Array();
var fudgeAmt;
var fullPage;
var catalogTitle;
var pageAnimation;
var prevViewingPage;
var nextViewingPage;

var brandText;
var cartTD;
var pdfURL;

var orientationScale;
var pageTurnButRight;
var pageTurnButLeft;

var centerPointX;
var centerPointY;
var minScrollTo;
var minTopZoom;
var minLeftZoom
var pinchScale = 0
var isZoomed = false;
var fingerDistance=0;

config.orientationFormat;
var dynamicPDFClass;
// target DIVs


var productPopUpDiv;
var dynDiv;

var bubbleDiv;

var settingsDiv;
var contentDiv;
var pointerDiv;
//var meta_title = "<?php echo $meta_title;?>";
var tocPage;
var pdfObj;

var root = {}

var currentPageSrc;
var currentPage
var currentPopUp;
var pdfObjInnerHTML;
var swfObjHTML;
var pageIndex = 1;
var currentSpreadIndex = 0;
var fullScale;
var zoomScale;
var thumbnailScale;
var thumbnailSmallScale;
var thumbnailHeight;
var thumbnailWidth;
var thumbnailView;

// Shopping Cart Vars
//var shoppingCartURL;

var cartHTML;
var pagesHTML;
var pagination;
var pagefactor;
var pageHistory = new Array();
var pageHistoryIndex;
var spreadHistoryIndex;
var spreadHistory = new Array()


var bookmarksHTML;
var searchHistoryHTML;


/***** data list  *******/
var shoppingCartList = Array();
var pagesArr = Array();
var spreadAction = Array()
var spreadsShowing = 0;
var spreadsNumbering = Array();
var spreadsLabels = Array();
var videoPlaying = 0
var thumbnailsArr = Array();
var annotationsArr = Array();
var selectedAnnot = ''
var bookmarksList = Array();
var shoppingHistoryList = Array();

var cartTotal=0;
var lastPageIndex;
var lastGoToPageTime;
var pageNum = "<?php echo $pageNum;?>"

var mzID = "<?php echo $ID;?>" //Forestry Suppliers
 
var pageAR;

var mouseX, mouseY;
var product;
var productImages;
var productUnits;

var tocList;
var tocPages;

var youTubeHTML;
var youTubeQuery;
var youTubeWinProperties = Array();

var shoppingHistoryHTML
var mediaList = new Array();
var searchResults;
var searchTxt = '<?php echo $searchTxt;?>';
var shareLinks;
//XML Queries
//Magazoom
var u = "php/getMagazoomXML.php?mzID=" + mzID;
//Pages
var pu = "php/getPagesXML.php?mzID=" + mzID;
//Annotations
var au = "php/getAnnotationsXML.php?pageID=";
//TOC
var tu = "php/getTOCXML.php?mzID=" + mzID;
//get Words for search
var wu = "php/getWordsXML.php?mzID=" + mzID + "&pageID=";
//get Words for search in JSN format
var wuj = "php/getWordsJSN.php?pageID=";
//get Media
var mu = "php/getMediaXML.php?clientID=";
//checkout submittal URL
var checkoutURL = "php/orderXML.php"

var hideInterval; // timer
var mybubbleInterval; // timer
var annotationsInterval // timer
var showAddToHome // cookie for showing add to home popup

// variables used for gesture functions
var currentTop = 0;
var newTopPos = 0;
var currentLeft = 0;
var pageMarginLeft;
var currentWidth;
var currentHeight;
var currentScale;
var newScale;
var fadeImg;

var touchPointY = null;
var touchPointX = null;
var startTouchX;
var startTouchY;
var zoomPageWOffset;
var zoomPageHOffset;
var deltaY = 0;
var deltaX = 0;

var lastTouch = (new Date()).getTime();
var targetScale = 1;
var targetLeft = 0;

var startPoint;
var endPoint;
var startTime;

var bookmarkCount;
var videoCount;

var lc_theTime = new Date().getTime();

<?php echo $googleA_JS ;?>

$(window).resize(function() {
  getDimensions()
  setupSpreads(1);
});

$(document).ready(function(){
		
});



function trace(args) {
	logging = 1
	traceLog(args,logging)			
}

function init() {

	
	$('.helpIcon').hide();
	
	$('.languagesDiv').css({
		top:'40px',
		width:'30px',
		left:'10px',
		zIndex:1000,
		'border-radius':'5px',
		'-webkit-border-radius':'5px',
		'-moz-border-radius':'5px',
		display:'none'
	})
	
	$('#windowDiv').css({backgroundColor:config.colorB})
	$('.progressBarColor').css({backgroundColor:config.colorB})
	$('body').css({backgroundColor:config.colorB})
	$('#toolTipDiv').css({backgroundColor:config.colorB})

	$( "#cartDiv" ).draggable()
	$( "#windowDiv" ).droppable({
		 	drop: function() {
			 	shopping.cartLeft = $("#cartDiv" ).position().left
			 	shopping.cartTop = $("#cartDiv" ).position().top
			 }
    });

	getLanguage()
								
	if(device == 'iphone'){
		setTimeout(function(){
		// Hide the address bar!
		window.scrollTo(0, 1);
		}, 1000);
		
	}
	
	$('.shareSMS').hide()
	
	if(config.isMobile){
		$('.shareSMS').show()
	}
	
	display.openedFromHomeScreen = navigator.standalone;
	
	touchEnabled = ('ontouchstart' in window);
	
	trace("touch:"+touchEnabled)
	
	if(!touchEnabled){
		$(document).tooltip({tooltipClass: "tooltip" })
		$(document).on('click', '.saveIcon', setPDFDownload);
		$(document).on('click', '.navTab', function(){ showMenu()});
		$(document).on('mouseover', '.navTab', function(){ showMenu(1)});
	}else{
		$(document).on('touchstart', '.saveIcon', setPDFDownload);
		$(document).on('touchstart', '.navTab', function(){ 
			showMenu(1)
			});
	}
			        
	defaultClickEvent = (touchEnabled) ? "tap" : "click";
	
	if(browser=="Firefox"){
		snd = new Audio("resources/button-46.wav");
	}else{
		snd = new Audio("resources/button-46.mp3");
	}
	
	//trace("snd:"+snd)
	
	//snd.play();
	
	if(os.length>3){
		//alert(os)
		if(os.toString().indexOf("OS")>-1){
			os = os.toString().split(' ')
			os = os[2].replace("_",".");
		}
		//trace(os)
	}
	
/*
	$('#searchInput').blur(function(){
		trace("blur search")
		if($('#searchInput').val()!=''){
			searchNow()
		}
	})
*/
	

	$('#searchInput').focus(function() {
	 	$(this).val("")
	  })
	.blur(function() {
	    if (this.value != UI['Search']) {
	        $(this).val(this.value);
	        searchNow()
	    }
	})
		
	isLoaded = 0;
	
	lastGoToPageTime = (new Date).getTime();
	
	getDimensions();
							
	getMagazoom()
				
}

function logEvent(cat,action,label,val,interact){

	if(cat =='page view'){
		pageViews++
		var pv = Boolean(pageViews > (magazoom['pageViewLimit']-0))
		
		if(pv && magazoom['pageViewLimit']>0 && magazoom['registration_required']>0 && ! settingsModel['userauthorized']){
			showHideLogin(1);
			$('.auth').fadeOut(1000);
			return;
		}
		
	}
	
	if(logging == false){
		for(var ga in magazoom['googleAnalytics']){
			//traceLog("acct:"+magazoom['googleAnalytics'][ga],1)
			_gaq.push(['_setAccount', magazoom['googleAnalytics'][ga]]);
			_gaq.push(['_trackEvent',cat,action,label,val,interact]);
		}	
		
	}
}

function showInfo(v){
	$(".alertDiv").hide()
	
	if(!v) return;
	
	var ph = magazoom['phone']
	 if(config.isMobile){
		 ph = "<a href='tel:"+ph+"'>"+ph+"</a>";
	 }
	var contact = "<h4>"+config.location+"<\h4>"
		contact += "<h4>phone:"+ph+"<\h4>"
		contact += "<h4><a style='text-decoration:underline;color:black;' href='"+magazoom.webURL+"'>"+magazoom.webURL+"</a><\h4>"
		contact += "<div class='buttonObject aButton' data-action='showHideContact(1)'>"+UI['Contact_Us']+"</div>"
		
	var txt = magazoom.about + contact
	var ttl = magazoom.company 
	
	$(".alertFooter").hide()
	
	showHideAlert(txt, ttl, null, null,null)
	$(".closeButton").show()

}

function onDataEntry(event){
	
	if(touchEnabled){
	
		window.scrollTo(0, 0);
	
		if($("#"+event.target.id).is(":focus") ){
			$('.indicatorDiv').css({bottom:"400px"})			
		}else{
			$('.indicatorDiv').css({bottom:"5px"})
			//$(spreadsIndicator).css({top:"4px"})
		}
		trace("touchEnabled")
	}
	
}
function setOnClickListeners(classArr){
	
	//trace("settingListeners")
						
	for(var ele in classArr){
		if (touchEnabled) {
			$(document).on('touchstart','.'+classArr[ele], objectClick);
		}else{
			$(document).on('click','.'+classArr[ele], objectClick);
		}
	}
	$(document).on('touchmove', '#annotLayer', touchMove);
	$(document).on('touchstart','#annotLayer',touchStart);
	$(document).on('touchend','#annotLayer',touchEnd);
	
	//$(nextPgBtn).live('touchstart',objectClick);
	$(document).on('touchstart','#nextPgBtn', objectClick);
	//$(nextPgBtn).live('touchend',nextPrevBtnUp);
	//$(prevPgBtn).live('touchstart',objectClick);
	$(document).on('touchstart','#prevPgBtn', objectClick);
	
	$(document).on('mouseover','.unit', function(){changeImage(event)});
		
	$(document).on('touchend','.fastScrollBtn', function(){goToPage(pageIndex)});
	$(document).on('touchstart','.fastScrollFwd', function(){fastScrollForwardPages()});
	$(document).on('touchstart','.fastScrollBack', function(){fastScrollBackPages()});
	
}

function setOnDragListeners(classArr){
	
						
	for(var ele in classArr){
		//trace(classArr[ele])
		if (touchEnabled) {
			//$('.'+classArr[ele]).on('touchmove', touchObjectMove);
			$(document).on('touchmove', '.'+classArr[ele], touchObjectMove);
			
			//$('.'+classArr[ele]).on('touchend', touchSliderEnd);
			$(document).on('touchend', '.'+classArr[ele], touchSliderEnd);
			//trace(classArr[ele])
		}else{
			$('.'+classArr[ele]).draggable({			     			   
			   axis: "x",
			   containment: "parent" 			   		   
			   })
			  // $('.'+classArr[ele]).on( "drag", touchObjectMove);
			  // $('.'+classArr[ele]).on( "dragstop", touchSliderEnd);
			   $(document).on( "drag", '.'+classArr[ele], touchObjectMove);
			   $(document).on( "dragstop", '.'+classArr[ele], touchSliderEnd);
							
		}
	}
}

function objectOver(event){

	var objTarget = $(event.target)
						
	var dataAttrArr = new Array('action','start','move','end')	
	
	for (objFn in dataAttrArr){		
		if(objTarget.data(dataAttrArr[objFn])){
			var fn = objTarget.data(dataAttrArr[objFn]);
			break
		}
	}	
		
	if(fn){
		trace(fn)
		eval(fn)
		//event.preventDefault()
	}
	
}

function objectClick(event){
	
	showMenu();
	showPages()
	showArchives()
	
	$('.alertDiv').hide()
	
	if(spinner){
		spinner.stop()
	}
		
	var objTarget = $(event.target)
	
	var id = objTarget.prop('id')
					
	var dataAttrArr = new Array('object','start','move','end','action')	
	
	for (objFn in dataAttrArr){		
		if(objTarget.data(dataAttrArr[objFn])){
			var fn = objTarget.data(dataAttrArr[objFn]);
			break
		}
	}	
	
	touchPointX = 	(touchEnabled) ? event.originalEvent.touches[0].pageX : event.pageX;
	touchPointY = 	(touchEnabled) ? event.originalEvent.touches[0].pageY : event.pageY;
		
	$('#spark').css({
		display: "block",
		top: touchPointY+"px",
		left: touchPointX+"px",
		zIndex: 2000000,
		}).animate({opacity: 0},500,function(){
			$('#spark').css({
			display : "none",			
			opacity : 1
			})
		})
	
	if(fn){
		trace(fn)
		eval(fn)
		//event.preventDefault()
	}
	
	
}


function verifyUser(e){
	if(settingsModel['useraccountid'] && settingsModel['useremail']){
		
		$.ajax({
		type: 'GET',
		url: u,
		crossDomain: false,
		dataType: 'xml',
		success: getPrivileges});		
		
	} 
		
}

function scrollToTop(){
	 window.scrollTo(0,0);
	 
 }
function pageShowing(e) {
	if (isLoaded) {
		//alert(lc_theTime)
		//window.location.reload()
	}
}

function toggleFullScreen(){
	if(showToolBars){		
		showToolBars = false;
		setupScales(magazoom.pageWidth,magazoom.pageHeight)
		showHideToolBars()		
	}else{
		showToolBars = true;
		setupScales(magazoom.pageWidth,magazoom.pageHeight)
		showHideToolBars(true)				
	}	
}
 
function beforeUnload(event){

	if(shoppingCartList.length>0){
		showHideAlert("Whoops, you still have items in your cart !", "block")
		return;
	}else{
		showHideAlert("Whoops, save this to your home screen !", "block")
	}
}

function getOpener(U){

	var isYouTube = (youtube_parser(U)) ? true : false;
	
	var ustr = U.split("?")[0]
	var ext = ustr.toString().split(".").pop().toLowerCase()
	
	var oImage = new Image()
		oImage.src = U
		oImage.onload = function(){showHideOpener()}	
			
	contentType = "";
	
	switch(ext){
		case "jpg" : 		
		contentType = "&contentType=image%2Fjpeg";
			break;
		case "png" : 
		contentType = "&contentType=image%2Fjpeg";
			break;
		case "gif" : 
		contentType = "&contentType=image%2Fgif";
			break;
		case "htm" : 
		contentType = "&contentType=text%2Fhtml";
			break;
		case "html" : 
		contentType = "&contentType=text%2Fhtml";
			break;
		case "php" : 
		contentType = "&contentType=text%2Fhtml";			
			break;
			default: null;
	}
	
	
	var openerW =  (config.orientationFormat=="L") ?  (($(window).height()-fudgeAmt)/pageAR).toFixed(0) : pageDisplayWidth;
	var openerH =  $(window).height()-fudgeAmt ;
	
	$(openerDiv).css({			
			position:"absolute",
			top:10,
			right:$(window).width()+"px",
			backgroundColor:"transparent"
					
		}).hide()
	
	
	if(ext=="jpg" || ext =="png" || ext =="gif" ){
		//var im = $('<img />',{'src':U,'class':'buttonObject','id':'openerImg'}).css({
		var im = $('<div />',{'class':'buttonObject','id':'openerImg'}).css({
				height:'100%'
			//height:openerH+"px"		
			
		});
		$(openerDiv).css({backgroundImage:'url('+U+')',backgroundSize:'cover',backgroundRepeat:'no-repeat',backgroundPosition:'center right'})
		//trace(im)
			
		im.appendTo($(openerDiv))
		
	if(config.openerURL.length>1){
		trace("adding openerURL")
			if(youtube_parser(config.openerURL)){
				trace(youtube_parser(config.openerURL))
				var act = "showHideYouTubeWindow('block','"+youtube_parser(config.openerURL)+"')"
				im.attr("data-object",act);
				}
			else{
				im.attr("data-object","goToURL('"+config.openerURL+"')");
			}
	}
	
		//showHideOpener()
				
	}else if(isYouTube){
											
		setTimeout(function(){showHideYouTubeWindow('block',youtube_parser(U))},timeDelay)
	}
		
						
				
}

function getRemoteContent(U,args){

	hideAllPopUps()
		
	
	showHideSpinner(1)
		
	var objStr = "("+args+")"
	var obj = eval(objStr)
	
	var W = (obj)	? parseInt(($(window).width()-obj.w)/2)+"px" : "90%"
	var H = (obj)	? parseInt(($(window).height()-obj.h)/2)+"px" : "90%"
	var M = (obj) ? $(window).width()-parseInt(($(window).width()-obj.w)/2) : "5%"
	var T = (obj) ? $(window).height()-parseInt($(window).height()-obj.w) : "10%"
	
	u = "http://www.magazooms.com/proxyRequestContent.php?url="+U;
			
	trace(u)
						
	$(webDiv).css({
		opacity: "1",
		left:  "10%",
		top: "10%",
		//right:"10%",
		//bottom:"10%",
		overflow: "scroll",
		display:"inline-block",
		zIndex:6000000000000000,
		backgroundColor:"#ffffff"
		});
	
	
	//$(webFrame).prop("src", url);
	
	
		
	$.ajax({
		type: 'GET',
		url: u,
		crossDomain: false,
		dataType: 'html',
		success:function(winHtml){
			var newHTML = $(winHtml).find('#hg-products-item')
			trace(newHTML)				
			$(webDiv).html(newHTML);
			$(webDiv).animate({opacity: 1},2000)
		}		
	});
	
	
								
	if(spinner) spinner.stop();
		
}

function getRemoteResponse(resp){

	alert(resp)
	return;
	
	hideAllPopUps()
		
	opts.color=  '#000000';	
	spinner = new Spinner(opts).spin(windowDiv)
		
	var W = "90%"
	var H = "90%"
	var M =  "5%"
	var T =  "10%"
								
	webDiv.style.opacity = 1;
	webDiv.style.display = "block";
	webDiv.style.left =  M
	webDiv.style.top = T
	webDiv.style.width = W;
	webDiv.style.height = H;
	webDiv.style.overflow = "hidden";
	webDiv.style.zIndex = 200000;
	webDiv.innerHTML = resp;
	webDiv.style.overflow = "auto";	
				
	if(spinner) spinner.stop();
	
	
	}
	

function setPDFDownload(event){
	
	$('.magazine-viewport').zoom('zoomOut');
	var obj = $(event.target)
	
	if($(obj).prop('class').indexOf('merge') >-1){
		mergeSearchPages()
		return;
	}
	var p = obj.data('pageid')
	var u = "/publish/" + magazoom.clientID + "/" + magazoom.pubID + "/packages/" + magazoom.mzID + "/package/pdf/" +  magazoom.mzID + ".pdf";
	if(p){
		u = root.pdfURL	+ mzID + "_" + p + ".pdf"
	}
	trace(u)
	downloadPDF(u)
}

function localize(){
			
			var logMsg = (magazoom['loginMessage']) ? magazoom.loginMessage : UI['Login_Required']
			
			$('.fastScrollBackSpreads').prop('title',UI['fast_scroll_back'])
			$('.fastScrollForwardSpreads').prop('title',UI['fast_scroll_forward'])
			$('.nextBtnArrow').prop('title',UI['nextpage'])
			$('.prevBtnArrow').prop('title',UI['prevpage'])
			$('.nxtPageBtn').prop('title',UI['Next_Page'])
			$('.prvPageBtn').prop('title',UI['Previous_Page'])
			$('.closeButton').prop('title',UI['Close'])
			$("#searchInput").val(UI['Search'])
			
			$(".pagesLabel").val(UI['Pages'])
			$(".moreLabel").val(UI['More'])
			
			$('.navTab').prop('title',UI['ViewMenu'])
			$('.shareIcon').prop('title',UI['Share'])
			$('.infoIcon').prop('title',UI['MoreInfo'])
			$('.cartIcon').prop('title',UI['ViewCart']+" "+UI['Currency']+shopping.cartTotal)
			$('.tocIcon').prop('title',UI['Index'])
			$('.pagesIcon').prop('title',UI['Pages'])
			$('.saveAll').prop('title',UI['SaveAll'])
			$('.archiveIcon').prop('title',UI['View_More'])
			$('.helpIcon').prop('title',UI['Help'])
			$('.downloadCart').prop('title',UI['Save_Cart_as_PDF'])
			
			$('#HowToBtn').html(UI['How_To']).prop('title',UI['How_To'])
			$('#ContactUsBtn').html(UI['Contact_Us']).prop('title',UI['Contact_Us'])
						
			$('.facebookIcon').prop('title',UI['Post_to_Facebook'])
			$('.twitterIcon').prop('title',UI['Post_to_Twitter'])
			$('.linkIcon').prop('title',UI['ShareALink'])
			$('.smsIcon').prop('title',UI['ShareSMS'])
						
			$('#SharePagesBtn').html(UI['Share_All_Pages']).prop('title',UI['Share_All_Pages'])
			$('#ShareAppBtn').html(UI['Share_App']).prop('title',UI['Share_App'])
			$('#ContinueBtn').html(UI['Continue']).prop('title',UI['Continue'])
			//$('#SettingsBtn').html(UI['My_Settings']).prop('title',UI['My_Settings'])
			$('#spreadsIndicator').prop("title",UI['Enter_Page_Number'])
			$("#HowToDivHeader").html(UI['How_To'])
			$(".loginBtn").html(UI['Login']).prop("title",UI['Login']);
			$(".cancelBtn").html(UI['Cancel']).prop("title",UI['Cancel']);
			$(".forgotLoginBtn").html(UI['Forgot_Login']).prop("title",UI['Forgot_Login']);
			$(".loginRequiredLabel").html(logMsg);
			$(".usernameLabel").html(UI['Username']).prop("title",UI['Username']);
			$(".passwordLabel").html(UI['Password']).prop("title",UI['Password']);
			$(".savePage").prop("title",UI['DownloadPage']);
			//$(".saveIcon").prop("title",UI['Download']);

			
			
			$('.cs-cz').prop("title",UI['cs-cz'])
			$('.en-us').prop("title",UI['en-us'])
			$('.de-de').prop("title",UI['de-de'])
			$('.fr-fr').prop("title",UI['fr-fr'])
			$('.es-es').prop("title",UI['es-es'])
			$('.it-it').prop("title",UI['it-it'])
			$('.pt-pt').prop("title",UI['pt-pt'])
			
					
			$('.flagIcon').prop('class',config.lang+' buttonObject langIcon flagIcon')	
				
			setHowTo()
	
}


function getMagazoom(){
	trace("getMagazoom")								
	var now = new Date();
	sessionID = now.getFullYear() + "" + now.getMonth() + "" + now.getDate() + "" + now.getMinutes() + "" + now.getSeconds();
	// Get Magazoom record
	
	$.ajax({
		type: 'GET',
		url: u,
		crossDomain: false,
		dataType: 'xml',
		success: setMagazoom,
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			trace(XMLHttpRequest.responseText)
			trace(textStatus);
			trace(errorThrown);
			}
		
	});
	
}

function setMagazoom(xml) {

	trace(xml);
	
	$(xml).find('record').children().each(function() {
		magazoom[(this).nodeName] = trim($(this).text())
		//trace(this)
	})

	// and index for type of spread 0 = single page 1 = doublt page
	magazoom['spread'] = ( "<?php echo $spread; ?>") ? "<?php echo $spread; ?>" : 1;
	
	if(magazoom['allowShare']!='1'){
		$(".shareIconDiv").hide()
	}
		
	if(magazoom['allowPrint']!='1'){
		$(".saveAll").hide()
	}
	if(magazoom['allowPrint']!='1'){
		$(".download").hide()
	}
	if(!magazoom['productLookup']){
		$(".cartIcon").hide()
	}
	if(!magazoom['showArchives']){
		$(".archiveIcon").hide()
	}
	if(magazoom['subdomain']){
		$(".archiveIcon").show()
	}
	
	
	var gaArr = (('<?php echo implode(",",$googleUAarr);?>').split(",").length>1) ? ('<?php echo implode(",",$googleUAarr);?>').split(",") : new Array('<?php echo implode(",",$googleUAarr);?>')
	
	magazoom.googleAnalytics = gaArr;
	
	magazoom.pageViewLimit = (magazoom.pageViewLimit=='1') ? 1 : magazoom.pageViewLimit;
	
	root.pageURL = "http://cdn.magazooms.com/publish/" + magazoom.clientID + "/" + magazoom.pubID + "/packages/" + mzID + "/package/full/" + mzID + "_";
	root.thumbnailURL = "http://cdn.magazooms.com/publish/" + magazoom.clientID + "/" + magazoom.pubID + "/packages/" + mzID + "/package/thumbs/" + mzID + "_";
	root.fullURL = "http://cdn.magazooms.com/publish/" + magazoom.clientID + "/" + magazoom.pubID + "/packages/" + mzID + "/package/full/" + mzID + "_";
	root.pdfURL = "publish/" + magazoom.clientID + "/" + magazoom.pubID + "/packages/" + mzID + "/package/pdf/";
	
	config.url = "http://"+config.domain + "/HTML5/"+magazoom.seo_title
	
	$('.shareLink').prop('href',"mailTo:?Subject=Thought you might be interested" + "&" + "Body=" +config.url)
	$('.shareSMS').prop('href',"sms://?body=Thought you might be interested in this " + "&" +config.url)
	
	pageAnimation = $(xml).find('singlePageEffect').text();
	
	//catalogTitle.innerHTML = $(xml).find('meta_title').text();
	buttonStyle =  ($(xml).find('buttonStyle').text()) ? $(xml).find('buttonStyle').text() : 1;
			
	toolbar3D = (settingsModel['toolbar3D']!="") ? settingsModel['toolbar3D'] : magazoom.toolbar3D;
				
	pageAR = magazoom.pageHeight / magazoom.pageWidth;
	
	//setOnDragListeners(["sliderButton"]);
	// setup and load the spreads
	
	$('#titleDiv').html(magazoom.meta_title);
	
	config.location = magazoom.location.toString().replace(/[\r]/g,"<br>");	
	
	setupSpreads()		

	var shoppingEnabled = (magazoom.productLookup != "") ? "<br>(Shopping Enabled)" : "";
	
	setupScales(magazoom.pageWidth,magazoom.pageHeight)
	
	updateSlider(1,"pageSliderButton");
			
	colorC = "#202020";
			
	if (magazoom.productLookup.indexOf('direct=') > -1 || magazoom.productLookup == "") {
		$('#cartTD').remove();		
	}
	
	if (magazoom.youtube_query) {		
		getYouTube()
		
	} 
	
			
	updateDisplay()

	getToc();
	
	pageNum = (pageNum < 1) ? 1 : pageNum;
	
	getPages();

	if(magazoom.showArchives==1){
		getArchives()
	}else{
		$('.archiveIcon').hide();
	}
	
	getShoppingHistory()

	if (searchTxt != '') {
		$('#searchInput').val(searchTxt);
		setTimeout(function(){searchNow(searchTxt)},10000)
	}
		
	$('#loadingHeader').html("<h3>" + magazoom.company + "</h3>")
	$('#loadingFooter').html("<h4>" +magazoom.meta_title +  shoppingEnabled +"</h4>")
	var target = $('#loadingSpinner');				
		//loadingspinner = new Spinner(opts).spin(target)
		
		opts.color=  '#FFFFFF';	
		spinner = new Spinner(opts).spin(windowDiv)
	
	$('#loadingDiv').css({
		position : 'absolute',
		left : parseInt(($(window).width() - 200) / 2)+"px",
		right : parseInt(($(window).width() - 200) / 2)+"px",
		top : parseInt(($(window).height() - 200) / 2) +"px",
		display:"inline-block"
		})
		
	//$('#loadingSpinner').css({display:"inline-block"})

setOnClickListeners(["onButton","offButton","styleItem","toolButtonText","buttonObject","gradientRed","gradientDarkGray","gradientGray","tabOn","tabOff","historyItem","blackGlass","pearl","thumbnail","thumbnailMedium","thumbnailMediumGlow","tag"]);
			
if(magazoom.registrationDS != '' && magazoom.registration_required=='1' && magazoom.pageViewLimit > 0 ){
	/*setTimeout(function(){showHideAlert(UI['Requires_Login'], "block",'');
		setTimeout(function(){showHideAlert('',"none",null)},3000)
	},4000)*/
	
	setTimeout(function(){showToolTip('block',UI['Requires_Login'],((centerPointX)-120),(centerPointY-centerPointY)+50,0);
				setTimeout(function (){showToolTip('none')},timeDelay*.3)
	},timeDelay*.3)

}
		
	if (magazoom.registration_required==1 && magazoom.registrationDS != '' && magazoom.pageViewLimit == 0 ) {
		//if(settingsModel['userauthorized'] && settingsModel['userauthorized'].indexOf(magazoom.pubID) != 0){
			
		if(usr){
		$('#userName').val(usr)
		$('#password').val(pwd)
		
		setTimeout(function(){login()},2000)
		
		}else{
			showHideLogin(1);
			spinner.stop()
			return;
		}
			
		
	} else {
		trace("user authorized ok")
		
		//loadingDiv.style.display = "inline-block"
		$('#loadingDiv').fadeOut(0, function() {
			$('#loadingDiv').css({display : "inline-block"})
			//loadingDiv.style.visibility = "visible"
		});
			$('#loadingDiv').fadeIn(2000,function(){});
			setTimeout(function() {showHideLoading()},timeDelay);
		
		
		getAnnotations(1,'annotsDiv')
		}
	
	if(splash){
		$('#loadingDiv').css({display: "none"});
		
		$('#splashDiv').css({
		display: "block",
		position:"absolute",	
		backgroundColor:(magazoom['backgroundStyle']==3 && colorB) ? colorB : "none",
		left:"0px",
		textAlign:"center"
		})
		
		var sl = $("<div />").prop('id','splashLogo').css({
			border:"0px red dotted",
			height:"20px",
			display:"block",
			textAlign:"center",
			width:$(window).width()+"px"
			})
		
					
		var sI = $("<img >").prop("src",splash).css({
			webkitBorderRadius: "8px",
			height:"80%",
			borderRadius:"8px",
			border:"0px white dotted",
			float:"center"
		})
		
		$(sl).append($(sI))
		$(sl).append("<h3>" + magazoom.meta_title + shoppingEnabled + "</h3>")
							
		$('#splashDiv').append($(sl))
		
		$('#splashLogo').animate({height: 200 },(timeDelay-2000), function(){});
				
		setTimeout(function(){
		$('#splashDiv').delay(1000).fadeOut(1000);
		 showMenu(1)
		 showTooltips()
		},timeDelay)	
				
	}
	
	isLoaded = 1;
	
		//trace("displayOnline:"+magazoom.displayOnline)
		if(magazoom.account_type=='Trial' || magazoom.paid != 1 || magazoom.displayOnline != 1){
		
			config.opener = $('base').prop('href')+"/images/opener3.png";	
		
		}
	
		else if(magazoom.account_type=='Promotional'){
		
			var splashName = magazoom.company.toString().replace(/\s/g,"-")
		
			config.opener = "http://"+config.domain+"/opener/"+magazoom.pubID+".png";	
		
		}
		else if(config.opener){
			config.opener = "http://"+config.domain+'/opener/'+config.opener
			trace("openerURL:"+config.opener)
			config.opener+="?d="+new Date().getMilliseconds();	
		}	
		
		
								
		setTimeout(function(){getOpener(config.opener)},timeDelay*.6)	
					

	//iterateElements()	
	setHowTo()

	if(config.auto>0)
	setTimeout(function(){config.tid = setInterval(myTimer, 3000)},10000)
	//listListeners()
	
	}

function listListeners(){
	trace($.eventReport());
}

function setHowTo(){
	
	var mainDiv = $('<div id=howToSubDiv/>').css({
		padding:"0px",
		paddingLeft:'20px',
		paddingRight:'20px',
		position:'relative',
		top:'-25px',
		bottomMargin:'-20px',
		lineHeight:'16px',
		overflow:'scroll',
		maxHeight:($(window).height()-fudgeAmt-65)+'px',
		textAlign:'center'
			
	})
	
	var hText = "<button class='pearl pearlBtn heading' data-object=toggleSubHeading(event,'zoomInstruct','instruct')>"+UI['Zoom_InOut']+"</button>"
	    hText +="<div id='zoomInstruct' class='hide instruct'>"
		
	if(touchEnabled){		
		hText += UI['HowToZoomA']+defaultClickEvent+" "+UI['HowToZoomB']
							
		
	}else{
		hText += UI['HowToZoomC']+defaultClickEvent+" "+UI['HowToZoomD']
		}
				
		hText += "</div>"
		
	if(touchEnabled){
		hText += "<button class='pearl pearlBtn' data-object=toggleSubHeading(event,'switchInstruct','instruct')>"+UI['Choose_Single_or_2-page_View']+"</button>"
		hText +="<div id='switchInstruct' class='instruct hide'>"

		hText += UI['TwoPageView']
		hText += "</div>"
		
	}
		
		hText += "<button class='pearl pearlBtn' data-object=toggleSubHeading(event,'pagesInstruct','instruct')>"+UI['Navigate_Pages']+"</button>"
		hText +="<div id='pagesInstruct' class='instruct hide'>"
				
		hText += "<h3>"+UI['GoNextPrevPage']+"</h3>"
		hText += UI['SwipeLeftRightA']+toTitleCase(defaultClickEvent)+ " " + UI['SwipeLeftRightB'] 
					
		hText += "<br><h3>"+UI['PanPagesA']+"</h3>"
		hText += UI['PanPagesB']
		
		hText += "<br><h3>"+UI['JumpPagesA']+"</h3>"
		hText += UI['JumpPagesB']
		hText += "</div>"
		
		hText += "<button class='pearl pearlBtn' data-object=toggleSubHeading(event,'searchInstruct','instruct')>"+UI['Search']+"</button>"
		hText +="<div id='searchInstruct' class='instruct hide'>"

		hText += toTitleCase(defaultClickEvent)+" "+UI['SearchDropDown']
	
		hText += "<div class='subItem'><h3>"+UI['ViewResultsA']+"</h3>"
		hText += toTitleCase(defaultClickEvent)+ " " + UI['ViewResultsB']
		hText += "</div>"
		
		hText += "<div class='subItem'><h3>"+UI['SaveResultsA']+"</h3>"
		hText += toTitleCase(defaultClickEvent)+ " <img style='top:0px;position:relative' src='images/download.png' /> "+ UI['SaveResultsB']
		hText += "</div>"
		
		hText += "<div class='subItem'><h3>"+UI['RemoveResultsA']+"</h3>"
		hText += toTitleCase(defaultClickEvent)+ " <img style='top:0px;height:20px;position:relative' src='images/trash.png' /> "+UI['RemoveResultsB']
		hText += "</div>"
		hText += "</div>"
		
		if((magazoom.productLookup != "") ){
			hText += "<button class='pearl pearlBtn' data-object=toggleSubHeading(event,'shoppingInstruct','instruct')>"+UI['Shop']+"</button>"
			hText +="<div id='shoppingInstruct' class='instruct hide'>"
			hText += toTitleCase(defaultClickEvent)+ " "+ UI['ShopInstruct']
			
			hText += "<div class='subItem'><h3>"+UI['ViewCart']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " "+ UI['ViewCartB']
			hText += "</div>"


			hText += "<div class='subItem'><h3>"+UI['Add_to_cart']+"</h3>"
			hText += defaultClickEvent+ " "+ UI['Add_to_CartB']
			hText += "</div>"
			
			hText += "<div class='subItem'><h3>"+UI['RemoveFromCart']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " <img style='top:5px;height:20px;position:relative' src='images/trash.png' /> "+ UI['RemoveFromCartB']
			hText += "</div>"
			
			hText += "<div class='subItem'><h3>"+UI['Checkout']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " "+UI['CheckoutB']
			hText += "</div>"
			
			hText += "<div class='subItem'><h3>"+UI['Save_Cart_as_PDF']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " <img style='top:0px;position:relative' src='images/download.png' /> "+ UI['SaveCartPDFB']
			hText += "</div>"
			hText += "</div>"
		}
		if(databaseEnabled){
			hText += "<button class='pearl pearlBtn' data-object=toggleSubHeading(event,'bookmarkInstruct','instruct')>"+UI['BookmarkPage']+"</button>"
			hText +="<div id='bookmarkInstruct' class='instruct hide'>"
			
			
			hText += "<div class='subItem'><h3>"+UI['AddBookmark']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " " +UI['AddBookmarkPageB']
			hText += "</div>"
			
			hText += "<div class='subItem'><h3>"+UI['ViewBookmarkPage']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " " +UI['ViewBookmarkPageB']
			hText += "</div>"
			
			hText += "<div class='subItem'><h3>"+UI['RemoveBookmark']+"</h3>"
			hText += toTitleCase(defaultClickEvent)+ " <img style='top:0px;height:20px;position:relative' src='images/trash.png' /> "+UI['RemoveBookmarkB']
			hText += "</div>"			
			
			hText += "</div>"
		}

	
	mainDiv.html(hText)
	$('#howToDivContent').empty().html(mainDiv)
}

function getDimensions() {
	var x, y;
	if (self.innerHeight) // all except Explorer
	{
		x = self.innerWidth //+8;
		y = self.innerHeight //+8;
	} 
	else if (document.documentElement && document.documentElement.clientHeight)
	 	// Explorer 6 Strict Mode
	 {
	 	x = document.documentElement.clientWidth;
	 	y = document.documentElement.clientHeight;
	 }
	 else if (document.body) // other Explorers
	 {
	 	x = document.body.clientWidth;
	 	y = document.body.clientHeight;
	 }
			
	var h = (device=='iphone') ? ($(window).height())+"px" : ($(window).height())+"px" ;
	
	var cntr = $(window).width()/2
				
	$('body').css({		
		backgroundColor: (magazoom['backgroundStyle']==3 && colorB) ? colorB : "none",
		
		width: $(window).width()+"px"		
	})
		
	$('#windowDiv').css({width : $(window).width()+"px",height : h	})
	$('body').css({width : $(window).width()+"px",height : h})
						
	config.orientationFormat = (x < y ) ? "P" : "L";
	spintarget = (config.orientationFormat =="P") ? windowDiv : spreadsDiv;
	
	$('#loadingDiv').css({
		left:(($(window).width()-200)/2)+"px",
		top:(($(window).height()-200)/2)+"px"
	})
	
	$('.masterNav').css({
		left:(($(window).width()-$('.masterNav').width())/2)-15,
	})
	$('.navTab').css({
		left:(($(window).width()-50)/2)-5
	})

	display.ww = x;		
	return Array(y, x)
	
	
}

function showMenu(v){
	if(v){
		trace("showingMenu")
		$('.masterNav').animate({top:'0px'},500)
		$('.navTab').animate({top:'52px'},500)
		
	}else{
		trace("hidingMenu")
		$('.masterNav').animate({top:'-52px'},500)
		$('.navTab').animate({top:'0px'},500)
	}
}
function showPages(v){
	if(v){
		trace("showingPages")
		$('.pagesDiv').html(config.pages).append("<div style='left:15px;top:10px;' class='buttonObject closeButton' data-action='showPages()'>x</div>")
		$('.pagesDiv').animate({bottom:'0px'},500)
	}else{
		$('.pagesDiv').animate({bottom:'-140px'},500)
		
	}
}

function showArchives(v){
	if(v){
		trace("showingArchives"+config.archives)
		$('.pagesDiv').html(config.archives).append("<div style='left:15px;top:10px;' class='buttonObject closeButton' data-action='showPages()'>x</div>")
		$('.pagesDiv').animate({bottom:'0px'},500)
	}else{
		$('.pagesDiv').animate({bottom:'-140px'},500)
		
	}
}
/*
function showHelp(v){
	if(v){
		trace("showingHelp")
		$('.pagesDiv').html(config.help)
		$('.pagesDiv').animate({bottom:'0px'},500)
	}else{
		$('.pagesDiv').animate({bottom:'-140px'},500)
		
	}
}
*/
function showHelp(v){
	
	return;
	
	var path = (config.isMobile)? "mobile/" : "";
	
	var htmlTxt = $("<ul/>").css({paddingBottom:'80px'})
	
	if(config.isMobile){
		var lab = $("<h2/>").html(UI['ShowMenu'])
		htmlTxt.append(lab)
		var img = $("<li/>").html($("<img/>").attr('src', "../../CSS/images/help/"+path+"HelpPanel.png"))
		htmlTxt.append(img)
	}
	
	var lab = $("<h2/>").html(UI['Zoom_InOut'])
	htmlTxt.append(lab)
	var img = $("<li/>").html($("<img/>").attr('src', "../../CSS/images/help/"+path+"HelpZoom.png"))
	htmlTxt.append(img)
	
	var lab = $("<h2/>").html(UI['Turn_To_Page'])
	htmlTxt.append(lab)
	var img = $("<li/>").html($("<img/>").attr('src', "../../CSS/images/help/"+path+"HelpPaging.png"))
	htmlTxt.append(img)
	
	var lab = $("<h2/>").html(UI['Search'])
	htmlTxt.append(lab)
	var img = $("<li/>").html($("<img/>").attr('src', "../../CSS/images/help/"+path+"HelpSearch.png"))
	htmlTxt.append(img)
	
	var lab = $("<h2/>").html(UI['Save'])
	htmlTxt.append(lab)
	var img = $("<li/>").html($("<img/>").attr('src', "../../CSS/images/help/"+path+"HelpDownload.png"))
	htmlTxt.append(img)
	
	
	
	if(magazoom.productLookup){
		var lab = $("<h2/>").html(UI['Add_to_cart'])
		htmlTxt.append(lab)
		var img = $("<li/>").html($("<img/>").attr('src',  "../../CSS/images/help/"+path+"HelpBuy.png"))
		htmlTxt.append(img)
		
		var lab = $("<h2/>").html(UI['RemoveFromCart'])
		htmlTxt.append(lab)
		var img = $("<li/>").html($("<img/>").attr('src',  "../../CSS/images/help/"+path+"HelpCart.png"))
		htmlTxt.append(img)
	}

	var txt = htmlTxt
	var ttl = UI['Help']
	
	$(".alertFooter").hide()
	
	if(v){
		showHideAlert(txt, ttl, null, null,null)
		$(".closeButton").show()
		$('.alertContent').css({maxHeight:($('.alertDiv').height()-60)}).addClass('linen')
	}
	
	
}



function setupSpreads(val){

	//if(val != 1 && isLoaded) return
	
	//trace("   setup spreads")
	var cLeft = 30;	
	var cWidth = ($(window).width()-40);
	var rH = ($(window).height() - 50);
	var pH = ($(window).height() - 50)
	var rB = 5+"px"
	var pB = 25+"px"
	
	var cHeight = (device.toString() == 'ipad') ? pH : rH;
	var b  = (device.toString() == 'ipad' && config.orientationFormat == 'L') ? pB : rB;
	
	$(".indicatorDiv").css({bottom:b})

	var availHeight = ($(window).height()-50);
	
	
	 $('.next-button').css({
		 right:cLeft*-1
	 })
	  $('.previous-button').css({
		 left:cLeft*-1
	 })
	
			
		$('#spreadsDiv').css({
			left : cLeft+"px",			
			width : cWidth+"px",
			zIndex : 50,
			height : cHeight+"px"
		})
		
		var magazineScale = Math.min((magazoom.pageWidth*2)/cWidth, availHeight/magazoom.pageHeight)
		var mph = magazoom.pageHeight
		var mpw = magazoom.pageWidth
		var spreads = (magazoom.spread) ? 2 : 1 ;
		magazineHeight = parseInt(mph/magazineScale);
		magazineWidth = parseInt((mpw*spreads)/magazineScale);
		
		//trace("     pageW:"+ magazoom.pageWidth)
		//trace("     cheight:"+cHeight)
		//trace("     height:"+magazineHeight)
		//trace("     width:"+magazineWidth)
		//trace("     magazineScale:"+magazineScale)
				
	}
	
function setupScales(w,h){
	
	//getDimensions()
	
	fudgeAmt = (showToolBars) ? toolbarBotHeight : 0; //($(window).height() > 928) ? ($(window).height() - 928) : 0;
	
	pageDisplayWidth = parseInt((getDimensions()[0] - fudgeAmt) / pageAR) //: getDimensions()[0];
	pageDisplayHeight = parseInt(getDimensions()[0] - fudgeAmt) //: getDimensions()[0] / pageAR; ;
	
	dynamicPageWidth = (config.orientationFormat=="P") ? pageDisplayWidth : 1024;
	dynamicPageHeight = (config.orientationFormat=="P") ? pageDisplayHeight : ($(window).height()-fudgeAmt);
				
	var landscapeW = 1025; 
					
	fullScale =  (pageDisplayWidth/w).toFixed(4)
	zoomScale = (landscapeW/w).toFixed(4)
		
}


function setupNextPrev(p){
	var nextPDF = root.fullURL + (p-0+1) + ".png"  ;
	var fadeNextInnerHTML = "<img src="+ nextPDF+" width='100%'/>"
	
	var prevPDF = root.fullURL + (p-1-0) + ".png"  ;
	var fadePrevInnerHTML = "<img src="+ prevPDF+" width='100%'/>"
		
	$('#fadeNextDiv').css({width:dynamicPageWidth});
	$('#fadeNextDiv').css({height: pageDisplayHeight});
	$('#fadeNextDiv').css({webkitTransform : "scale(1)"});		
	$('#fadePrevDiv').css({width:dynamicPageWidth});
	$('#fadePrevDiv').css({height: pageDisplayHeight});
	$('#fadePrevDiv').css({webkitTransform : "scale(1)"});
	
	
	if(pageIndex>p){
		
		$('#fadePrevDiv').html(fadePrevInnerHTML)
		$('#fadePrevDiv').css({display : "block"});
		$('#fadeNextDiv').css({display : "none"});
	}
	
	if(pageIndex<magazoom.npages){
		$('#fadeNextDiv').html(fadeNextInnerHTML);
		$('#fadeNextDiv').css({display : "block"});
		$('#fadePrevDiv').css({display : "none"});
	}
}

function updateDisplay(val) {
				
	if(settingsModel['userbandwidth'] == '' || settingsModel['userbandwidth'] == '0'){
		isHiResolution = 0 ;
		}
	else if((settingsModel['userbandwidth'] == '1' )){
		isHiResolution= 1 ;		
	}
		
	
	if (winOrientation == undefined) {
		winOrientation = (getDimensions()[0] > getDimensions()[1]) ? 0 : -90;
	} else {
		getDimensions();
	}
	
	showPages()
	
	hideAllPopUps();
					
	fudgeAmt = (showToolBars) ? toolbarBotHeight+toolbarTopHeight : 0
	
	$('#dynDiv').css({maxHeight : getDimensions()[0] - 60 - fudgeAmt});		
		
	pageDisplayWidth = parseInt((getDimensions()[0] - fudgeAmt) / pageAR) //: getDimensions()[0];
	pageDisplayHeight = parseInt(getDimensions()[0] - fudgeAmt) //: getDimensions()[0] / pageAR; ;
	dynamicPageWidth = (winOrientation == 0 || winOrientation == 180) ? pageDisplayWidth : getDimensions()[1];
	dynamicPageHeight = (winOrientation == 0 || winOrientation == 180) ? pageDisplayHeight : parseInt(getDimensions()[1] * pageAR);
	
	dynamicPageScale = (winOrientation == 0 || winOrientation == 180) ? fullScale : zoomScale;
	
		
	if(isLoaded){
		$('#toolbarTopDiv').css({display:"block"});
		$('#toolbarBotDiv').css({display:(spreadsShowing) ? "none" : "block"});
		$('#annotsDiv').css({display:"block"});
		$('#annotLayer').css({display:'block'});
		$('.indicatorDiv').css({display:"inline-block"})
			
		if(config.orientationFormat == "L"){
			buttonStyle = 1
						
						
			if($('#spreadsDiv').css('display') == "none" ){
				$('#book').css({display:"none"})
				$('#nextPgBtn').css({display:"none"})
				$('#prevPgBtn').css({display:"none"})
				$('#book').css({display:"none"})
				$('#pageSlider').css({display:"none"})
				$('#toolbarBotDiv').css({display:"none"})
				$('.previous-button').css({zIndex:20000000000000000})
				$('.next-button').css({zIndex:20000000000000000})
				showHideSpreads('block');
				
				if(config.opener){
					//$('#openerDiv').css({display:"block"})
					
				}	
			}
			
						
		}
					
		if(config.orientationFormat == "P"){
			buttonStyle = 0
			
			if($('#spreadsDiv').css('display') != "none"){
				showHideSpreads('none');
				$('#book').css({display : "block"})
				
				if(currentSpreadIndex>0){
					var pn = spreadsNumbering[currentSpreadIndex].split("-")
					if(pn.length>1){
						var p = pn[0]
					}else{
						var p = pn
					}
					if(p!=pageIndex) goToPage(p)
				}
									
			}
			
			$('#prevPgBtn').css({display : (pageIndex == 1 || display.openedFromHomeScreen || fullScreen) ? "none" : "block"});
			
			$('.indicatorDiv').css({display:"inline-block"})
						
			$('#nextPgBtn').css({display : (pageIndex == magazoom.npages || display.openedFromHomeScreen || fullScreen) ? "none" : "block"});
			$('#prevPgBtn').css({display : (pageIndex == 1 || display.openedFromHomeScreen || fullScreen) ? "none" : "block"});
			$('#pageSlider').css({display : "block"})
			getAnnotations(pageIndex,'annotsDiv')			

			updateSlider(pageIndex,"pageSliderButton")
			$('#viewingPage').fadeIn(1000,function (){			
			$('#stackedPages').css({display : "block"})
			})
			
			if(config.opener && config.openerHasShown){
				//$('#openerDiv').css({display:"none"})
			}
			//trace("firstPageWithProduct:"+firstPageWithProduct+" "+pageIndex)
						
		}
	}
		
	$('.titleDiv').css({width:$(window).height()-fudgeAmt});
						
	$('#toolbarBotDiv').css({height:toolbarBotHeight+"px"})
	$('#toolbarBot').css({height: "40px"})
	
	var th = (showToolBars) ? toolbarTopHeight : "0px"
	var dh = (showToolBars) ? dynamicPageHeight+"px" : $(window).height()+"px"
	
	$('#book').css({top:th})
	$('#book').css({height:dh})
	$('#book').css({overflow: "visible"});
	
	//change the PDF based on orientation
	
	if (config.orientationFormat != "P" || config.orientationFormat != "L") {
		getDimensions();
	}
				
	var marginAdj = Math.floor((-8*dynamicPageScale)-0);
		
	var pngSrc = root.fullURL+ pageIndex + ".png";
	//var	movingPageInnerHTML = "<img id='objectPNG' src='" + pngSrc + "' style='width:100%;'>" //+ dynamicPageWidth+"px;"
							
	if(!isHiResolution){		
		currentPageSrc = pngSrc;
		viewingPageInnerHTML = "<img src='" + currentPageSrc + "' style='width:" + dynamicPageWidth+"px;"
		viewingPageInnerHTML += " height:" + dynamicPageHeight +"px;'>"		
		}
	else if(isHiResolution){
		currentPageSrc = root.pdfURL+ pageIndex + ".pdf";
		viewingPageInnerHTML = "<object id='objectPDF'  type='application/pdf' data='" + currentPageSrc + "' style=' border:0px red dotted; width:" + dynamicPageWidth+"px;"
		viewingPageInnerHTML += " height:" + (pageDisplayHeight + marginAdj)+"px; -webkit-transform: scale("+dynamicPageScale+"); "
		viewingPageInnerHTML += "-webkit-transform-origin: top left; left:"+marginAdj+"px; top:"+marginAdj+"px;'></object>"		
		}
	else {
		currentPageSrc = swfRootURL + pageIndex + ".swf";		
		dynamicPageScale = fullScale
		viewingPageInnerHTML = "<object id='objectSWF' type='application/x-shockwave-flash' data='" + currentPageSrc + "' style='width:" + pageDisplayWidth+"px;"
		viewingPageInnerHTML += " height:" + pageDisplayHeight  +"px;'></object> "
		//pdfObjInnerHTML += "-webkit-transform-origin: top left;'/>"
				
	}
					
	//trace(currentPageSrc+" "+val)
		
	if(val!=1){
		//viewingPage.innerHTML = ""
		$('#viewingPage').html(viewingPageInnerHTML)
		//trace("loadingPDF")
	}
		
	
	pageMarginLeft = ($(window).width() - dynamicPageWidth) / 2
	
	var pm = Math.max(parseInt(pageMarginLeft-40),0)
	
	$('#nextPgBtn').css({
		right:pm+"px",
		height:($(window).height()-(fudgeAmt)-8)+"px",
		top:parseInt(toolbarTopHeight+4)+"px",
		width:"22px"
		
	})
	
	var pm = Math.max(parseInt(pageMarginLeft-46),0)
	$('#prevPgBtn').css({
		left:pm+"px",
		height:($(window).height()-(fudgeAmt)-8)+"px",
		top:parseInt(toolbarTopHeight+4)+"px",
		width:"22px"
		
		
	})
			
	currentLeft = pageMarginLeft;

	//trace("currentLeft:"+currentLeft);
	
	$('#viewingPage').css({
		left:pageMarginLeft + "px",	top: "0px",
		width: dynamicPageWidth+ "px",
		height: pageDisplayHeight+ "px",	
		webkitTransform: "scale(1)"})
	
	$('#stackedPages').css({
		height: (pageDisplayHeight-4)+"px",
		right: (pageMarginLeft-8)+"px",
		top: "2px"})
			
	$('#fadeNextDiv').css({
		left: (pageMarginLeft) + "px",	
		width: dynamicPageWidth+ "px",
		height: pageDisplayHeight+ "px",
		webkitTransform: "scale(1)"})
		
	$('#fadePrevDiv').css({
		left: (pageMarginLeft) + "px",	
		width: dynamicPageWidth+ "px",
		height: pageDisplayHeight+ "px",
		webkitTransform: "scale(1)"})
	
	//fadePrevDiv.style.display = "none";
	//fadePrevDiv.style.border ="0px green solid";
		
	$('#annotsDiv').css({
		width: dynamicPageWidth+ "px",
		height: dynamicPageHeight+ "px",	
		left: pageMarginLeft + "px",
		top: "0px",		
		webkitTransform: "scale(1)",
		border: "1px red dotted;",
		display: "block"})
	
	$('#annotLayer').css({top: "0px"})
	
	if (parseInt(pageDisplayWidth) != parseInt(getDimensions()[0] / pageAR)) {
		//trace(pageDisplayWidth + " ** "+ parseInt(getDimensions()[0] / pageAR))
		//placeAnnotations('annotsDiv','updateDisplay');
	}
	
	$('.alertDiv').css({
		left: (($(window).width() - 300) / 2),
		right: (($(window).width() - 300) / 2),
		top: '-100px'})

	var adjustedPageDisplay = (winOrientation == 0) ? pageDisplayHeight : pageDisplayWidth;
	orientationScale = (pageDisplayHeight / dynamicPageHeight).toFixed(2)
	centerPointX = ($(window).width() / 2)
	centerPointY = (($(window).height()) / 2) - toolbarTopHeight


	if (cartTotal > 0) {
	
	var prefix = (!showToolBars) ? defaultClickEvent+" to view cart $"+cartTotal  : "$"+cartTotal
		$(cartTotalDiv).html(prefix)
		//showHideCartTotal('block')
	} else {
		//showHideCartTotal('none')
	}
	
	updateCallouts()
}


function login() {

	var u = $('#uname').val()
	var p = $('#pwd').val()
	
	trace("login")
	
	if (u =='' || p == '') {
		showHideAlert(UI['Please_enter_a_valid_user_name_and_password_'],"block",null);
		return;
	}
	
	var table = (magazoom.registrationDS.toString().indexOf("http")<0) ?  "registrations" + magazoom['pubID'] : "registrations";
	var Rurl = magazoom.registrationDS;
	
	
	var params = {
		username: u,
		password: p,		
		table: table,
		contentType: 'text/html',
	}
	
	trace(params)
	var url = $('base').prop('href') + Rurl;
	
	trace(url);
	 		
	if (u !='' && p != '') {
		$.ajax({
			type: 'POST',
			url: url,
			data: params,				
			success: verifyLogin,
			error: function(XMLHttpRequest, textStatus, errorThrown) {
				trace(XMLHttpRequest.responseText)
				trace(textStatus);
				trace(errorThrown);
			}
		})
	} else {
		
		showHideAlert("Please enter a valid user name and password ","block",null)
	}
}

function toggleSettings(event) {

	//trace(event)
	
	$('#'+event.target.id).removeClass('offButton')
	$('#'+event.target.id).removeClass('onButton')
		
	
	if (event.target.id == 'userbandwidth') {
		if (settingsModel.userbandwidth == "1") {
			$('#userbandwidth').addClass('offButton')			
			settingsModel.userbandwidth = "0"
		} else {
			$('#userbandwidth').addClass('onButton')			
			settingsModel.userbandwidth = "1";			
		}
	}
	if (event.target.id == 'showToolTips') {
		if (settingsModel.showToolTips == "1") {
			$('#showToolTips').addClass('offButton')			
			settingsModel.showToolTips = "0"
		} else {
			$('#showToolTips').addClass('onButton')			
			settingsModel.showToolTips = "1"
		}
	}
	/*
if (event.target.id == 'zoomMethod') {
		if ($('zoomMethod').className == 'switchLeft') {
			$('zoomMethod').className = 'switchRight'
			settingsModel.zoomMethod = "1"
		} else {
			$('zoomMethod').className = 'switchLeft'
			settingsModel.zoomMethod = "0"
		}
	}
*/
	trace("settingToolbar:"+$('#toolbar3D').hasClass('onButton'))
	
	
		
	if (event.target.id == 'richEffects') {
		if (settingsModel.richEffects == "1") {
			$('#richEffects').addClass('offButton')			
			settingsModel.richEffects = "0"
		} else {
			$('#richEffects').addClass('onButton')			
			settingsModel.richEffects = "1"
			}
	}
	if (event.target.id == 'toolbar3D') {
			trace("is toolbar3D")			
		if (settingsModel.toolbar3D == 1) {			
			$('#toolbar3D').addClass('offButton')
			settingsModel.toolbar3D = toolbar3D  = 0			
		} else {			
			$('#toolbar3D').addClass('onButton')
			settingsModel.toolbar3D = toolbar3D =  1			
		}
		setToolbarStyle()
	}
	if (event.target.id == 'playSound') {
		if (settingsModel.playSound ==  "1") {
			$('#playSound').addClass('offButton')			
			settingsModel.playSound = "0"
			//setToolbarStyle()
		} else {
			$('#playSound').addClass('onButton')
			settingsModel.playSound =  "1"
			//setToolbarStyle()
		}
		snd.play();
	}
	//document.getElementById('userbandwidth').className = 'onButton'
	//trace(document.getElementById('userbandwidth').className)
	//trace(settingsModel.userbandwidth)
}

function verifyLogin(xml) {

	var vrfd = $(xml).find('accountID').text()+$(xml).find('username').text();
	//trace("vrfd:" + xml)
	var msg = $(xml).find('message').text();
	var valid = $(xml).find('valid').text();
	
	trace(xml)
		
	if(msg != '' ){
		//trace("msg:"+msg)
		showHideAlert(UI['Sorry_your_login_credentials_are_not_found']+"<br>"+msg, "block",showHideLogin(1))
		return;
		
	}
	if (vrfd || valid=='1') {
	
		settingsModel.userauthorized = true;
		
		showHideLogin()
		
		isLoaded = 1
		
		updateDisplay();
		
		if(magazoom['pageViewLimit'] == 0){
		
			trace("magazoom['pageViewLimit']:"+magazoom['pageViewLimit']);
		
			setTimeout(function() {showHideLoading()}, 500)
			//$('.auth').fadeIn(1000);

		}
		
		$('.auth').fadeIn(1000);

	} else{
		showHideAlert(UI['Sorry_your_login_credentials_are_not_found']+" "+msg, "block",null)
		

	}
}

function sliderChange(e) {
	var p = $('#pageSlider').slider('value');
	
	setupNextPrev(p)
	
	jumpToPage(p)		
	
}

function updateSlider(p,t) {
		
	if(config.orientationFormat=="P"){
		var indicatorTxt = (p <= magazoom.pageOffset-0)? intToRoman(p-1) : p - magazoom.pageOffset -0
		indicatorTxt += " of "+ (magazoom.npages-magazoom.pageOffset)
		$('#spreadsIndicator').val(indicatorTxt).css({display :'block'})	
		var w =  $(window).width()*.8;
		var x = $(window).width()*.10	
		var incr = w/(magazoom.npages-1)	
		var calcLeft = parseInt((p-1)*incr)-10
		var newLeft = Math.min(calcLeft	,w-10)
		//pageSliderButton.style.left = newLeft+"px";
		$('#pageSliderProgress').css({width : Math.max(0,newLeft)+"px"});
		
	}else{
		var sliderPos = currentSpreadIndex/(spreadsNumbering.length-1)
		var newLeft = parseInt($('#spreadSlider').width() * sliderPos)-20;	
		//trace("newLeft:"+$(spreadSlider).width()+ " "+ sliderPos)				
		//spreadSliderButton.style.left = newLeft+"px";
		$('#spreadSliderProgress').css({width : Math.max(0,newLeft)+"px"});								
		$('#spreadsIndicator').css({display :'block'})															
		$('#spreadsIndicator').val(spreadsLabels[currentSpreadIndex]+ " of "+(magazoom.npages-magazoom.pageOffset))
	}		
	
}


function notifyVersionChange(){
	//trace("version:"+settingsModel.version+ " "+ version)
	//trace("version:"+ version)
	return;
	
	if((settingsModel.version < version || !settingsModel.version) && databaseEnabled){			
	var msg = "Your App has been updated to version "+version;
		settingsModel.version = version
		showHideAlert(msg, "block",'saveAccountSettings(1)')			
	}
			
}

function updateCallouts(){
	//trace("updatingcallouts:"+bookmarkCount)
	//trace("updatingcallouts:"+videoCount)
	
	if(bookmarkCount >= 1){
		var charCount = bookmarkCount.toString().length
					
		var w = charCount*12;
		var rw = charCount*12;  			
		var y = charCount*-2
		
	  $('#bookmarkCallout').html(bookmarkCount).
	 	css({display : "inline-block",
	 			width : w+"px",	 		 		 		 	
	 		 	float:"center",
	 		 	top : (buttonStyle==1) ? "-6px" : "-14px",
	 		 	left : (buttonStyle==1) ? "-2px" : "-2px"
	 		 	})	 		 	
	 }
	 else{
		$('#bookmarkCallout').css({display:"none"});
	 }
	 
	 if(videoCount > 0){ 
       
       	var charCount = videoCount.toString().length
		var w = charCount*12;
		var rw = charCount*14;  
		var y = charCount*-2;
						 
	 	$('#videoCallout').html(videoCount).css({
		 	display : "inline-block",
		 	top : (buttonStyle==1) ? "-6px" : "-14px",
		 	left : (buttonStyle==1) ? "-2px" : "-2px",
		 	width : w+"px"
	 	}) 	 		
	 }
	 else{
		 	$('#videoCallout').css({display : "none"});
	 }	
	 
	 
}

function setBookmarks(ref){

	var bm = bookmarksList;
	
	updateCallouts()	
			
	bookmarksHTML  = "<div style='border:0px red solid; touch; top:60px; max-height:"+parseInt($(window).height()-fudgeAmt-100)+"px;position:relative; -webkit-overflow-scrolling-y: overflow-x:hidden; overflow-y:scroll;'>"
				
				
	bookmarksHTML += (bm.length >= 1) ? "<table border='0' class='bookmarksTable' style='width:300px;  -webkit-overflow-scrolling-y: touch;' >" : ""
		
	for(var i=0; i < bm.length; i++){
		
		var thumbnailClass = (mzID == bm[i][2] && pageIndex == bm[i][1]) ? 'thumbnailMediumGlow' : 'thumbnailMedium';			
			
			var pageNumDisplay = (bm[i][1] <= magazoom.pageOffset)? intToRoman(bm[i][1]) : bm[i][1] - magazoom.pageOffset;
			bookmarksHTML  += "<tr>"
			bookmarksHTML  += "<td >"
			bookmarksHTML  += "<div class='devBorder' style='height:200px; border-color:green; width:300px; display:inline-block;'>"
			bookmarksHTML  += "<div class='verticalTab' style='top:150px; line-height:12px; left:40px; margin-right:5px;display:inline-block;'>"
			bookmarksHTML  += bm[i][4]
			bookmarksHTML  += "</div>"
	     	bookmarksHTML  += "<div class='devBorder' style='text-align:center; width:180px;position:relative; top:-30px; left: 20%;'><img src='"+bm[i][3]+"'  class='"+thumbnailClass+"' data-object=touchScroll(event,'goToBookmark("+ i +")')>"
	     	bookmarksHTML  += "<div style='position:absolute; left:40%; min-width:25px; top:45%; opacity:.8; z-index:20;' class='numbering buttonObject devBorder' data-object=touchScroll(event,'goToBookmark("+ i +")')>"+pageNumDisplay+"</div></div>"
	     	bookmarksHTML  += "<div class='devBorder' style='position:relative; display: inline-block; left:250px; top:-140px; width:50px;'><img src = 'images/trashLg.png' width=25 class='buttonObject' data-object=removeBookmark('"+ bm[i][0] +"')></div>"
	     	bookmarksHTML  += "</div>"
	     	bookmarksHTML  += "</td></tr>"
	     	
	}
	bookmarksHTML  += (bm.length >= 1) ?  "</table><div style='height:5px;'></div>"	: ""//bookmarksHTML  = pagesHTML
	
	
	
	//if(ref){
			
		$('#contentDiv').html((bm.length >= 1) ? createBookmarkHeader() + bookmarksHTML : createBookmarkHeader())
		
	//}else{
		
	//}
			
}

function createBookmarkHeader(){
	if(spreadsShowing == 1 && currentSpreadIndex>0){
					var bmHTML  = "<div style='position:absolute; height:42px; width:100%; border:0px green dotted; margin-bottom:5px;  margin-left:auto;margin-right:auto; top:20px; text-align:center; z-index:200006;'>"
					bmHTML  += "<button class='gradientGray' style='width:100px;height: 40px;padding:0px;' data-object='addBookmark(0)' >add left</button>"
					bmHTML  += "<button class='gradientGray' style='width:100px;height: 40px;padding:0px;' data-object='addBookmark(1)' >add right</button>"
					bmHTML  += "<button class='blackGlass buttonObject' style='height: 40px;' data-object=showHideDynDiv('none') >continue</button>"
					bmHTML  += "</div>"
				
			}else{
					var bmHTML  = "<div style='position:absolute;  height:42px; width:100%; border:0px green dotted;  margin-left:auto;margin-right:auto; top:20px; text-align:center;'>"
					bmHTML  += "<button class='gradientGray' style='height: 40px;' data-object='addBookmark()' >add this page</button>"
					bmHTML  += "<button class='blackGlass' style='height: 40px;' data-object=showHideDynDiv('none') >continue</button>"
					bmHTML  += "</div>"
			}
	return bmHTML;
}
function deleteAllBookmarks(){
	
}

function removeBookmark(i){

	deleteRecord('bookmarks',i)
	//trace('deleting bookmark')
	getBookmarks(true);		
}

function cachingPages(i) {
	//return;
	var NUM_CACHE_PAGES_ADVANCE = 1
	// The number of pages to be cached in advance of the user's direction
	var lr = 0
	
	if(i<1) i = 1;
	
	if (pageIndex > i && i > 0) {
		lr = 1
	}
	
				
			if (i < magazoom.npages & i > 1){ 
			
				var imgSrc = root.thumbnailURL + (i+1) + ".gif";
				
				var pdfSrc = root.pdfURL + (i-0+1) + ".pdf"
				var pdfObj = "<img id=\'preloadPDFA" + (i-0+1) + "\' src="+ pdfSrc+">";
				
				cacheDivNext.innerHTML += (settingsModel.userbandwidth=='1')? pdfObj : ""
				
				var thumbSrc = root.fullURL + (i-0+1) + ".png"
				var thumbObj = "<img id=\'thumbA" + (i+1) + "\' src="+ thumbSrc+">";
				
				cacheDivNext.innerHTML +=  thumbObj
				
				//trace("cachingNext:" + (i+1) + "page:" + pdfSrc + " " + thumbSrc)
				
				var pdfSrc = root.pdfURL + (i-0-1) + ".pdf"
				var pdfObj = "<img id=\'preloadPDFB" + (i-1-0) + "\' src="+ pdfSrc+">";
				
				cacheDivPrev.innerHTML += (settingsModel.userbandwidth=='1')? pdfObj : ""
									
				var thumbSrc = root.fullURL + (i-1-0) + ".png"
				var thumbObj = "<img id=\'thumbB" + (i+1) + "\' src="+ thumbSrc+">";
				
				 cacheDivPrev.innerHTML += thumbObj
				
												
				//trace("cachingPrev:" + (i-1) + "page:" + pdfSrc + " " + thumbSrc)
															
				//$(cacheDivPrev,cacheDivNext).imagesLoaded( function( $images, $proper, $broken ) {
						//trace( $images.length + ' images total have been loaded' );
						//trace( $proper.length + ' properly loaded images' );
						//trace ($broken.length + ' broken images' );
						//});
				}
					
}

function navigateHistory(dir){
	trace(dir)
	if(spreadsShowing == 1){
		if(spreadHistory.length>0){
			if(!spreadHistoryIndex){
				spreadHistoryIndex=spreadHistory.length+dir
			}
			if(spreadHistoryIndex>0 && dir < 1){
				spreadHistoryIndex--
				$('.magazine').turn('page', spreadHistory[spreadHistoryIndex])
			}else if(spreadHistoryIndex<spreadHistory.length && dir > 0){
				spreadHistoryIndex++
				$('.magazine').turn('page', spreadHistory[spreadHistoryIndex])
			}
		
		}
		trace(spreadHistoryIndex)
						
	}else{
			
		if(pageHistory.length >0){
			if(!pageHistoryIndex){
				pageHistoryIndex=pageHistory.length+dir
			}
			if(pageHistoryIndex>0 && dir < 1){
				pageHistoryIndex--
				goToPage(pageHistory[pageHistoryIndex],true)
			}else if(pageHistoryIndex<pageHistory.length && dir > 0){
				pageHistoryIndex++
				goToPage(pageHistory[pageHistoryIndex],true)
			}
		}
	}
}

function getPageName(p){
	var res = "pg"+p
	
	if(!tocPages){
		return res
	}
	for (var i=0;i<tocPages.length;i++){
		if(tocPages[i][0] == p){
			res = tocPages[i][1]+" - pg"+p;
			break;
		}
	}
	return res;
}

function getPages() {
	trace("getting pages")
	//alert(pu) 
	$.ajax({
		type: 'GET',
		url: pu,
		crossDomain: false,
		dataType: 'xml',
		success: setPageArr
	})
}

function setPageArr(xml) {

	trace('settingPages')

	var p = 0;
	var spreadItem = ''
	var plab = $("<label />" ,{
		text:UI['Pages'],
		class:'pagesLabel'
	})
	
	
	config.pages = $("<ul class='pagesContent'/>")
	config.pages.append(plab)
	
	$(xml).find('record').each(function() {
		pagesArr.push($(this).find('recordID').text());
		
		var pagItem = $("<img  />").addClass('thumbnail dropshadow pageItem')
		var src = (magazoom.npages<60) ? root.fullURL+(p+1)+".png": root.thumbnailURL+(p+1)+".gif"
		
		pagItem.attr('onerror',"img404(this)")
		pagItem.prop("src",src)
		pagItem.prop("title",'')
		pagItem.attr('data-object',"touchScroll(event,'goToPage("+p+")')")
		
		if(p==0){
			var pNum = (p <= magazoom.pageOffset)? intToRoman(p) : p  - magazoom.pageOffset;
			//trace(pNum,intToRoman(p))				
			spreadsNumbering.push(p+1)
			spreadsLabels.push(pNum)
			
			pagItem.prop("title",UI['GoToPage']+" "+pNum)
			
			var label = $("<div class='numbering'/>").html(pNum)
			
			spreadItem = $("<li />").addClass('spreadItem').css({
				textAlign:"center"
				})
			spreadItem.append(label)
			spreadItem.append(pagItem)
			config.pages.append(spreadItem)	
							
		}
		if( p % 2 == 1){
			spreadItem = $("<li />").addClass('spreadItem').css({
				textAlign:"center",
				width:"100%"
				})
				//trace ("first page of spread" + p)
				var pNum = (p < magazoom.pageOffset)? intToRoman(p) : p+1 - magazoom.pageOffset;
				var pNum2 = (p+1 < magazoom.pageOffset)? intToRoman(p+1) : p+2 - magazoom.pageOffset;
				var label = (p < magazoom.npages-1 )? $("<div class='numbering'/>").html(pNum+"-"+pNum2) : $("<div class='numbering'/>").html(pNum) 
				
				pagItem.prop("title",UI['GoToPage']+" "+pNum)
				//spreadsLabels.push(pNum+"-"+pNum2)
				spreadItem.append(label)
				spreadItem.append(pagItem)
		}			
		if(p % 2 == 0 && p> 0){	
			var pNum = (p <= magazoom.pageOffset)? intToRoman(p-1) : p - magazoom.pageOffset;
			
			var pNum2 = (p+1 <= magazoom.pageOffset)? intToRoman(p) : p+1 - magazoom.pageOffset;
			//trace(pNum+"-"+pNum2)
			
			pagItem.prop("title",UI['GoToPage']+" "+pNum2)
			spreadItem.append(pagItem)
			config.pages.append(spreadItem)	
			spreadsLabels.push(pNum+"-"+pNum2)
							
			if(p<magazoom.npages) spreadsNumbering.push((p)+"-"+(p+1)) 
		}
			spreadItem.append(pagItem)
							
			p++;
			var w = p*100;
			$(".pagesContent").css({width:w})
			
			config.pages.append(spreadItem)
			
			
	});
	
	
	spreadsNumbering.push(magazoom.npages)
	spreadsLabels.push(magazoom.npages-magazoom.pageOffset)
	
	//trace(spreadsNumbering.join(","))
	
	var nextPDF = root.fullURL +  "2.png"  ;
	var fadeNextInnerHTML = "<img src="+ nextPDF+" width='100%'/>"
			
	if(pageIndex<magazoom.npages){
		$('#fadeNextDiv').html(fadeNextInnerHTML)
	}
	
	if(pageNum>1){
		pageIndex = pageNum 
		}
	
	setTimeout(function(){loadApp()},1500)
	
	
	setTimeout(function(){goToPage(pageNum);updateSlider(pageNum)},timeDelay+2000)
	
	
						
}


function getArchives() {
	trace("getting archives")
	//alert(pu) 
	var d = {}
	
	if(config.domain == magazoom.subdomain){
		d['subdomain'] =  magazoom.subdomain
	}else{
		d['clientID'] = magazoom.clientID
	}
	trace(d)
	
	$.ajax({
		type: 'POST',
		data:d,
		url: 'php/getArchives.php',
		crossDomain: false,
		dataType: 'json',
		success: setArchives
	})
}

function setArchives(data){
		
		//return;
		
			$(".pagesDiv").empty();
			
			var htm = ""
			var lastP = '';
		
			var w = (config.isMobile) ? 120 : 200 ;
			var h = (config.isMobile) ? 180 : 240 ;
			
			var tcnt = 0 

			var i = 0
			var mt = new Array()
			
			config.portalItems = data.root
		
			var plab = $("<label />" ,{
				text:UI['More'],
				class:'moreLabel'
			})
	

			config.archives = $("<ul class='pagesContent'/>")
			config.archives.append(plab)
			
			//trace(data.root)
			$.each(data.root, function(){
				var dataObject = {}
					//trace("___________________")
					//trace(i)
					$.each(this['entry'],function(key,val){
							dataObject[key]= val.replace(/[']/g,"\'")
							//trace(key+":"+val)
					})
					
					var maxTitle = (config.isMobile) ? 24 : 40;	
					var t = dataObject['pubTitle']+" "+dataObject['title']
					var trunc  = t
					if(dataObject['title'].length > maxTitle){
						var ls =  dataObject['title'].length
						trunc = dataObject['pubTitle']+" " +dataObject['title'].substring(0, (maxTitle/2))+ '...'+ dataObject['title'].substring(ls-(maxTitle/2),ls)
					}
					var p = dataObject['pubID']
					var ctlg = (dataObject['productLookup']!='')? 1 : 0
					var m = dataObject['recordID']
					var d = dataObject['meta_description']		
					var c= dataObject['clientID']
					var cmp = dataObject['company']
					var pr = dataObject['registration_required'] > 0 
					//trace(pr)
					var n = dataObject['count']-0
					tcnt += n
					var st = (s) ? "?search="+searchTxt : "";
					var l = "http://"+config.domain+"/HTML5/"+dataObject['seo_title']+st
					var s = "../../publish/"+c+"/"+p+"/packages/"+m+"/package/thumbs/"+m+"_1.gif"
					var pdf = "publish/"+c+"/"+p+"/packages/"+m+"/package/pdf/"+m+".pdf"							
					
					config.portalItems[i]['entry']['pdf']= pdf;
					config.portalItems[i]['entry']['link']= l;
					
				if(n){
					var img = new Image();
					img.onload = function() {
						var val = ((this.height/2.1)*-1).toFixed(0)+"px"
						//trace(this.num+":"+val)
						var cls = ".n"+this.num
						//$(cls).css({top:val})
					}
				
				img.src = s;
				img.num = i	
				}		
			
				dobj="goToURL('"+l+"')"
				
				trace(data.root.length)
				
				if(m != magazoom.mzID){	
					htm += "<li style='display:inline-block;margin-top:10px;'>"; //li						
					htm +="<img src='"+ s +"' data-item='"+i+"' title='"+t+"' data-action='touchScroll(event,goToURL(\""+l+"\"))' class='thumbnail' >"
					htm += "</li>" 
					i++;
				}else if(data.root.length<2){
					$('.archiveIcon').hide()
				}
				
							
				})
	
				var w = i*80;
				
				$(".pagesContent").css({width:w})
				//trace(htm)	
						
				config.archives.append(htm);
				
				
				//showHideLoading()

}


function setNextPrevPages(){


	if(prevViewingPage == root.fullURL + (pageIndex-0+1) + ".png" ){
		
		return;
	}
	
	var nextViewingPage = root.fullURL + (pageIndex-0+1) + ".png"  ;
	
	trace(nextViewingPage)
	trace(prevViewingPage)
	
	var fadeNextInnerHTML = "<img src="+ nextViewingPage+" width='100%'/>"
	
		trace("pageIndex:"+pageIndex)
		if(pageIndex != 1){
			prevViewingPage = root.fullURL + (pageIndex) + ".png"  ;
			var fadePrevInnerHTML = "<img src="+ prevViewingPage+" width='100%'/>"
			$('#fadePrevDiv').html(fadePrevInnerHTML)
			//fadePrevDiv.style.display = "block"
			}
		else{
			$('#fadePrevDiv').html("")
		}

		if(pageIndex<magazoom.npages){
			$('#fadeNextDiv').html(fadeNextInnerHTML)
			}

}

function getYouTube() {
	youTubeHTML = "<div style='text-align:center ;position:relative; top:20px; left:10px; width:90%;'><span style='margin-left:10px; vertical-align:middle; font-size:16px; white-space:nowrap;' >" 
	youTubeHTML += "<b>Our Videos on </b></span>"
	youTubeHTML += "<img src='images/youTube.png' style='text-align:center; width: 50px; vertical-align:middle; '></div>"
	
	youTubeHTML += "<div style='border:0px red solid; -webkit-overflow-scrolling: touch; top:20px;max-height:"+parseInt($(window).height()-fudgeAmt-100)+"px; position:relative; overflow-y:scroll;'><table id='youTubeTable' border=0 >"
	
	var ytID="";
	var tle = "";
	var description="";
	var action = "";
	var thumbnail = "";	
		videoCount = 0;
	
	trace("gettingyouTube"+" http://www.magazooms.com/proxyRequest.php?url="+magazoom.youtube_query)
	
	var u = "http://"+config.domain+"/proxyRequest.php?url="+magazoom.youtube_query+"&startindex=1&max-results=200";	
			
	$.ajax({
		type: 'GET',
		url: u,
		crossDomain: false,
		dataType: 'xml',
		success: function(data){						
			$(data).find('entry').each( function(){
				$('*', this).each(function(i,e){
	        //trace(e.tagName+'='+$(e).text())
	        
	        if(e.tagName == 'media:group'){
		        	//description = $(e).text().toString().substring(0,150);
		        	//trace(description)
		       }
		       if(e.tagName == 'title'){
		       		tle = $(e).text();
		       		//trace(tle)
		       }
		       if(e.tagName == "yt:videoid"){
			      	 ytID =  $(e).text();
			      	 //trace("***"+ytID)
		       }
		    thumbnail = "http://i.ytimg.com/vi/" + ytID + "/default.jpg";
		    //trace(">>>"+thumbnail)		
			action = "touchScroll(event,showYouTube('" + ytID.toString()+"'))"; 
			
			})
			
			if(ytID!=''){
				youTubeHTML += "<tr>"
				youTubeHTML += "<td><div style='background-image:url("+thumbnail+");width:100px;height:80px;'><img class='buttonObject' data-object=" + action + " src='images/VideoButton2.png' style='position:relative;top:20px;left:25px;'></div></td>"
				youTubeHTML += "<td style='width:220px;'><b>" + tle + "</b><br>"+description+"</td>";
				youTubeHTML += "</tr>\r";				
			}
			videoCount++;
			
		
		
		
	});
		        
      
      youTubeHTML += "</table>\r</div>";
      
      trace(youTubeHTML);
      
     } 
     })    

     updateCallouts()
      
      
}

function getElementByNodeName(parentNode, nodeName){   
    var colonIndex = nodeName.indexOf(":");
    var tag = nodeName.substr(colonIndex + 1);
    //trace(tag)
    var nodes = parentNode.getElementsByTagNameNS("*", tag);
    for (var i = 0; i < nodes.length; i++)
    {
        if (nodes[i].nodeName == nodeName) return nodes[i]
    }
    return undefined;
}


function getToc() {
	trace("getting toc")
	var data = {}
	data['mzID'] = magazoom.mzID
	$.ajax({
		type: 'POST',
		data:data,
		url: 'php/getTOCjson.php',
		crossDomain: false,
		dataType: 'json',
		success: setTocJSON,
		error:function(data){
		trace("no toc");
		$('.tocIcon').hide()
		}
	})
}

function setTocJSON(data) {

	tocPages = Array();
	
	tocList  = "<div class='tocDiv'>"
	
	if(!data) return
	
	var curSection = 0
	$.each(data ,function() {
		var section = this['section'];
		var description = this['title'];
		var pageNum = this['pageSeq'];
		tocPage = this['tocPage'];
		
		tocData[pageNum] = this['seo_topic'];
		
		//var pageOffset = $(this).find('pageOffset').text();
		var action = " data-object=touchScroll(event,'goToPage(" + pageNum + ")') ";
		if (curSection !== section) {
		
			tocList += (!curSection) ? "<ul class='tocUL'><li class='T1'>" + section + "</li>\r" : "</ul><ul class='tocUL'><li class='T1'>" + section + "</li>\r"  ;
		
			curSection = section;
			tocList += "<li class='buttonObject T2' "+ action+" >" + description + "</li>";
			
		} else {
			tocList += "<li class='buttonObject T2' "+ action+" >" + description + "</li>";			
			
		}
		tocPages.push([pageNum,description])
	});
	tocList += "</ul></div>";
}


function getWords() {

//trace("searchTxt:"+searchTxt);
	
if(searchTxt!='search' && searchTxt !== ''){

	var pID;
	
	if(config.orientationFormat=="P"){
		pID = pagesArr[pageIndex-1]
	}else{	
		var pIDarr = spreadsNumbering[currentSpreadIndex].toString().split('-')
			
		if(pIDarr.length > 1){
			pID = pagesArr[pIDarr[0]-1]  + "," + pagesArr[pIDarr[1]-1]		
		}else{
			pID = pagesArr[pIDarr-1]		
		}
	}
	
	//trace(wu + pID + "&searchTxt=" + searchTxt)
	
	$.ajax({
		type: 'GET',
		url: wu + pID + "&searchTxt=" + searchTxt,
		crossDomain: false,
		dataType: 'text',
		success: function(xml) {
			var xml = xml;
			var typ = 'words';
			parseAnnotations(xml, typ)
		}
	});
	
	}else{
		if(annotationsArr.length>0) placeAnnotations('annotsDiv','getWords')
	}
	//trace(wu+pageIndex+"&searchTxt="+searchTxt)
}


function orientationChange() {}

$(document).on('orientationchange', window, function(e) {
	
	if (window.orientation == null) return;
	if (winOrientation != window.orientation) {
		winOrientation = window.orientation
		var LR = (pageIndex % 2 == 0) ? 1 : 0;
		
		setupScales(magazoom.pageWidth,magazoom.pageHeight)
			
		//fadePrevDiv.style.display = "none"
		//fadeNextDiv.style.display = "none"
		
		trace("orientationChange")
		
			if(!showToolBars){
				//trace("showToolBars:"+showToolBars)
				toggleFullScreen()
			}
		
			updateDisplay(0);
		trace("orientation:"+winOrientation)
		
		var O = Math.abs(winOrientation)	;
		
		if(config.opener){
			if(O != 90){
				$("#openerDiv").hide()
			}else{
				$("#openerDiv").show()
			}
		}				
		
		
		//placeAnnotations('annotsDiv','orientationChange')
	}
});

function goToTocPage() {
	//alert(tocPage)
	if (magazoom.tocPage > 0) goToPage(magazoom.tocPage)
}

function jumpToPage(i){

	/*
	if(i > pageIndex){
		$(annotsDiv).animate({left: $(window).width()*-1},1000)						
		$(viewingPage).animate({left: $(window).width()*-1},1000,function(){goToPage(i)})
	}else{
		$(annotsDiv).animate({left: $(window).width()},1000)						
		$(viewingPage).animate({left: $(window).width()},1000,function(){goToPage(i)})
	}*/
	
	goToPage(i)

}

function goToPage(i,history) {
	
	thisInt = window.clearInterval(thisInt)
	
	if (parseInt(i) < 1 || parseInt(i) > magazoom.npages) {
		showHideAlert("enter a valid page # please !", 'block')
		return;
	}
	trace(tocData[i])
	if(tocData[i])
	modifyURL(tocData[i])
	
	
	logPageTurn(pageIndex);
		
	if(!history) pageHistory.push(i);
	
	pageIndex = i;	
			
	updateSlider(i,"pageSliderButton")
		
	var lr = -1
	if (pageIndex > i) {
		lr = 1		
		}

	
	if (!pageIndex) {
		pageIndex = 1;		
	}
		
			
	if (i > 1) cachingPages(i)
	
	if(pageIndex > 1 && config.opener){
		$('#openerDiv').css({"zIndex":"0",display:"none"})
	}else if(pageIndex < 1){
		if(config.opener){$('#openerDiv').css({zIndex:"51",display:"block"})}
		}
	
	$('#annotsDiv').empty()
			
	if(isLoaded == 0){
		setupScales(magazoom.pageWidth,magazoom.pageHeight)
	}
	
	if(config.orientationFormat=="L"){
		$('.magazine').turn('page', i);
		

		if(searchTxt){
			 //var elem = $('.p'+i);
			 
			//addSearchHighlights(i,elem)
			
			if(i >= 1 && i <= magazoom.npages){
				var oi = ($('.p'+i).prop('class').indexOf('odd')>-1) ? i-1 : i+1;
				elem = $('.p'+oi);
				trace("highlights:"+$(elem).children('.highlight').length)
				if($(elem).children('.highlight').length < 1)
				addSearchHighlights(oi,elem)
			}
			
		}

		
		trace(c)
	}			
	updateDisplay()
				 		
}

function logPageTurn(p){

	var duration  = null;
	
	if(lastGoToPageTime !=''){
			duration = getLapsedSeconds(lastGoToPageTime)
	}
						
	//traceLog(duration,1);
						
	if(duration>0){		
		logEvent('page view',getPageName(p),magazoom.seo_title,duration,false);
	}
						
	lastGoToPageTime = (new Date).getTime();
						
}
function nextPgBtnTouch(e){
	e.preventDefault();
	
	thisInt = window.clearInterval(thisInt)
	
			
	thisInt = self.setInterval(function(){
	if(pageIndex<magazoom.npages){
			pageIndex++
			updateSlider(pageIndex)
		}								
	},100)
	
}

function prevPgBtnTouch(e){

	e.preventDefault();
	
	thisInt = window.clearInterval(thisInt)
			
	thisInt = self.setInterval(function(){
	if(pageIndex > 1){
		pageIndex--
		updateSlider(pageIndex)
		}								
	},100)
	
}

function nextPrevBtnUp(){
	
	thisInt = window.clearInterval(thisInt)
	goToPage(pageIndex)
}

function nextPage() {

	
	if (magazoom.npages >= pageIndex - 0 + 1) {
		//pageIndex++;
		
		//snd.play();
		
		setNextPrevPages()
		
		$('#fadeNextDiv').css({display : "block"})
		$('#fadePrevDiv').css({display : "none"})	
		
		if(settingsModel.richEffects == '1'){
		$('#annotsDiv').animate({left: $(window).width()*-1},500)
		$('#viewingPage').animate({left: $(window).width()*-1},500,function(){	
				goToPage(pageIndex - 0 + 1)
				})
			}	
		else{
			goToPage(pageIndex - 0 + 1)
			}
		//top.botBar.document.getElementById('pageDisplay').value = pageIndex
	}
	
}

function prevPage() {
	if (pageIndex > 1) {
		//pageIndex--
		snd.play();
		
		setNextPrevPages()
		
		$('#fadeNextDiv').css({display : "none"})
		$('#fadePrevDiv').css({display : "block"})
		
		
		if(settingsModel.richEffects == '1'){
				$('#annotsDiv').animate({left: $(window).width()},1000)						
				$('#viewingPage').animate({left: $(window).width()},1000,
				function(){	
					goToPage(pageIndex - 1)
						})
			}
			else{
				goToPage(pageIndex - 1)
				}
		
		//top.botBar.document.getElementById('pageDisplay').value = pageIndex
	}
}

function fastScrollForwardPages(){

		
		if(pageIndex < magazoom.npages){
			
			if($.isTouch){
				thisInt = self.setInterval(function(){
				if(pageIndex< magazoom.npages){
					pageIndex++
					pageIndex = Math.min(pageIndex,magazoom.npages)
					updateSlider(pageIndex,"pageSliderButton")
					}				
								
				},100)
				trace("touching")				
			}else{		
				thisInt = self.setInterval(function(){				
				if(pageIndex< magazoom.npages){
					pageIndex++
					pageIndex = Math.min(pageIndex,magazoom.npages)
					updateSlider(pageIndex,"pageSliderButton")
				}
				trace("mouseDown")
				},100)	
			}			
		}
		


}

function fastScrollBackPages(){
	
		if(pageIndex < magazoom.npages){
			
			if($.isTouch){
				thisInt = self.setInterval(function(){
				if(pageIndex > 1){
					pageIndex--
					pageIndex = Math.max(pageIndex,1)
					updateSlider(pageIndex,"pageSliderButton")
					}				
								
				},100)
				trace("touching")				
			}else{		
				thisInt = self.setInterval(function(){				
				if(pageIndex > 1){
					pageIndex--
					pageIndex = Math.max(pageIndex,1)
					updateSlider(pageIndex,"pageSliderButton")
				}
				trace("mouseDown")
				},100)	
			}			
		}
		
}



function getAnnotations(i,target) {

	if(config.orientationFormat=="L") return;
	
	var pIDarr = i.toString().split('-')
	var pID;
	
	if(pIDarr.length > 1){
		pID = pagesArr[pIDarr[0] - 1] + "-" + pagesArr[pIDarr[1] - 1]		
	}else{
		pID = pagesArr[i - 1]		
	}

	//trace("pageID:"+pID)
	
	$('#annotsDiv').html("")
	annotationsArr = Array()
	
	//trace(au + pID)
	$.ajax({
		type: 'GET',
		url: au + pID,
		crossDomain: false,
		dataType: 'text',
		success: function(xml) {
			var xml = xml;
			var typ = 'annots';			
			parseAnnotations(xml, typ, target)
		}
	});
}

function parseAnnotations(xml, typ, target) {
	trace('parseAnnotations')
	trace($(xml).find('record'))
	if($(xml).find('record').length<1 && typ=='words') {
		placeAnnotations(target,'parseAnnotations') 
		return;
	}
	
	//trace("parseAnnotations:"+ " "+typ+" "+target)
	$(xml).find('record').each(function() {
		var item = Array()
		item.push($(this).find('actionValue').text());
		item.push($(this).find('position').text());
		item.push($(this).find('type').text());
		item.push($(this).find('mediaType').text());
		item.push($(this).find('rotation').text());
		item.push($(this).find('style').text());
		item.push($(this).find('label').text());
		
		if(typ=='words'){
			var pID = $(this).find('pageID').text()
			for(var p=0; p < pagesArr.length;p++){
				if(pagesArr[p] == pID){
					item.push(p-0+1)
					break;
				}
			}
		}else{
			item.push($(this).find('pageNum').text());
		}
		//trace($(this).find('type').text())
		annotationsArr.push(item)
	});
	//trace("annotations.length:" + annotationsArr.length + " typ:" + typ)
	
	if (typ == 'annots' && searchTxt != "" && searchTxt !='search') {
		getWords()
		return;
	}	
	
	if (annotationsArr.length > 0) {
		placeAnnotations(target,'parseAnnotations')		
	}
}

function placeAnnotations(target,who) {

	target =  'annotsDiv' 
	
	trace("placeAnnotations:"+target+" -- "+who)
			
	var targetPageWidth = $('#annotsDiv').width();
	var targetPageHeight = $('#annotsDiv').height();
				
	var divAnnots = Array()
	var divAnnotsLeft = Array()
	var divAnnotsRight = Array()
	
	var roStyle = "";
	for (var a = 0; a < annotationsArr.length; a++) {
		var lnk = annotationsArr[a];
		var pos = lnk[1].split(",")
		var val = lnk[0]
		var typ = lnk[2]
		var ro = lnk[4];
		var pg = lnk[5]-0;
		
		trace(typ+":"+val)		
			if(ro!=0){
				//roStyle="webkit-transform: rotate("+ro+"deg);";	
				roStyle="-webkit-transform: rotate("+ro+"deg); -webkit-transform-origin: left top;";				
			}else{
				roStyle=""
			}
			
		var x = parseInt(pos[0] * targetPageWidth)
		var y = parseInt(pos[1] * (targetPageHeight))
		var w = parseInt(pos[3] * (targetPageWidth))
		var h = parseInt(pos[2] * (targetPageHeight) - 2)
		
		
		if (typ == "customLink") {
			x += 1;
			y += 1;
			w -= 0;
			h -= 3;	
			val = val.replace(/[^A-z0-9/-]/g,"")
			
			
			
			firstPageWithProduct.push(pg);
			
			if(array_min(firstPageWithProduct)==pg) {			 	
			 	setTimeout(function(){informAboutShopping()},2000)			 
			}
			//trace(pg+ " "+val)											
		}
						

		var action = " ontouchstart=\"hyperlinkExec(\'" + typ + "','" + val + "',event)\" ";
		var displayVal = "";
		var linkStyle = (typ == 'customLink') ? "clink "+typ + magazoom.customLinkStyle : typ;
		if (typ == 'customLink' && magazoom.customLinkStyle > 1) {
			displayVal = val;
		}
		if (typ == 'highlight') {
			displayVal = "";
			linkStyle = 'highlight';
		}
		if (val.indexOf('facebook.com') > 0) {
			displayVal = '';
			linkStyle = 'facebook';
		}
		if (typ == 'mediaLink' || typ =='youTubeLink') {
			
			var ytID = youtube_parser(val)
											
			if(ytID.length > 1 ){
					displayVal = "";
			
			if(h<100){
					linkStyle = 'youTubeButton';												
					action = " ontouchstart=\"showHideYouTubeWindow('block','" + ytID + "',event)\" ";
				}else{
					//trace(x,currentLeft,x+currentLeft)
					embedYouTubeWindow('block',val,(x+currentLeft),y,w,h);
					return;
				}
			}

		}
		if (typ == 'chatLink' && magazoom.live_text==1) {
			displayVal = "";
			linkStyle = 'chatLink ';
			linkStyle += (h > 60) ? 'chatLady' : 'chatIcon'
			action = " ontouchstart=\"openChat(this,"+val+")\" ";
			val ="Open Live Text"
			trace(h+";"+linkStyle)
		}
		if(typ=="webLink"){
				
				var ytID = youtube_parser(val)
							
				
				if(ytID.length > 1 ){
					displayVal = "";
													
					if(h<100){
						linkStyle = 'youTubeButton';												
						action = " ontouchstart=\"showHideYouTubeWindow('block','" + ytID + "',event)\" ";
					}else{
						//trace(x,currentLeft,x+currentLeft)
						embedYouTubeWindow('block',val,(x+currentLeft),y,w,h);
						return;
						}
				}else if(h>20){
					linkStyle = "webLink1"
				}
						
		}
		if(typ=="webLink" && val.indexOf("{")>-1){
			var props = val.split("{")
			
			var obj = "{"+props[1];
			var objStr = "("+obj+")"
					//trace(objStr)
			 	obj = eval(objStr)
			 	
			action = " ontouchstart=\"hyperlinkExec(\'" + typ + "','" + val + "',event)\" ";
			linkStyle = (obj.s) ? "customLink"+obj.s : "pageLink"
			
		}
				
		var charSpace = parseInt(w / val.length)
		var sugFontSize = parseInt(charSpace * 1.7).toFixed(0)
		//trace("charSpace:"+charSpace+" width:"+w+" val:"+val.length)
		//var fSize = (orientationFormat == "P") ? parseInt(charSpace * 1.8).toFixed(0) : parseInt(sugFontSize / orientationScale).toFixed(0);
		var fSize =   sugFontSize+"px"		
		//trace(fSize)
		
		//if(target != 'annotsDiv' && linkStyle !='pageLink') action = "";
		
		var annotStr = "<div class='" + linkStyle + "' style='font-size:" + fSize + "; cursor: pointer; position: absolute; left:" + x + "px; top:" + y + "px;";
			annotStr += " width:" + w + "px; height:" + h + "px; line-height:100%; "+ roStyle+"' title=" + val + action + "><div style='width:" + w + "px; height:" + h + "px;'>" ;
			annotStr += displayVal + "</div></div>";
			
		//trace(annotStr)
		
				
		if(target != 'annotsDiv'){
			if(pg%2 == 0) {
				if (val) divAnnotsLeft.push(annotStr);
				//trace("left "	+ pg)			
			}
			else{
				if (val) divAnnotsRight.push(annotStr);
				//trace("right "	+ pg)
			}
		}else{
			if (val) divAnnots.push(annotStr);
		}
		
	}
	
	
	
	//trace(target+" -- "+who)
	
	
	$('#'+target).html(divAnnots.join("\r"));
	
		
	//$(annotsDiv).animate({opacity : 1},1000)
}

//---------button effect on tap------------

function sparkMe(e){
	
	abortTimer()
		
	var target = $(e.target);
	trace(target.offset().top)
	var id = e.target.id
	
	var x = target.offset().left;
	var y = target.offset().top;
		
	$('#spark').css({
		display : "block",
		top : y+"px",
		left : x+"px",
		opacity : 1,
		zIndex : 999999999,
	})
	
	e.preventDefault();
	
	$('#spark').animate({opacity: 0},500)//.done(funtion(){
	setTimeout(function(){
		$('#spark').css({
				display : "none"	
				})	
	},500)	
	
	
}

function removeButtonEffect(){
	var buttonArr = ["pagesButton","tocButton","shareButton","actionButton","videoButton","cartButton","bookmarkButton" ,"contactButton","settingsButton"];
	
	for(var i = 0; i < buttonArr.length; i++){
		//trace(buttonArr[i])
		if(document.getElementById(buttonArr[i]))
		document.getElementById(buttonArr[i]).style.backgroundImage = "none";
	}
}


function hyperlinkExec(typ, txt, event) {
	//trace(txt)
	event.preventDefault();
	
	if (typ == "customLink") {
		if (magazoom.productLookup.indexOf("direct") > 1) {
			var re = new RegExp(/\[SKU\]/g)
			var productURL = magazoom.productLookup.replace("&direct=y", "")
			productURL = productURL.replace(re, txt)
			
			goToURL(productURL, 'cart')
			
			logEvent('shopping','view item external:'+txt,magazoom.seo_title,null,false);
			
		} 
		else if(txt.indexOf('contactus')>-1){
				showHideContact(1)
		}
		else {
			queryProduct(txt)
			logEvent('shopping','view item internal:'+txt,magazoom.seo_title,null,false);
		}
	} else if (typ == "webLink") {
					
					
		var lastChar = txt.toString().length-1
				
		if(txt.toString().substring(lastChar,lastChar+1) == "."){
			txt = txt.substring(0,lastChar)			
		}
		if (txt.indexOf("@") > -1) {
			goToURL("mailTo:"+txt, 'email')
			logEvent('mailTo:',txt,magazoom.seo_title,null,false);
			
		} else {
			if (txt.indexOf("http") == -1) {
				txt = "http://" + txt;
			}
			if(txt.indexOf("{")>-1){
							
				var props = txt.split("{")
				var args = "{"+props[1];
				var objStr = "("+args+")"
				var obj = eval(objStr)
																
				if(obj.w){
					getRemoteContent(props[0],args)
				}else{
					goToURL(props[0]);
					logEvent('webURL:',props[0],magazoom.seo_title,null,false);
				}
				
			}else{
				goToURL(txt, 'web')
				logEvent('webURL:',txt,magazoom.seo_title,null,false);
			}
			
		}
	} else if (typ == "youTubeLink") {
		logEvent('video:',txt,magazoom.seo_title,null,false);
	} 	
	else if (typ == "pageLink") {
		var p = parseInt(txt) - 0 + parseInt(magazoom.pageOffset) - 0
		goToPage(p)
	}
}

function goToURL(txt, win) {
				
	if(display.openedFromHomeScreen === true){	
			
		txt = "<br>Opening this link will leave this web app.<br><br><a href="+txt+"><div style=' height:40px;' class='gradientGray' ontouchstart=showHideAlert('none','none');>continue</div></a>"; 
		
		showHideAlert(txt,"Warning")
		
						
	}else{		
		var w = window.open(txt, "_blank")
		
		setTimeout(function(){
			if(!w || w.closed || typeof w.closed=='undefined' || w.innerHeight < 10)
			{
					
				notifyPopupBlocker()
			}
			
		},2000)
		
	}
	//showHideWeb('block',txt)
}



function notifyPopupBlocker(){

	var msg = "<h3>Whoops - you need to allow Popup Windows in order to continue !</h3>"
			
	switch(browser){
			case "Chrome": msg += "<a href='https://support.google.com/chrome/answer/95472?hl=en' target='_blank'>";
			break;
			case "Firefox": msg += "<a href='http://support.mozilla.org/en-US/kb/pop-blocker-settings-exceptions-troubleshooting#w_pop-up-blocker-settings' target='_blank'>";
			break;
			case "Safari": msg += "<a href='https://support.apple.com/kb/index?page=search&src=support_site.globalheader.search&locale=en_US&q=safari%20popup%20blocker' target='_blank'>";
			break;
			
		}	
			msg+="<div class='aButton buttonObj' data-object=showHideAlert()>How To Allow Popups</div></a>"
			
			showHideAlert(msg,"Warning")
}


function getMouseCoords(e) {
	var posx = 0;
	var posy = 0;
	if (!e) var e = window.event;
	if (e.pageX || e.pageY) {
		posx = e.pageX;
		posy = e.pageY;
	} else if (e.clientX || e.clientY) {
		posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
		posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
	}
	mouseX = posx;
	mouseY = posy;
}

function setOpacity(obj, opacity) {
	opacity = (opacity == 100) ? 99.999 : opacity;
	// IE/Win
	obj.style.filter = "alpha(opacity:" + opacity + ")";
	// Safari<1.2, Konqueror
	obj.style.KHTMLOpacity = opacity / 100;
	// Older Mozilla and Firefox
	obj.style.MozOpacity = opacity / 100;
	// Safari 1.2, newer Firefox and Mozilla, CSS3
	obj.style.opacity = opacity / 100;
	//alert("opacity="+opacity)
}

function autoSubmit(e) {
	var key = (e) ? e.keyCode || e.which : null;
	trace(key)
	
	if (key == 13) {
		$('#searchInput').blur()
	}
	return false;
}

function autoCommit(e) {
	var key = e.keyCode || e.which;
	
	if (key == 13 || key == 10 || key == 9) {
		var pg = parseInt(e.target.value)+parseInt(magazoom.pageOffset)
		//trace("pg:"+pg)
						
		goToPage(pg)
		if(e.target.id!='spreadsIndicator')$("#"+e.target.id).css({top:"0px"})
		e.target.blur()
	}
	return false;
}
function autoLogin(e) {
	var key = e.keyCode || e.which;
	var target = e.currentTarget.id;
	var hasText =  Boolean($("#"+target).val())
	if ((key == 13 || key == 10 || key == 9 ) && hasText) {				
		login()
		$('#uname').focus();
		$('#uname').focus();
	}
}

function enlargeInput(e){
	var obj = document.getElementById(e.target.id)
	var sze = obj.style.size;
	//trace("enlarge:"+sze+" "+e.target.id)
	obj.style.size = parseInt(sze*1.5)+"px";
}

function showHideSpinner(v){
	trace(v+":"+spinner)
	
	if(spinner){
		spinner.stop()
	}
	
	
	if(v){
		opts.color=  '#FFFFFF';			
		spinner = new Spinner(opts).spin(windowDiv)
	}
}
/*
function searchNow(txt) {

	config.omitList = new Array();
	
	//hideAllPopUps()
	
	$('.highlight').remove()
	
	var val = (txt) ? txt : $("#searchInput").val() ;
	
	searchResults = Array();//Reset the search results to empty
	
	if(!val || val == ''){
		return;
	}
	
	showHideSpinner(1)
	
				
	searchTxt = val;
	$.ajax({
		type: 'GET',
		url: "php/searchPages.php?searchTxt=" + val + "&mzID=" + mzID,
		cache: false,
		crossDomain: false,
		dataType: 'xml',
		success: parseSearch,
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			trace(XMLHttpRequest.responseText)
			trace(textStatus);
			trace(errorThrown);
			trace("php/searchPages.php?searchTxt=" + val + "&mzID=" + mzID)
		}
	});
}
*/

/*
function parseSearch(xml) {
	
	$(xml).find('record').each(function() {
		var item = Array()
		item.push($(this).find('pageText').text());
		item.push($(this).find('pageNum').text());
		//trace($(this).find('pageNum').text());
		searchResults.push(item)
		
	});

	if(searchResults.length<1){		
		showHideAlert("<h3>"+UI['Sorry_no_matches']+"</h3>");
		showHideSpinner()		
	}else{
		modifyURL('search='+searchTxt)
		formatSearchResults()		
	}
	
	
	
	}
*/
	
/*
function formatSearchResults(arg){
	
	var Total = 0;
	var pageNum;
	
	$(searchSave).html("<div class='' title='"+UI['Save_Search_Results_As_PDF']+"' style='position:relative;top-10px;'>"+UI['Search_Results']+" (" + searchResults.length + ") pgs <div class='buttonObject saveIcon icon mergePDF' style='position:relative;top:5px;left:20px;opacity:.6;'></div></div>");
		
	searchResultsHTML = "<div id='resultsDiv' style='max-height:"+parseInt($(window).height()-fudgeAmt-100)+"px;width:300px;'><ul class='searchResults'>";
	for (var i = 0; i < searchResults.length; i++) {
		searchResultsHTML += "<li>";
		if (pageNum != searchResults[i][1]) {
			var inst = 0
			pageNum = searchResults[i][1]-0;
			var pageNumDisplay = (pageNum <= magazoom.pageOffset)? intToRoman(pageNum) : pageNum - magazoom.pageOffset;
			//trace(pageNumDisplay,pageNum)
			pageButton = "<div class='searchThumb buttonObject' style='margin-left:-50px;background-image:url("+root.thumbnailURL + pageNum + ".gif)' data-object=touchScroll(event,'goToPage(" + pageNum + ")') >"
			pageButton += "<div style='position:relative; margin-top:30%; z-index:20;' title='"+UI['Turn_To_Page']+"' class='numbering buttonObject ' "
			pageButton += "data-object=touchScroll(event,'goToPage(" + pageNum + ")') >" + pageNumDisplay + "</div>"
			pageButton += "<div class='trash buttonObject' style='margin-top:32%;margin-left:35%;' data-object='deleteSearchItem("+i+")' title='"+UI['RemoveResultsA']+"'></div>"
			pageButton += "</div>";
		}else{
			inst++
		}
		searchResultsHTML += pageButton + "<div class='searchItem' title='"+ UI['View_More']+"' >" + searchResults[i][0] + "</div>";
		searchResultsHTML += "</li>";
	}
	//searchResultsHTML += "</div>";
	searchResultsHTML += "</ul></div>";
	//trace(searchResultsHTML)
	if(!arg){		
		showHideSearchResults('block')	
		
		$('#contentDivSearchResults').html(searchResultsHTML);
		
		if(config.orientationFormat=="P"){
			getAnnotations(pageIndex)
		}
		else{
			var pIarr = spreadsNumbering[currentSpreadIndex].toString().split('-')									
			getAnnotations(pIarr)
		}
					
		logEvent('search',searchTxt,magazoom.seo_title,searchResults.length-0,false);
	}
	
	showHideSpinner()
}
*/

/*
function highlightContent(event){
		
	var obj = $(event.target)
	var i = $(obj).data('item')
	var inst = $(obj).data('inst')

	var data = {}
	data.pageNum = searchResults[i][1]
	data.inst = inst
	data.string = searchTxt
	data.mzID = mzID
	
	$.ajax({
		url:'php/paragraphLocate.php',
		data:data,
		method:'POST',
		crossDomain: false,
		dataType: 'json',
		success:function(res){
			config.paragraph = [res['box'],i]
			goToPage(searchResults[i][1])
			showParagraph(i)
		}
	})
	
}

function showParagraph(){
	
	$('.paragraph').remove()
	
	if(searchResults.length && config.paragraph)
	var i = config.paragraph[1];
	
	var ele = $('.p'+searchResults[i][1]);
			var reg = {}
			reg.position = (config.paragraph[0].toString().replace("[","").replace("]",""))
			reg.type = 'paragraph'
			reg.style = 'paragraph'
			reg.actionValue = ''
			addRegion(reg, ele)
	//$('.highlight').hide()
}
*/
			
/*
function deleteSearchItem(i){
	
	config.omitList.push(searchResults[i][1])
	
	searchResults.splice(i,1);

	formatSearchResults(1);
	
	var contentDivSearchResults = searchResultsDiv.ownerDocument.getElementById('contentDivSearchResults');
		contentDivSearchResults.innerHTML = searchResultsHTML;
		
	$('.ui-tooltip').hide()

}
*/

function clearInput(e, obj) {
	$("#"+obj).val('')
	$('body').animate({scrollTop:0,scrollLeft:0}, 'slow'); 

}


/*
function mergeSearchPages() {
	
	//trace(config.omitList)
	
	var d = {}
		d.search=searchTxt;
		d.omitList = (config.omitList.length) ? (config.omitList).join(',') : '';
		d.mzID = mzID
		d.seo_title = magazoom.seo_title
		
		$.ajax({
		type: 'POST',
		url: "php/searchSave.php",
		crossDomain: false,
		dataType: 'text',
		data: d,
		success: function(res){
			//trace(res)
			logEvent('Save PDF',"search results:"+res,magazoom.seo_title,searchResults.length-0,false);
			downloadPDF("tmp/"+res)
			}
		});

}
*/


function emailUs() {
	goToURL("mailto:" + magazoom.contactEmail)
}

function sendComment() {
	var email = $('#contactEmail').val()
	var comment = $('#comment').val()
	//trace("email:" + email)
	//trace("comment:" + comment)
	
	if (email.toString().indexOf("@") > 1 && comment.length > 1) {
		$.ajax({
			type: 'POST',
			url: "php/contact.php",
			crossDomain: false,
			dataType: 'text',
			data: {
				//cus: (!logging) ? magazoom.clientID : 1,
				cus:  magazoom.clientID ,
				com: comment,
				from: email,
				title:magazoom.meta_title				
			},
			success: contactConfirm
		});
		showHideContact()
		logEvent('Contact','FROM:'+email,magazoom.seo_title,null,false);
		
	} else {
		$('#contactEmail').val("valid email required")
	}
}

function contactConfirm(data) {
	trace("confirmContact:"+data)
}

function shareFacebook(URL) {
	if(!URL){
		URL = config.url
	}
	var loc = "http://www.facebook.com/sharer.php?u=" + URL
	goToURL(loc)
	//var win = window.open(loc, "Facebook", "left=250, top=300,width=600,height=400")
}

function shareTweet(URL) {
	trace("shareTweet:" + URL)
	if(!URL){
		URL = config.url
	}
	var loc = "http://twitter.com/share?_=1289502751271%26count=none%26original_referer=" + escape(URL) + "%26text=<" + URL + "%26counturl=" + URL + "%2Ftweetbutton%26via=alQemist";
	loc = "http://twitter.com/intent/tweet?original_referer=" + encodeURI(URL) + "&url=" + encodeURI(URL)
	trace("loc:" + loc)
	//var win = window.open(loc, "Tweet", "left=250, top=300,width=600,height=300")
	goToURL(loc)
}
function shareEmail(){
	var bodyMsg = "Check this out !" + "%0D%0A" + "%0D%0A" + magazoom.seo_title + "%0D%0A" + "%0D%0A" + config.url + "%0D%0A";
	goToURL("mailTo:?Subject=Thought you might be interested" + "&" + "Body=" + bodyMsg)
}

function shareLinkedIn(URL) {
	if(!URL){
		URL = config.url
	}
	var loc = "http://www.linkedin.com/shareArticle?summary=%26title="+magazoom.seo_title+"%26mini=true%26url=" + URL;
	//var win = window.open(loc, "LinkedIn", "left=150, top=100,width=700,height=600")
	goToURL(loc)
}


function hideAllPopUps(div) {
	
	//$(openerDiv).empty()
	//traceLog('hideAll',1)
	
	showMenu()
			
	if(pointerDiv) pointerDiv.style.display = "none"
	
	var divArr = ["chatDiv","howToDiv","youTubeListDiv","jquery-colour-picker","youTubeDiv","youTubeListDiv","dynDiv","bubbleDiv", "cartDiv", "helpDiv", "alertDiv", "settingsDiv",  "contactUsDiv", "productPopUpDiv", "loadingDiv", "webDiv", "toolTipDiv","indexDiv","searchResultsDiv","popUpDiv"]
	
	var newTop = (100+(fudgeAmt/2))+"px";
				
	for (var a = 0; a < divArr.length; a++) {
		
		if (div == divArr[a]) {	
			a++
		}
			
			//trace("hideAll:"+ divArr[a])
			
			
			if(divArr[a] == "searchResultsDiv"){
							
				 if($('#searchResultsDiv').width() > 50){
					 $('#searchResultsDiv').animate({width : 0},1500);						
					 $('#resultsArrow').animate({rotate : 180})
					$('#searchResultsDiv').css({display:'inline-block'})
				 }
				  break;
			}

			else if(divArr[a]=="dynDiv" && $(divArr[a]).css('display') != "none" && videoPlaying){
					//showHideYouTubeWindow("none")					
					$('#'+divArr[a]).css({display : "none"});
					$('#'+divArr[a]).css({height : "auto"})
					//
			}

			
			else{
				if($('#'+divArr[a]))
				$('#'+divArr[a]).css({display : "none"});
							
			}
		
			
			
			if(divArr[a]=="dynDiv" && contentDiv && !videoPlaying){
				$('#contentDiv').empty()
			}
			
			$('#'+divArr[a]).css({display:"none"});
			//trace(divArr[a]+" "+$(divArr[a]).css('display'))
													
		}
				
		currentPopUp = ''
			
}


function showHideBackgroundPagesForMove(val){
		
		//viewingPage.style.display = val		
		$('#fadePrevDiv').css({display:val})
		$('#fadeNextDiv').css({display:val})
		//stackedPages.style.display = "none"
		
		return;
}

function showHideToolBars(val){

	trace("showHideToolbars")
		$('#viewingPage').css({display:"block"})
		//book.style.border = "1px red dashed"
	
	if(val){
		scaleDisplay(val)
		$('#toolbarTopDiv').animate({top: 0},1000)
		$('#toolbarBotDiv').animate({bottom: 0},2000,function(){updateDisplay(1);placeAnnotations('annotsDiv','HideToolbars')})
		$('#taskbarTab').animate({top: -40},1000)
		fullScreen = false
		
	}else{
		$('#taskbarTab').css({left:parseInt(($(window).width()/2)-50)+"px"})		
		$('#toolbarTopDiv').animate({top: -100},1000)
		$('#toolbarBotDiv').animate({bottom: -100},1000,function(){scaleDisplay()})
		$('#taskbarTab').animate({top:-4},1000)
		fullScreen = true
	}
		
	function scaleDisplay(arg){
	
		trace("scaleDisplay")
		
		showHideBackgroundPagesForMove('none')
		stackedPages.style.display ="none"
		var newW = (config.orientationFormat=="P") ? magazoom.pageWidth * fullScale : magazoom.pageWidth * zoomScale
		var newH = (config.orientationFormat=="P") ? magazoom.pageHeight * fullScale : magazoom.pageHeight * zoomScale
		var newL = (config.orientationFormat=="P") ? ($(window).width()-newW)/2 : 0;
		var newTop = (arg)? toolbarTopHeight : 0;
		var newBot = (arg)? toolbarBotHeight : $(window).height();
								
		$('#book').animate({top:newTop,bottom:newBot, height:newH},500,function(){
			updateDisplay();
			placeAnnotations('annotsDiv','showingToolbars');							
						
		})
				
	}
}

function showHideLoading(val, content) {

	
		
	if (isLoaded != 1) {
		var p = (pageNum > 0) ? pageNum : 1
		if (p > 1) {
			setupNextPrev(p)
			//setTimeout(function(){goToPage(p)},2000);
			
		}		
				
	}
	
	if (!val) {
						
		$('#fadeNextDiv').css({left:"-1000px"});				
		$('#fadeNextDiv').css({left:$('#viewingPage').css('left')});		
				
		if(spinner) spinner.stop();
		
		updateDisplay();
								
		$('#loadingDiv').css({display : "none"});
						
		setTimeout(function (){notifyVersionChange()},2000)
		
		/*	
		if(display.openedFromHomeScreen===false && settingsModel['showToolTips'] == 1){						
				setTimeout(function (){showHideBubble("block")},15000)						
		}
		*/
				
		
	} else {
			
		var target = $('#spinnerBox')
		spinner = new Spinner(opts).spin('spinnerBox');
		$('#loadingDiv').css({display :"inline-block",border:"0px green dotted"});
		
	}
			
	
		
	isLoaded = 1;
	
	
	$('#annotsDiv').css({display : "block"});
				
}

function showHidePreferences(val,e){
	
	trace("showPreferences: "+val)
	//$('#showUserInfoButton').addClass("tabOff")
	//$('#showPreferencesButton').addClass("tabOff")
	//$('#showStylesButton').addClass("tabOff")
	
	$('#stylesDiv').css({display : "none"})
	$('#userInfoDiv').css({display : "none"})
	$('#preferencesDiv').css({display : "none"})	
						
	if(val==1){
		$('#preferencesDiv').css({display : "inline-block"})			
		$('#showPreferencesButton').addClass("tabOn").removeClass('tabOff')
		$('#showUserInfoButton').addClass("tabOff").removeClass('tabOn')	
	}else{		
		$('#userInfoDiv').css({display : "inline-block"})					
		$('#showUserInfoButton').addClass("tabOn").removeClass('tabOff')	
		$('#showPreferencesButton').addClass("tabOff").removeClass('tabOn')		
	}
	
	
	/*
if(usr != 'admin'){
		$('#stylesDiv').css({display: "none"})		
		$('#showStylesButton').css({display: "none"})	
	}
*/
}

function showTooltips(){
	
	
	return
	trace("showing tooltips")
	$(".tocIcon").tooltip({ tooltipClass: "tooltip"})
	$(".tocIcon").tooltip({
		track:true,
		items: ".tocIcon", 
		//content: "Displaying on click",
		left:50,
		top:50
		});
	
    $(".tocIcon").delay(2000).tooltip("open");
}

function showMore(e){
	$(".alertDiv").hide()
	var objTarget = $(e.target)
	var i = $(e.target).data('item')-0
	var objData = config.portalItems[i]['entry']
	
	var cls = objTarget.prop('class').indexOf("infoIcon")>0
	
	var txt = (cls) ?  objData['about'] : objData['meta_description'].substring(0, 300)+"..."
	var ttl = (cls) ?  objData['company'] : objData['title'].toString()
	
	$(".alertFooter").hide()
	
	showHideAlert(txt, ttl)
	$(".closeButton").show()

}


/*
function showHideAlert(txt, ttl) {
	
		$('.alertContent').removeClass('linen')
	
		if(ttl){
			$('.alertTitle').html(ttl).show()
		}
		
		var wt = 400
				
		if (config.isMobile){
			wt = (config.orientationFormat=="L") ? wt : $(window).width()-50 
			}
		
		if (txt) {
			$('.alertContent').html(txt)
			$('.alertDiv').css({		
				left: parseInt(($(window).width()-wt)/2),						
				opacity:	1,
				margin:"0px;",
				width:wt,
				zIndex:900000000
			})
		
			$('.closeButton').show()
			
			setTimeout(function(){setAlertTop()},200)						
		} else {
			//trace("calling:"+f)	
			$('.alertDiv').fadeOut(500, function() {
				$('.alertDiv').hide();
			});
			$('.closeButton').show()
			showHideLoading()
		}
		
		
		
	}
*/
	
/*
function setAlertTop(){
	var ht = $('.alertDiv').height()
	var tp = Math.max((($(window).height()-ht)/2).toFixed(0), 30) ;
		
	trace(ht)
				
	$('.alertDiv').css({top:tp}).show()
}
*/

function showHideProductPopUp(val) {
	
		hideAllPopUps('productPopUpDiv')
		
		if (val !== "none") {
									
			$('#productPopUpDiv').fadeIn(1500, function() {
				//productPopUpDiv.style.maxHeight = ($(window).height() - 100)
				$('#productPopUpDiv').css({opacity : 1})
				$('::-webkit-scrollbar').css({
					width: '12px'
				})
				$('scrollbar').css({
					width: '12px'
				})
			});
						    
		if(spinner){				
				spinner.stop()
			}
			
		} else {
			$('#productPopUpDiv').fadeOut(1000, function() {});
			$('#productPopUpDiv').css({display : "none"})
		}
		
	}


/*
function showHideSearchResults(val) {
	
	if($('#searchInput').is(":focus") && config.isMobile) $('#searchInput').blur()
						
		var thisPos = $('#searchResultsDiv').width()-0;
					 	
		var vis = ($('#searchInput').css('display') == "inline-block") ? 'inline-block' : 'none';		
		
		if (val == "block" && thisPos <= 10) {
			
			//$('#contentDivSearchResults').css({display:"block"});			
			$('#searchResultsDiv').focus()
				
			$('#resultsArrow').removeClass('rot180').addClass("rot0");
			
			$('#resultsDiv').css({maxHeight:parseInt($(window).height()-fudgeAmt-50)+"px"});
			
			$('#searchResultsDiv').css({
				maxHeight: parseInt($(window).height()-fudgeAmt-30)+"px",	
				top: 10 + (fudgeAmt / 2) + "px",
				display: val,
				zIndex: "2000",
				padding:"5px"
			})	
			$('#contentDivSearchResults').css({maxHeight:parseInt($(window).height()-fudgeAmt-80)+"px"})																									
			$('#searchResultsDiv').animate({width : 340},1000);	
			$('.searchResults').css({width : 250});						
			
		} else {
			
			$('#searchResultsDiv').css({padding:"0px"}).animate({width : 0},1000,function(){
				//$('#searchSave').css({display:"none"})
				//$('#contentDivSearchResults').css({display:"none"})
				$('#resultsArrow').removeClass('rot0').addClass("rot180");	
			});
			//resultsArrow.style.webkitTransform = "rotate(180deg)"			
			
		}
		
		$('#searchResultsTab').html(UI['Search_Results'])
		$("#resultsArrow").prop("title",UI['Show_Hide_Search_Results'])
	}
*/

	

function showHideHelp(val) {
		
		hideAllPopUps('helpDiv')
															
		var vis = $('#helpDiv').css('display');
		
		if (vis == "none") {
													
			$('#helpDiv').css({
			    left : touchPointX-140 + "px",
			    top : 10 + (fudgeAmt / 2) + "px",
			    zIndex: 2000
			    })
			
			$('#helpDiv').fadeIn(1000);
			
		} else {
			//trace("hidingShare")
			$('#helpDiv').fadeOut(1000, function(){
				$('#helpDiv').css({display:"none"});
				//helpDiv.style.height = "0px";
				currentPopUp = ""
				removeButtonEffect()
			});
			
		}
	}


function showHideHowTo(){

	    hideAllPopUps('howToDiv')
	
		var vis = $('#howToDiv').css('display')
		var w = 400
				
		if (vis != 'block' ) {
			var newLeft = parseInt(($(window).width() - w) / 2)+"px"
			var newTop = (fudgeAmt / 2) + "px"
			$('#howToDiv').css({
				display: "inline-block",
				zIndex: 300004,
				left: newLeft,
				width:w+"px",
				opacity: 1,
				top: newTop,
				maxHeight:($(window).height()-fudgeAmt)+"px",
				overflow:'hidden'
				})
										
		} else {
			$('#howToDiv').css("display","none")
			removeButtonEffect()
		}
			
}

function showHideSettings(val) {
	
	 	if(val=='none'){
		 	hideAllPopUps()
		 	return;
	 	}else{
		 	hideAllPopUps('settingsDiv')
	 	}
		
		
		if(!settingsModel['userid'] && databaseEnabled){
			getRecords('settings','userid','1',settingsModel,null);	
		}
		
		for(var s in settingsModel){
			//alert(s +" = " + settingsModel[s])
		}
		
		osDiv.innerHTML = " iOS:"+os;
		
		if (settingsModel) {
			//document.getElementById('userbandwidth').className = 'offButton'
			
						
			for (var c in settingsModel) {
			
				trace(c+ " "+settingsModel[c])
				
				if (document.getElementById(c) && document.getElementById(c).type == 'text') {
					document.getElementById(c).value = settingsModel[c]
					
				} else if (c == 'userbandwidth') {
						$('#'+c).removeClass("offButton")
						$('#'+c).removeClass("onButton")				
					if (settingsModel[c] <  1 ) {
						$('#'+c).addClass("offButton")
					} else if(settingsModel[c] == '1')  {
						$('#'+c).addClass("onButton")

					}
				} else if (c == 'showToolTips') {
					$('#'+c).removeClass("offButton")
					$('#'+c).removeClass("onButton")
					if (settingsModel[c] != '1') {
						$('#'+c).addClass("offButton")
					} else {
						$('#'+c).addClass("onButton")

					}
				}
				else if (c == 'richEffects') {
					$('#'+c).removeClass("offButton")
					$('#'+c).removeClass("onButton")
					if (settingsModel[c] != '1') {
						$('#'+c).addClass("offButton")
					} else {
						$('#'+c).addClass("onButton")
					}
				}
				else if (c == 'playSound') {
					$('#'+c).removeClass("offButton")
					$('#'+c).removeClass("onButton")
					if (settingsModel[c] != '1') {
						$('#'+c).addClass("offButton")
					} else {
						$('#'+c).addClass("onButton")

					}
				}
				else if (c == 'toolbar3D') {
					$('#toolbar3D').removeClass("offButton")
					$('#toolbar3D').removeClass("onButton")					
					
					trace("toolbar3D:"+settingsModel[c])
					
					if (settingsModel[c] != '1') {
						$('#toolbar3D').addClass("offButton")
					} else {
						$('#toolbar3D').addClass("onButton")
					}
				}
			}
		}
		
		var vis = $('#settingsDiv').css('display')
		//alert(val +" "+vis)	;
		if (val == 'block' && vis != 'inline-block') {
			showHidePreferences(1)
			var pos = parseInt(($(window).width() - 360) / 2)
			$('#settingsDiv').css({				
			    display: 'inline-block',
			    left: pos + "px",
			    maxHeight: "none",
			    top: 5 + (fudgeAmt / 2) + "px"}).fadeIn(1000)
								
		} else if (vis == 'inline-block') {
			updateDisplay()
			$('#settingsDiv').css({display: "none"});
			removeButtonEffect()
		}
		
		$(".saveButton").html(UI['Save'])
		$(".continueButton").html(UI['Continue']).prop("title",UI['Clear Preferences'])
		$("#showPreferencesButton").html(UI['Preferences'])
		$("#showUserInfoButton").html(UI['User_Info'])
		
		$("#showPopupTipsLabel").html(UI['Show_popup_tips'])
		$("#playSoundsLabel").html(UI['Play_Sounds'])
		$("#pageAnimationLabel").html(UI['Page_Animation'])
		$("#HDViewLabel").html(UI['HD_view'])
		$("#HDViewNote").html(UI['HD_note'])
		$('.accountLabel').html(UI['Account'])
		$('.nameLabel').html(UI['Name'])
		$('.addressLabel').html(UI['Address'])
		$('.companyLabel').html(UI['Company'])
		$('.cityLabel').html(UI['City'])
		$('.stateLabel').html(UI['State'])
		$('.zipLabel').html(UI['Zip'])
		$('.countryLabel').html(UI['Country'])
		$('.emailLabel').html(UI['Email'])
		$('.phoneLabel').html(UI['Phone'])
		$('.enterAccountLabel').html(UI['Enter_Account_Info'])
		
		
	}

function showHideContact(v) {
	
		$('.popupDiv').hide()
				
		if (v) {
		
		var tab = "<table class='contactUsTable' style='border-collapse:collapse; width:100%; padding:4px; overflow:hidden;'>"
		tab += "<tr><td><h3>"+UI['EmailLabel']+"</h3><input id='contactEmail' value='"+config.useremail+"'"
		tab += "' type='email' size=30 style='width:220px;'/></td></tr>"
		tab += "<tr><td></td></tr>"
		tab += "<tr><td style='text-align:center;'><textarea id='comment' style='width:90%;' ></textarea></td></tr>"
		tab += "<tr><td><div   data-object='sendComment()' class='buttonObject aButton ContactUsSendBtn'>"+UI['Send']+"</div>"
		tab += "</td></tr>"
		tab += "</table>"
		
		
		var ph = magazoom['phone']
		if(config.isMobile){
			 ph = "<a href='tel:"+ph+"'>"+ph+"</a>";
		 }
		var contact = "<h4>"+config.location+"<\h4>"
			contact += "<h4>phone:"+ph+"<\h4>"
			contact += "<h4><a style='text-decoration:underline;color:black;' href='"+magazoom.webURL+"'>"+magazoom.webURL+"</a><\h4>"
						
		var txt = tab + contact
		var ttl = UI['Contact_Us']
		
		$(".alertFooter").hide()
		
		showHideAlert(txt, ttl, null, null,null)
		$(".closeButton").show()
		}
}

function showHideOpener(){

	trace("isLoaded:"+isLoaded+" config.openerHasShown:"+config.openerHasShown+" pageIndex:"+pageIndex);
	
	if(config.orientationFormat == "L" && pageIndex==1 ){
		var newWidth = (($(window).height()-fudgeAmt)/pageAR)-20;
		newWidth = $('.page-wrapper').width();
		
		setTimeout(
				function(){
					$('#openerDiv').css({						
						right:($(window).width() / 2)+"px",
						width:"0px",
						overflow:"hidden",
						display:"inline-block",
						//height:$('.magazine').height()+"px",
						height:$('.page-wrapper').height(),
						zIndex:51,
						textAlign:'center'					
						}).delay(1000).animate({width:newWidth},4000);
						
				},3000)	
												
	}
	else if(config.orientationFormat == "P" && pageIndex==1){
		var newWidth = $('#viewingPage').width()+"px";
		
		setTimeout(
				function(){
					$('#openerDiv').css({						
						left:(($(window).width()-pageDisplayWidth) / 2)+"px",
						width:pageDisplayWidth+"px",
						opacity:0,
						overflow:"hidden",
						display:"inline-block",
						height:pageDisplayHeight+"px",
						border:"0px red dotted"					
						}).animate({opacity:1},2000)
				},6000)
					
				
						
		setTimeout(
			function(){
				$('#openerDiv').animate({opacity:0},2000,
				function(){$('#openerDiv').css({display:"none"});showQuickTips()})
				}
				,12000)
			
	}

	config.openerHasShown = true;
}


function showHideWeb(val, url) {
		hideAllPopUps('webDiv')
		var vis = $('#webDiv').css('display')
		//alert(vis)	;
		if (val == 'block' && vis != 'block') {
			var w = parseInt($(window).width() - 40)
			var iw = parseInt($(window).width() - 80)
			//webDiv.innerHTML = "<iframe id='webFrame' src='" + url + "' width=" + iw + "  scrolling=yes ></iframe>"
			$('#webDiv').css({
				display : val,
				left : "20px",
				right : "20px",				
				top : 60 + (fudgeAmt / 2) + "px",
				bottom : 60 + (fudgeAmt / 2) + "px",
				display : 'val'
			})
		} else if (vis == 'block') {
			$('#webDiv').css({display : "none"});
		}
	}
	
	function showHideSesLog() {
		
		if(!logging) return;
		
		var vis = $('seslogDiv').css('display')
		
		//alert(vis)	;
		if (vis != 'inline-block') {
			
			trace(seslog.join("<br>")	)	
							
			$('#seslogDiv').css({
				display: "inlink-block",
				position:"absolute",
				backgroundColor:"white",
				color:"black",
				fontsize:"6px",
				left: "80px",
				padding:"10px",
				width: "500px",
				border:"2px black solid",				
				top: 60 + (fudgeAmt / 2) + "px",
				bottom: 60 + (fudgeAmt / 2) + "px",
				overflow:"scroll"
			}).html(seslog.join("<br>"))
			
		} else if (vis == 'block') {
			$('#seslogDiv').css('display',"none");
		}
	}


function showHideLogin(val) {

		hideAllPopUps('loginDiv')
		var vis = $('#loginDiv').css('display');
				
		if(pageIndex==1 && $("#openerDiv").css("display") !="none"){
			showHideOpener()
		}
		
		var logMsg = (magazoom.loginMessage.length) ? magazoom.loginMessage : UI['Login_Required']
		
		//trace(logMsg)
		$(".loginRequiredLabel").empty();
		$(".loginRequiredLabel").html(logMsg);
		$(".loginTitle").html(magazoom.meta_title)
		if(!val){
			$('#loginDiv').hide()
			$('.navTabHorz').show();
			return;
		}
		
		if (val) {
			var pos = parseInt(($(window).width() - 320) / 2)			
			$('#loginDiv').css({
				left : pos + "px",
				top : ($(window).height()-380)/2 + (fudgeAmt / 2) + "px"
			})
			$('#loginDiv').show();
			$('.navTabHorz').hide();
			$('#uname').focus();
			//$('#userName').attr("readonly",false)
		} 
		
				
	}

function showToolTip(val,txt,posX,posY,ro) {
			
						
			if(txt==undefined) return;
			
			
			trace(posX)
								
			$('#toolTipDiv').empty()
			$('#toolTipDiv').css({
			 	left: (posX<1) ? $(window).width()/2+"px" : posX+"px",			
			 	width: "",
			 	top: (posY!=null) ? (posY)+"px" : parseInt(10 + 40 + (fudgeAmt/2))+"px",			 	
			 	display: "inline-block",
			 	opacity:0,
			 	position:"absolute"
			 	});
			
			
						
			$('#toolTipDiv').append(txt).animate({opacity:1},2000,
				function(){
					$('#toolTipDiv').css({
					display: "inline-block"									
					});					
					})
				
			
			
			setTimeout(
				function(){
					$('#toolTipDiv').animate(
						{opacity:0},2000,
						function(){
							$('#toolTipDiv').css({
								display: "none"												
								});
						})
						},showTime-500)				
				
	}
		

function setPC(tdStr){
		//trace("spacing "+ tdArr[0] +" "+ tdStr)
		
		for(var i = 0; i < tdArr.length; i++){
		//trace("spacing "+ tdArr[i] +" "+ tdStr)
			if(tdArr[i].toString() === tdStr){
				
					var pc = (tdSpacing/100) * (i+0.5)
						return pc
				}
			}
		
	}

function showHideDynDiv(val,list,listName) {
		
		hideAllPopUps()					
							
		var vis = $('#dynDiv').css('display');
		
		currentLeft = touchPointX-170 ;
		
		trace(currentLeft)
											
		if (currentPopUp != list && val == 'block' && vis == "none") {
						
			currentPopUp = list
			currentWidth = 340														
				
					
			if(listName == "bookmarksHTML"){				
				
				list = createBookmarkHeader()+list;
																				
				$('#divFooter').html("")				
				$('#contentDiv').html(list);			
			}
			
													
			$('#contentDiv').css({
				maxHeight:parseInt($(window).height()-fudgeAmt-50)+"px",
				display: 'block'
			});
				
			$('#dynDiv').css({
				maxHeight:parseInt($(window).height()-fudgeAmt-50)+"px",
				display: "block",
				left: currentLeft+"px",
				top: 10 + (fudgeAmt / 2) + "px",
				width: currentWidth+"px",
				zIndex:"4000000"			
			});					
						
			
		} else {
			currentPopUp = ''
			removeButtonEffect();
			currentWidth = 340;
			
			$('#dynDiv').css({display : "none"});			
			$('#contentDiv').css({display : "none"});
			
			$('#contentDiv').empty();				
			$('#divFooter').empty();		
		}
	}

function showHideShare(v){
	var l = $('.shareIcon').position().left + $('.masterNav').position().left - 5
 if(v){
	 $(".shareIconDiv").css({
	 opacity:0,
	 top:45,
	 left: l,
	 }).animate({opacity:1},1000).show();
 }else{
	  $(".shareIconDiv").delay(1000).animate({
	  opacity:0},1000)

 }

}
function showIndex(val) {
		
		$('.popupDiv').hide()					
											
		if (val) {
			$('.alertContent').css({
				maxHeight:$(window).height()-160,
				overflowY:'scroll',
			})
			
			showHideAlert(tocList, UI['TableOfContents'], null, null,null)
			$('.alertFooter').hide();
			$('.closeButton').show();
			$('.tocUL').css({marginBottom:20,textAlign:'left'});
			
			
			setTimeout(function(){
				$('.alertContent').css({
				maxHeight:$(window).height()-160,
				overflowY:'scroll',
				})
			},1000)

		}
}
		


function showHideSpreads(val) {
							
		var vis = $('#spreadsDiv').css('display');
		
		trace("vis"+vis+"val"+val)
															
		if (val == 'block' ) {
		
			setupSpreads();
			
						
			$('#titleDiv').css({display : "none"});
			$('#titleDiv').animate({opacity: .5},1000)
			
			//$('.magazine').turn('page', pageIndex);
						
			$('#fullScreenDiv').removeClass("toolbarDivs").css({display:"none"})
									
			if(lastGoToPageTime !=''){
				duration = getLapsedSeconds(lastGoToPageTime);
				lastGoToPageTime = ''
			}
			
			spreadsShowing = 1;
						
									
			logEvent('page view',getPageName(pageIndex),magazoom.seo_title,duration,false);	//logging apage view when page has been left
						
			$('#spreadSlider').css({bottom:-50}).animate({bottom: 0},1000)
						
			updateSlider()	
										
			$('#spreadsDiv').css({opacity:0,display:"inline-block"}).animate({opacity:1},2000)												
			setTimeout(function(){$('.magazine').turn('peel','br')},2000)
			$('.magazine').turn('page',pageIndex);								
						
		} 
		else{
			
			$('#spreadsDiv').fadeOut(500, function() {
				spreadsShowing = 0
				$('#windowDiv').css({display : "block"});	
				$('#titleDiv').css({display : "none"});	
				$('#fullScreenDiv').css({display:"block"});					
				$('#toolbarBotDiv').css({display:"block"});	
				$('#spreadsDiv').css({display:"none"});								
														
				currentPopUp = ''
			
				currentWidth = 340;
				$('#spreadsDiv').css({zIndex : 0});
				$('#titleDiv').animate({opacity: 0},1000)
				//updateDisplay()				
				});
			
				
				
		}
		
	}
	

function showHideYouTube(val) {
															
		if ($('#youTubeListDiv').css('display') != "block") {
			
			currentPopUp = 'youTubeHTML'
									
								
			$('#youTubeListDiv').css({
				maxHeight:parseInt($(window).height()-fudgeAmt)+"px",
				zIndex: 2000000,
				left: touchPointX - 170 +"px",
				top: touchPointY + 20+"px",
				width: "340px",
				display: "block",
				padding: "0px 0px "			
			});
			
			$('#ytptrDiv').css({left:"45%",display:"block"})							
			
			$('#youTubeContent').empty();
				
			$('#youTubeContent').html(youTubeHTML);						
											
			}
			else{				
				removeButtonEffect()				
				$('#youTubeListDiv').css({display: "none"});
				currentPopUp = ''
			}
	}


function showYouTube(ytID) {

	var url = ""
	//trace(mediaList)
	if (u.indexOf("http") > -1) {
		url = u
	} else if (mediaList && mediaList[u]) {
		url = mediaList[u].toString().split("=")[1]
		//trace(mediaList[u])
	} else {
		url = u
	}
	//trace("url:" + url)
	showHideYouTubeWindow('block',ytID)
	
	
	//window.open(u,"youTube");
}

function openChat(reg,val,e){

	//trace("number"+val)
	p = pageIndex-0
	
	if(config.orientationFormat=="L"){
		p =	spreadsNumbering[currentSpreadIndex]
	}
	
	if(e){
		touchPointX = 	(touchEnabled) ? e.originalEvent.touches[0].pageX : e.pageX;
		touchPointY = 	(touchEnabled) ? e.originalEvent.touches[0].pageY : e.pageY;
	}
	
			
	
	
	val = (val) ? val : magazoom.live_text_number
	//trace( magazoom.live_text_number)

	
	$.getJSON("../../chat/openChat.php", {number:val},  function(d) {	  
	  	 
	  	 if(!d)return;
	  	 		  	  
	  	  if(d['online'] != 1){
		  	  showHideAlert(UI["Sorry_LiveText_Offline"])
		  	  return;
	  	  }else{
		  	  showHideChat(val)
		  	  logEvent("Live Text",val,magazoom.seo_title,p,false)
	  	  }
	   	
	});
}
function showHideChat(val){
	
	var el = ($(window).width()/2)-200
	var t = ($(window).height()-550)/2	
	
	trace(el)
	trace(t)
	
	var cls = (texturesCSS[textureOpt]!=2 ) ? texturesCSS[textureOpt] : texturesCSS[0]
	$('.chat').css({zIndex:"200000000000000"}).addClass(cls)
	trace("texture:"+	texturesCSS[textureOpt])
			
	if($('.chat').css('display') == "none"){
			loadChat(val)
			$('.chat').css({display:"inline-block",top:touchPointY+"px",left:touchPointX+"px",width:"0px",height:"0px"})
			$('.chat').animate({top:t,left:el,width:400,height:550},1000)			
	}else{
				
		$('.chat').animate({top:touchPointY,left:touchPointX,width:0,height:0},1000,function(){
		$('.chat').html('');
		$('.chat').css({display:"none"})
		})	
	}
	
}

function loadChat(val){

	trace("loading chat")
		
	$.getScript("../../chat/chat.js", function() {	  
	   trace('Load was performed.');	  
	   createChat()
	   chatObject.session_id = null
	   chatObject.number = val
	   chatObject.source = magazoom.meta_title
	   var nr = (config.orientationFormat=="P") ? pageIndex : (spreadsNumbering[currentSpreadIndex].toString().indexOf("-")>-1) ? spreadsNumbering[currentSpreadIndex].toString().split("-")[0] : spreadsNumbering[currentSpreadIndex];
	   
	   chatObject.url = "<?php echo $thisURL; ?>"+"?pageNum="+nr	
	   trace(chatObject.url)  
	});
	
	
	
	$.ajax({url: "../../chat/chat.css", crossdomain: false}).
	done(function(){  
	   trace('css was loaded');	  	
	});
				
	var resrc = "../../chat/chat.html"
	$.ajax({url: resrc , crossdomain: false}).
			done(function(data) {							
				$('.chat').html(data)											
			});	
}


function playYouTube(){
	trace("playingYoutube")
	videoPlaying=1;
}	


function showHideYouTubeWindow(val,ytID,e) {
		
		hideAllPopUps()
		
		if(e) e.preventDefault();
				
		var W = $(window).width() - 50
				
		var H = Math.min(parseInt(W/(16/9)), $(window).height()-100) ;
		
		trace(parseInt(W/(16/9))+"--"+($(window).height()-100))
				
		var pos = 25
		if (val == "block") {
		
			var newTop = Math.max(40,parseInt(($(window).height()-H-50)/2))
			
			trace("youtube",ytID,newTop,H)			
												
			$('#youTubeDiv').css({padding: "0px",zIndex:2050});
			
			$('#youTubeDivHeader').css({display:"block",marginBottom:"0px",height:"25px",position:"relative",top:"0px",border:"0px white dotted"});
																
			setTimeout( function() {
					videoPlaying=1														
										
					$('#youTubeDivContent').css({display:"block"}).empty();
					
					addYouTubeObject(W,H,ytID);
					
					$('#youTubeDiv').css({
						display: "inline-block",	
						left:  pos+"px",
						width: W +"px",						
						height: H+40+"px",
						top: newTop+"px",
						opacity:0						
					}).animate({opacity:1},1000)
					
																												
					for (var prop in ytplayer){
						//trace(prop+": "+ytplayer[prop]);
					}
															
					},500);
									
			logEvent('Video','youTube:'+ytID,magazoom.seo_title,null,false);
						
		} else {
			trace("hiding:"+'#youTubeDivHeader')
			stopVideo();
				
			$('#youTubeDivHeader').css({display:"none"})
			$('#youTubeDivContent').empty();
			
			setTimeout(function(){									
					//pointerDiv.style.display = 'none'
															
					$('#youTubeDiv').css({
						display: "none",						
						width: "340px",
						height: "80px"				
																	
					})
					currentPopUp='';										
					videoPlaying = 0;
										
				}, 500)
							
		}
	}

function addYouTubeObject(w,h,ytID,target){
	
	var u = "http://www.youtube.com/embed/"+ytID+"?autoplay=1&enablejsapi=1&playerapiid=ytplayer" //&origin=www.magazooms.com&rel=0"
	
	trace(w+" "+h)
	
	var embedHTML = "<object id='ytplayer' style='display:block; position:relative; top:-10px; width:98%; height:auto ; padding:2%;border:0px blue dotted;' >"
	var	embedHTML = "<embed id='ytembed' style='position:relative;top:0px; height:"+h+"px; width:98%;' src='"+u+"' ></embed>"
		//embedHTML += "</object>"
		
		//trace(embedHTML)
				
		$('#youTubeDivContent').append(embedHTML)	
			

}


function embedYouTubeWindow(val,u,x,y,w,h) {

		hideAllPopUps('youTubeDiv')
		
		ytID = youtube_parser(u)
			
		var pos = 25
		if (val == "block") {
			
			$('#youTubeDivContent').css('display','block');
			$('#youTubeDivHeader').css({display:"none"});
								
			$(youTubeDiv).css({
				left:x+"px",
				top: y+"px",
				width: w+"px",
				height: h+"px",
				display: "block",
				backgroundImage: "URL('http://i.ytimg.com/vi/" + ytID + "/default.jpg')",	
				backgroundRepeat: "no-repeat",
				backgroundSize: "100% 100%"
				
			})
			
			addYouTube(w,h,ytID,youTubeDiv)
															
			logEvent('play youTube',ytID,magazoom.seo_title,pageIndex-0,false);
						        
        						
		} else {
			trace("hiding:"+'youTubeDiv')
				stopVideo()
				setTimeout(function(){									
					currentPopUp='';
					$(youTubeDiv).css({				
						display: "none",
						backgroundImage: "none"								
			})					
				}, 1000)		
				
							
		}
	}
	
function resizeMe(e,myDiv){

		e.preventDefault();
	
	var targetEvent = e.touches.item(0);
		deltaX = (touchPointX - targetEvent.clientX)
		
				
		if(deltaX < 0){
			
			var newWidth = currentWidth+(deltaX*-1) // Math.min((currentWidth+(deltaX*-1)), $(window).width()-(currentLeft*2))
					
		}
		else{
			var newWidth = currentWidth-deltaX
			
		}
		
		myDiv.style.width =  newWidth
	
}
      

function jumpToSpread(e){
	var newLeft = e.pageX-60;	
	//spreadSliderButton.style.left = newLeft+"px"
	var newLeftPerCent = newLeft/$(spreadSlider).width();
		
}

function jumpToPage(e){
	var newLeft = e.pageX-60;	
	//pageSliderButton.style.left = newLeft+"px"
	var newLeftPerCent = newLeft/$('#pageSlider').width();
	currentPage = Math.ceil(pagesArr.length * newLeftPerCent)
	goToPage(currentPage)
}

function touchObjectStart(e) {
		deltaX = deltaY = 0;
		
		hideAllPopUps();
								
		var targetTop = e.target;
		var targetEvent = new Array()
																		
		targetEvent.push(e.touches[0])
		
		targetLeft = getOffset(e.target.parentNode).left
		
		trace("targetLeft:"+targetLeft)
				
		touchPointX = targetEvent[0].clientX//-currentLeft;
		
		//if(targetLeft == 0){
		//	targetLeft = e.pageX;
		//}							
		var thisDate = (new Date()).getTime()
		var secs = (thisDate - lastTouch) / 100
		
		//hideAllPopUps();
				
		if (secs < 10 && secs > 5 ){
			e.preventDefault();			
		}
		
		lastTouch = (new Date()).getTime();
	}
	
function touchObjectMove(e) {
									
	var w = $(e.target.parentNode).width();
	var l = getOffset(e.target.parentNode).left	
		
	//trace(w,l)
	
	var newLeft = 0;
	
	if(touchEnabled){
		e = e.originalEvent
		e.preventDefault();
		e.target.style.webkitUserSelect="none"
	}
	var x =  e.pageX 
	
	//trace("pointerx:"+x)
		
	var calcLeft = (x - l);
					
	if(e.target.id=='spreadSliderButton'){					
				
		var newPagination = Math.ceil((calcLeft/w)*(spreadsNumbering.length-1))-0
		
		trace("newPagination:"+newPagination+ " "+currentSpreadIndex)
		
		if(newPagination>=0 && newPagination < spreadsNumbering.length-1){
			newLeft = Math.min(calcLeft	,w-10)
			//spreadSliderButton.style.left = newLeft+"px";
			spreadSliderProgress.style.width = newLeft+"px";
			currentSpreadIndex = Math.ceil((calcLeft/w)*(spreadsNumbering.length))-0			
			spreadsIndicator.value = spreadsNumbering[currentSpreadIndex]+" of "+magazoom.npages	
			//trace(currentSpreadIndex+" "+(calcLeft/w))
		}	
		
	}
	if(e.target.id=='pageSliderButton'){			
		var p = parseInt((calcLeft/w)*magazoom.npages)-0
		
		if(p >= 0 && p <= magazoom.npages-1){
			newLeft = Math.min(calcLeft	,w-10)	
			//e.target.style.left = (newLeft)+"px";
			updateSlider(p+1,"pageSliderButton")
		}		
	}
	
}


function touchSliderEnd(e){

	//e.preventDefault();
		
	trace("sliderend")
			
	if(e.target.id =="spreadSliderButton"){
		var newP = (spreadsNumbering[currentSpreadIndex].toString().indexOf("-")>-1) ? spreadsNumbering[currentSpreadIndex].toString().split("-")[0] : spreadsNumbering[currentSpreadIndex];
		$('.magazine').turn('page', newP);
					
	}
	if(e.target.id =="pageSliderButton"){
		var w = $(e.target.parentNode).width();
		var pos = $(e.target).position();
		var p = Math.max((Math.ceil((pos.left/w)*magazoom.npages)),1)
		goToPage(p)
		
	}
}


	
function touchStart(e) {
		
		
		trace("touching:"+e.target.id);
		
		deltaX = deltaY =  0;
						
		var targetTop = e.target;
		var targetEvent = new Array()		
								
		startTouchX = e.originalEvent.pageX;
		startTouchY = e.originalEvent.pageY
		
		$('#book').css({overflow:"hidden"})
		
		
		
		var curTransform = new WebKitCSSMatrix(window.getComputedStyle(viewingPage).webkitTransform);
		trace(curTransform.a)
		
		//targetScale = getElementScale('viewingPage')
		targetScale = curTransform.a;
																
		//targetEvent.push(e.touches[0])
		
		touchPointY = e.originalEvent.pageY; // targetEvent[0].clientY-currentTop;
		touchPointX = e.originalEvent.pageX; // targetEvent[0].clientX-currentLeft;
		
		/*			
		if(e.touches.length == 2){			
			targetEvent.push(e.touches[1])//fingers
			touchPointY = [targetEvent[0].clientY,targetEvent[1].clientY];
			touchPointX = [targetEvent[0].clientX,targetEvent[1].clientX];			
		}
		*/
		var thisDate = (new Date()).getTime()
		var secs = (thisDate - lastTouch) / 100
		
		//hideAllPopUps();
				
		if (secs < 10 && secs > 5 ){
			e.preventDefault();
			//showHideZoom("block", e)
			
		}else{
			videoPlaying=0;
			hideAllPopUps();
			removeButtonEffect()
		}
		
		//e.preventDefault();
		lastTouch = (new Date()).getTime();
	}



function touchScaleStart(e) {
		e.preventDefault();
		startTouchX = e.targetTouches[0].pageX;
		startTouchY = e.targetTouches[0].pageY;
	}
		
function touchScale(e) {				
		e.preventDefault();									
		var targetEvent = e.touches[0];		
		var curX
		var curY				
		if(e.touches.length==2 && e.touches[0] && e.touches[1]){		
			var newScale =  e.scale*targetScale ;						
			e.target.style.webkitTransform = "scale("+newScale+")"			
			e.target.style.webkitTransformOrigin =  "50"+"% "+"50"+"%"											
						
		}else if(e.touches.length==1){
			
			curX = e.targetTouches[0].pageX - startTouchX;
			curY = e.targetTouches[0].pageY - startTouchY;
			e.targetTouches[0].target.style.webkitTransform ='translate(' + curX + 'px, ' + curY + 'px)';
			
		}						
	}


function touchMove(e) {
		
		e.preventDefault();
						
		var targetEvent = e.originalEvent.touches[0];
				
		if(e.originalEvent.touches.length==2 && e.originalEvent.touches[0] && e.originalEvent.touches[1] && config.orientationFormat=="P"){
		
			var curTransform = new WebKitCSSMatrix(window.getComputedStyle(viewingPage).webkitTransform);
			
			var newScale =  e.originalEvent.scale  * targetScale ;
						
			$('#viewingPage').css({webkitTransform : "scale("+newScale+")"})			
			$('#annotsDiv').css({webkitTransform : "scale("+newScale+")"})
			
			$('#viewingPage').css({webkitTransformOrigin :  "50"+"% "+"50"+"%"})				
			$('#annotsDiv').css({webkitTransformOrigin : "50"+"% "+"50"+"%"})
							
						
		}else if(e.originalEvent.touches.length==1 ){// treated as a single finger gesture
			
			deltaY = (touchPointY - (targetEvent.clientY-currentTop)).toFixed(0)
			deltaX = (touchPointX - (targetEvent.clientX-currentLeft)).toFixed(0)							
						
			deltaY *= 1.0
			deltaX *= 1.0
			
			deltaX = deltaX.toFixed(0)
			deltaY = deltaY.toFixed(0)
						
			var left_right = (touchPointX > targetEvent.clientX-currentLeft) ? 1 : -1
			var up_down = (touchPointY > targetEvent.clientY-currentTop) ? 1 : -1
									
			var prop = getElementSize(viewingPage)
			
			var thisTop = prop.top.toFixed(0)-0; //parseInt(viewingPage.style.top)  //
			var thisLeft = prop.left.toFixed(0)-0;
			var thisHeight = prop.height.toFixed(0)-0; // parseInt(viewingPage.style.height).toFixed(0)-0; //
			var thisWidth = prop.width.toFixed(0)-0;
								
																
			if(deltaX>0){
				$('#fadeNextDiv').css({display:"block"})
				$('#fadePrevDiv').css({display: "none"})
				trace("showing next")
			}else if(deltaX < 0 && pageIndex > 1){
				$('#fadePrevDiv').css({display :"block"})	
				$('#fadeNextDiv').css({display: "none"})
			}
																
			currentTop = (currentTop) ? currentTop : 0;
			
			var xOffset = (thisLeft - $('#viewingPage').position().left)
			var yOffset = (config.orientationFormat=="P")? thisHeight-parseInt($('#viewingPage').height())/2 : (thisHeight-$(window).height())+74		
			
			var maxY = 0
			var minY = yOffset*-1
																		
			if(targetScale == 1 && config.orientationFormat=="P"){
				newTopPos = 0 // in portrait mode, normal scale the pages do not change vertical position
			} 
			
			if(config.orientationFormat=="L"){
			
				newTopPos =  currentTop - deltaY
				
				if(newTopPos < minY){
					newTopPos = minY
				}
				if(newTopPos > maxY){
					newTopPos = maxY
				}
						
			}
									
			newLeftPos =  currentLeft-deltaX
									
			if(targetScale != 1){// allow dragging the page if it is zoomed
			
				//trace("targetScale: "+targetScale+  "dragging")
				
				var justifyRight = (thisWidth-($(window).width()+12))*-1
				var justifyLeft = -8
				
					if(newLeftPos < justifyRight-xOffset){
						newLeftPos = justifyRight-xOffset
						
					}else if(newLeftPos-0 > justifyLeft-xOffset){
						newLeftPos = justifyLeft-xOffset
						
					}
									
				newTopPos = currentTop - deltaY
				
				var maxY = yOffset
				var minY = yOffset*-1
				
					if(newTopPos > maxY){
						newTopPos = maxY						
						
					}else if(newTopPos < minY){
						newTopPos = minY						
					}	
				//trace("newTop: "+newTopPos+  "left"+newLeftPos)																											
			}	
												
				$('#annotsDiv').css({top : newTopPos+"px"});
				$('#viewingPage').css({top : newTopPos+"px"});
							
						
				$('#annotsDiv').css({left : newLeftPos+"px"});
				$('#viewingPage').css({left : newLeftPos+"px"});
				
			
			setNextPrevPages()
		}
				
	}

function touchScroll(e,fn){
    //behaviour for end
    trace("touchscroll:"+fn);
    
    if(!touchEnabled){
    	eval(fn)
	    return
    }
    
    $(document).on('touchend', e.target.id, function(e){
        eval(fn)       
        $(document).off('touchend', e.target.id);
        });
    //behaviour for move
    $(document).on('touchmove', e.target.id, function(e){
        $(document).off('touchend',e.target.id);
        trace("moved");
        });     
   
}

function touchEnd(e) {
			
		var targetTop = e.originalEvent.target;
		
		var thisDate = (new Date()).getTime()
		var secs = (thisDate - lastTouch) / 1000
				
		//switch page to hi-res view after gestures	
		var curTransform = new WebKitCSSMatrix(window.getComputedStyle(viewingPage).webkitTransform);
		//trace(curTransform.a)
	
		var newScale = curTransform.a
				
		var isZoomed = ((targetScale-0+newScale)/2 != 1) ? true : false
		
		//trace("targetScale:"+targetScale+" "+newScale +" "+isZoomed+" " +secs)
						
		if ((secs < 1 && !isZoomed ) || (Math.abs(deltaX) > 50 &&  !isZoomed)) {
																					
				if (deltaX > 0 && pageIndex-0 < magazoom.npages) {										
					//trace("nextPage")					
					//viewingPage.style.display:"none";
												
					nextPage();						
												
					
				} else if (pageIndex-0 > 1 && deltaX < 0) {					
					//trace("prevPage")
									
					prevPage();					
					
				}				
		}
		else{
				
			//trace(" not page turn - scaling:"+targetScale+" "+newScale)
									
			if(newScale-0 < 1.0 || targetScale-0 < 1.0 ){	
					//trace("too small:"+targetScale+" "+newScale)					
					$('#viewingPage').css({width : dynamicPageWidth+"px"})					
					updateDisplay(1) // set back to original size					 
				}
			else if(isZoomed){
				
				logEvent('zoom',getPageName(pageIndex),magazoom.seo_title,pageIndex-0,false);
			}
						
		}
		
		if(e.originalEvent.touches.length==0){		 	
		 	currentTop =  parseInt($('#viewingPage').css('top')).toFixed(0)-0
		 	currentLeft = parseInt($('#viewingPage').css('left'))
		 	//showHideBackgroundPagesForMove('block')
		 	//movingPage.style.display ="none";		 	
		 }
		 targetScale = newScale;
		 //trace(secs+" x="+(deltaX) +" currentTop:"+currentTop + " left:"+currentLeft)
	}

function swipeStart(e){
	startTime = (new Date()).getTime()
	startPoint =  e.originalEvent.pageX	
	}

function swiping(e){
	endPoint =  e.originalEvent.pageX	
	}
	
function swipeEnd(e){
	
	var d = (new Date()).getTime()
	var secs = (d-startTime)/100
	var delta = startPoint-endPoint	
	//trace("swipeEnd:"+secs)
	if(secs> 1 && secs <6){
		if(delta>30){
			hideAllPopUps()
			$('.magazine').turn('next')
		}else if(delta<-30){
			hideAllPopUps()
			$('.magazine').turn('previous')
		}
	}	
}


function showHideReader(){

	viewMode = (viewMode==0)? 1 : 0;	
	setMode(viewMode)	
}


function setMode(v){

	trace(currentSpreadIndex)
	
	var p = spreadsNumbering[currentSpreadIndex]

	if(p.toString().split('-').length>1){
		var spg =   p[0]
		
	}
	else{
		var spg = p
	}
	
	if(v==1){
		
		logEvent('view mode','text only:pg'+spg,magazoom.seo_title,null,false);
		
		if (touchEnabled){
		$(document).off('zoom.doubleTap','.magazine-viewport', zoomTo);		
		}	
		else{
		$(document).off('zoom.tap', '.magazine-viewport',zoomTo);
		}
						
	}
	else{
		
		logEvent('view mode','all content:pg'+spg,magazoom.seo_title,null,false);	
		if (touchEnabled){
		$(document).on('zoom.doubleTap','.magazine-viewport', zoomTo);
		}	
	else{
		$(document).on('zoom.tap', '.magazine-viewport',zoomTo);
		}
		
	}
	
	trace(spg)
	var mxPg = Math.min(magazoom.npages,spg+7)
	for(var i = spg; i < mxPg; i++){
			$('.magazine').turn("removePage", i);
			addPage(i, $('.magazine'))
		}
	$('.magazine').data().totalPages = magazoom.npages;
	
	trace($('.magazine').data().totalPages)	
	return;	
}
	
</script >

</head>

<body onload='init()' >


<div id="windowDiv" class='auth'>		
		
	<div id = "toolbarBotDiv" >
		<table  id = "toolbarBot" > 
		<tr>
			
		<td style="width:10%;">
			<div alt="fast scroll back"  class="fsb fastScrollBack fastScrollBtn" data-object="fastScrollBackPages()" style="height:25px;width:50px;">
			</div>
		</td>
		<td id = "displayPageNum" style = "width:80%; height:40px; text-align:center;" >
	   		
	   		<div id="pageSlider" class="customSlider" style="display:block; top:4px;width:100%;z-index:2000;" >
				<div id="pageSliderProgress" class="progressBar progressBarColor" ></div>	
			</div>
	   	
	    </td>	     
	    <td style="width:10%;">
	    	<div style="height:25px;width:50px;" title="fast scroll forward" alt="fast scroll forward" class="fsf fastScrollFwd fastScrollBtn" data-object="fastScrollForwardPages()" >	</div>

	    </td>
        	
  		</tr>

		</table>

	</div>	
	
	<div class='thumbar navTab navTabHorz'></div>


	<div class="masterNav">
		<div class='buttonObject tocIcon icon' data-action='showIndex(1)'></div>
		<div class='buttonObject pagesIcon icon' data-action='showPages(1)'></div>
		<div class='buttonObject cartIcon icon' data-action='showHideCart(1)'></div>
		<div class='saveIcon icon saveAll' data-action='setPDFDownload(event)'></div>
<!-- 		<div class='buttonObject shareIcon icon' data-action='showHideShare(1)'></div> -->
		<div class='buttonObject archiveIcon icon' data-action='showArchives(1)'></div>
		<div class='buttonObject infoIcon icon' data-action='showInfo(1)'></div>
		<div class='buttonObject helpIcon icon' data-action='showHelp(1)'></div>
		<div class="shareIconDiv">
			<div class='buttonObject facebookIcon icon' data-object='shareFacebook()'></div>
			<div class='buttonObject twitterIcon icon'  data-object='shareTweet()'></div>
			<a href='' class='shareLink'><div class='buttonObject linkIcon icon'></div></a>
			<a href='' class='shareSMS'><div class='buttonObject smsIcon icon'></div></a>
		</div>
		<div class='searchDiv'>
			 <input id="searchInput" type='text' name='searchInput' value='' onkeyup="autoSubmit(event)">
		</div>
	</div>

	

	<div id = "book" class='book auth'>	

		<div id="fadePrevDiv" class='fadePrevDiv'></div>
		<div id="fadeNextDiv" class='fadeNextDiv'></div>
		
		<div id="stackedPages" class="stackedPages"></div>
		<div id="viewingPage"></div>
		<div id="movingPage"></div>
				

		<div  id="annotLayer" >
			<div class='linksDiv' id="annotsDiv" ></div>
		</div>
		
		</div>

	<div id="bubbleDiv" class="mybubble" ></div>
			
	
	
	<div id="cartDiv" >	
		
		<div class='cartHeader' >
			<button id="showCartButton"  class='tabOn' data-object="showCart(0,event)" ></button>
			<button id="showCartHistoryButton"  data-object="showCart(1,event)" class='tabOff'></button>
			<div id="shoppingHistoryCallout" class="numberCalloutDisabled"></div>
			<img class="buttonObject close" style='position:absolute; top:-3px;right:2px; ' data-object="showHideCart('none')" src="images/close.png">
		</div>
		<div id="cartContentDiv">			
			<div id="currentCartDiv"></div>
			<div id="historyCartDiv"></div>
		</div>
		
		<div id="cartFooter" ></div>
		<div class='buttonObject closeButton' data-action='showHideCart()'>x</div>			
	</div>			

</div>



<div id="pointerDiv" class="pointerDiv" >
	<div class="pointer"></div>
</div>


<div id="cacheDivPrev"></div>

<div id="cacheDivNext"></div>

<div id="contactUsDiv" class='popupDiv'>
	<table class='contactUsTable' style="border-collapse:collapse; width:90%; padding:4px; overflow:hidden;">
		<tr><td><h3 class="ContactUsHeader"></h3></td></tr>	
		<tr><td><h3 class="EmailLabel"></h3><input id='contactEmail' type="email" size=30 style='font-size:14px; width:220px; height: 20px;'/></td></tr>
		<tr><td></td></tr>
		<tr><td><textarea id='comment' ></textarea></td></tr>
		<tr><td></td></tr>
		<tr><td><div  style='height: 40px;' data-object="sendComment()" class="buttonObject aButton ContactUsSendBtn"></div>
		</td></tr>
	</table>
	<div id="contactInfo" class="contactInfo"></div>
	<div class='buttonObject closeButton' data-action='showHideCart()'>x</div>	
</div>

<div id="webDiv"><iframe id="webFrame"></iframe></div>

<div id="spreadsDiv" class='auth' >	
	<div id="spreadContentDiv">
		<div id="canvas">
			<div class="magazine-viewport" >
				<div class="container" >
					<div class="magazine" >
						<!-- Next button -->
						<div ignore="1" class="next-button">
							<div  title="go to next page" class="nextBtnArrow nextpage"></div> 
						</div>
						<!-- Previous button -->
						<div ignore="1" class="previous-button">
							<div title="go to previous page"  class="prevBtnArrow prevpage"></div>
						</div>
					</div>
				</div>
			</div>
		</div>		
	</div>	
	
	<div><table id='spreadsSliderTable'  class="spreadsSliderTable">
	<tr>	
	<td style="width:50px; ">
	<div  style="top:2px;margin-right:10px;width:50px;height:25px;" class='fsb scrollButton fastScrollBackSpreads' title="fast scroll back"></div>
	</td>
	<td style='padding-top:14px;'>
		<div id='spreadSlider' class='customSlider' style='z-index:auto;position:relative;'>
			<div id='spreadSliderProgress' style='z-index:4000002;' class='progressBar progressBarColor'></div>
			<div id="spreadSliderButton" style="display:none;" class='sliderButton'></div>		
		</div>
	</td>
	<td style="width:50px;">
	<div style="margin-left:10px;top:2px;width:50px;height:25px;" class='fsf scrollButton fastScrollForwardSpreads' title="fast scroll forward" ></div>
	</td>	
	</tr></table></div>	
</div>


<div id="searchResultsDiv" >

		<div id='searchResultsTab' data-object="showHideSearchResults('block')" class="buttonObject -rot" ><img id='resultsArrow'   style='top:6px;position:relative;line-height:12px;' src='http://www.magazooms.com/mobi/tablet/images/downArrow.png' /></div>
		<div id='searchSave' ></div>	
		<div id="contentDivSearchResults" class='content'></div>
		<!-- <div id="divFooterSearchResults" class='divFooter'></div> -->			
</div>
			




<div id="spinnerDiv" style='border:2px red dotted;' ></div>

<div id="titleDiv" class="titleDiv"></div>

<div class="alertDiv popupDiv">
	<div data-action='showHideAlert()' class='closeButton buttonObject'>x</div>
	<div class='alertTitle'></div>
	<div class='alertContent'></div>
	<div class='alertFooter'></div>
</div>

<div id="spark"></div>


<div class='loading' id="loadingDiv" >
	<div id='loadingHeader' style='height:20%;'></div>
	<div id='spinnerBox' style='height:100%;width:100%'></div>
	<div id='loadingFooter' style='width:90%;text-align:center;  position:absolute; bottom:0px;padding:5%;'></div>
</div>



<div id="taskbarTab" class="buttonObject" data-object="toggleFullScreen()">show toolbar</div>

<div id="productPopUpDiv"  ></div>


<div id="dynDiv" class="dyn">
		<div id='dynptrDiv' class='dynptrDiv'>
 			<div id='dynptr' class='dynptr'></div>
		</div>
		<div id="contentHeader" class='close'><img class='buttonObject' data-object="showHideDynDiv('none')"  src='images/close.png'></div>	
		<div id="contentDiv"></div>
		<div id="divFooter" class='divFooter'></div>

</div>
<div id="indexDiv" class="dyn">	
		<div class='buttonObject closeButton' data-action='showIndex(1)'>x</div>
		<div class="indexContent"></div>		
</div>

<div id="searchHistoryDiv" class="dyn">
		<div class='dynptrDiv'>
 			<div class='dynptr'></div>
		</div>			
		<div class="historyContent"></div>
		<div  class='divFooter'></div>

</div>

<div id="nextPgBtn" class='pgBtn nxtPgBtn' data-object='nextPage()'></div>
<div id="prevPgBtn" class='pgBtn prvPgBtn' data-object='prevPage()'></div>

<div id='pickerDiv'></div>
<div id='openerDiv' class='openerDiv' ></div>
<div id='seslogDiv'></div>

<div class='indicatorDiv auth'>
	<input type='text' id="spreadsIndicator" class="sliderIndicator buttonObject"  data-object="clearInput(event, 'spreadsIndicator')" title="enter a page number" onkeyup="autoCommit(event)" onFocus="onDataEntry(event)" onBlur="onDataEntry(event)" >
</div>

<div id="youTubeListDiv" class='dyn'>
	<div id='ytptrDiv' class='dynptrDiv'>
 			<div id='ytptr' class='dynptr'></div>
 	</div>
 	<div id='youTubeContent' class="content"></div>
</div>


	<div id="youTubeDiv" >
		<div id="youTubeDivHeader" class='close'><img class='buttonObject' data-object="showHideYouTubeWindow('none')" title="hide this window"  src='images/close.png'></div>
		<div id="youTubeDivContent"></div>
	</div>

<div id='moreDiv'>...scroll for more</div>
<div id="splashDiv"></div>
<div id='chatDiv' style='position:absolute;' class='chat'></div>




<div class='r1 rlReader'></div>
<div class='r2 rlReader'></div>

<div class="languagesDiv" style='display:none;' >
<div class='cs-cz buttonObject langIcon' data-object='selectLanguage(event)'></div>
<div class='de-de buttonObject langIcon'  data-object='selectLanguage(event)'></div>
<div class='en-us buttonObject langIcon'  data-object='selectLanguage(event)'></div>
<div class='es-es buttonObject langIcon'  data-object='selectLanguage(event)'></div>
<div class='fr-fr buttonObject langIcon'  data-object='selectLanguage(event)'></div>
<div class='it-it buttonObject langIcon'  data-object='selectLanguage(event)'></div>
<div class='pt-pt buttonObject langIcon'  data-object='selectLanguage(event)'></div>
</div>


<div id="loginDiv">
	
	<div style="height:90px;border:0px red dotted;overflow:hidden; margin-top:0px; ">
		<h3 class='loginRequiredLabel'></h3><h3 class='loginTitle'></h3>
	</div>
	
	<div id="loginTable" style='margin:5px;'><table style="border-collapse:collapse; width:300px;position:relative;top:15px;">	
		<tr>
			<td style="width:32%;"><h4 class='usernameLabel'></h4></td>
			<td><input id="uname" size="18" name='uname' style="font-size:14px;"  ></td>
		</tr>
		<tr>
			<td ><h4 class='passwordLabel'></h4></td>
			<td ><input type='password' id="pwd" name='pwd' size="18" style="font-size:14px;" onkeydown="autoLogin(event)" ></td>
		</tr>	
		</table>
	</div>
	
	<div style="height:75px; padding:5px; text-align:center; overflow:visible; width:100%; position:absolute; left:0px; bottom:-15px;  ">
		<div style="display:inline-block; width:100px; position:relative;  top:5px; min-height:30px;" class="loginBtn button buttonObject" data-object="login()" ></div>
		<div style="display:inline-block; width:100px; position:relative;  top:5px; min-height:30px;" class="cancelBtn button buttonObject" data-object="showHideLogin()" ></div>
	</div>
	
	<div style="margin-top:20px;text-align:center; overflow:visible; width:100%; position:absolute;  left:0px; bottom:0px; ">
	<div class="button forgotLoginBtn" style='margin:10px;	height: 25px;	padding-left: 10px; padding-right: 10px;' data-object="showHideContact(1);" ></div>
	</div>
	
</div>

<div class='pagesDiv linen'>
	
	<ul class='pagesContent'></ul>
</div>

<div id="toolTipDiv" ></div>


<div class='buttonObject langIcon flagIcon'  title='' data-object='showHideLanguages(1)'></div>

</body>

</html>
