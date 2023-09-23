<?php
    /**
     * https://bulba.site/lib2/engine/back/open-book.php?book=PMBOKGuideFourthEdition_protected
     */
    $book = $_GET["book"];
    
    //read email
    session_start();
    if (isset($_SESSION['email'])) {
        $email = $_SESSION['email'];
    } else {
        echo "Variable not set.";
        exit('email not set');
    }
        
    $shelf_path = "../../shelf/private/" . $email ."/";
    $book_current_page_file_path = $shelf_path . "curpages/" . $book;
    if (file_exists($book_current_page_file_path)) {
        $myfile = fopen($book_current_page_file_path, "r") or die("Unable to open file:" . $book_current_page_file_path);
        $current_page = trim(fgets($myfile));
        $top_offset = trim(fgets($myfile));
    } else {
        $current_page = 1;
        $top_offset = 792; //page start
    }

    $location = "../front/web/viewer.html?file=../" . $shelf_path . $book . '.pdf#page=' . $current_page . '&zoom=100,0,' . $top_offset; //TODO: save zoom as well
    header('Location: ' . $location);
?>