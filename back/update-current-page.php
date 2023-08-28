<?php
    /**
     * https://bulba.site/lib2/engine/back/update-current-page.php?book=TurnTheShipArround&current-page=22&email=prefixoid@gmail.com
     */
    $book = $_GET["book"];
    $current_page = $_GET["current-page"];
    $email = $_GET["email"];
    
    $dirname = "../../shelf/private/". $email ."/curpages/";
    if (!is_dir($dirname))
    {
        mkdir($dirname, 0755, true);
    }
    
    $current_page_file = fopen($dirname . $book, "w") or die("Unable to open file!");
    fwrite($current_page_file, $current_page);
?>