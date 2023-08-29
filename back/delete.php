<?php
    $book = $_GET["book"];
    //read email
    session_start();
    if (isset($_SESSION['email'])) {
        $email = $_SESSION['email'];
    } else {
        echo "Variable not set.";
        exit('email not set');
    }
    $filePath = "../../shelf/private/" . $email . "/" . $book . ".pdf";
    
    if (unlink($filePath)) {
        //echo "File deleted successfully.";
            $location = 'https://bulba.site/lib2/engine/back/book-shelf.php';
            header('Location: ' . $location);
    } else {
        echo "File deletion failed.";
    }
?>