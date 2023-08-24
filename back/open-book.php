<?php
    /**
     * https://bulba.site/lib2/engine/back/open-book.php?book=TurnTheShipArround
     */
    $dirname = "../../shelf/curpages/";
    $book = $_GET["book"];
    $bookPath = $dirname . $book;
    if (file_exists($bookPath)) {
        $myfile = fopen($bookPath, r) or die("Unable to open file:" . $bookPath);
        $current_page = fgets($myfile);
    } else {
        $current_page = 1;
    }
    
    header('Location: https://bulba.site/lib2/engine/front/web/viewer.html?file=../../../shelf/' . $book . ".pdf#page=" . $current_page);
?>