<?php
    $token = $_POST["credential"];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://oauth2.googleapis.com/tokeninfo?id_token=" . $token);
    curl_setopt($ch, CURLOPT_HEADER, 0);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);
    $email = json_decode($response, true)["email"];
    
    $dir_path = "../../shelf/private/" . $email;
    if (!file_exists($dir_path)) {
        mkdir($dir_path, 0777, true);
    }
    $files = array_diff(scandir($dir_path), array('..', '.'));
    echo "<ul>";
    foreach ($files as $file_name) {
        if(is_file($dir_path . "/" . $file_name)) {
            $book_name = substr($file_name, 0, strpos($file_name, ".pdf"));
            $str = '<li><a href="https://bulba.site/lib2/engine/back/open-book.php?book=' . $book_name . '&email=' . $email .'">' . $book_name . '</a></li>';
            print($str);
        }
    }
    echo "</ul>";
?>