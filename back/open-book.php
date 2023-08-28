<?php
    /**
     * https://bulba.site/lib2/engine/back/open-book.php?book=PMBOKGuideFourthEdition_protected&email=prefixoid@gmail.com
     */
    $book = $_GET["book"];
    $email = $_GET["email"];
    $shelf_path = "../../shelf/private/" . $email ."/";
    $book_current_page_file_path = $shelf_path . "curpages/" . $book;
    if (file_exists($book_current_page_file_path)) {
        $myfile = fopen($book_current_page_file_path, r) or die("Unable to open file:" . $book_current_page_file_path);
        $current_page = fgets($myfile);
    } else {
        $current_page = 1;
    }
    
    $location = 'https://bulba.site/lib2/engine/front/web/viewer.html?file=../' . $shelf_path . $book . '.pdf#page=' . $current_page;
    header('Location: ' . $location);
?>