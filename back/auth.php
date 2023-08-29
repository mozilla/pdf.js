<?php
    if(isset($_POST['credential'])) {
        $token = $_POST["credential"];
    } else {
        exit('credential is not set. '. $_SERVER['PHP_SELF'] .' should be used only as login handler.');
    }
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://oauth2.googleapis.com/tokeninfo?id_token=" . $token);
    curl_setopt($ch, CURLOPT_HEADER, 0);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);
    $email = json_decode($response, true)["email"];
    session_start();
    $_SESSION['email'] = $email;
    $location = 'https://bulba.site/lib2/engine/back/book-shelf.php';
    header('Location: ' . $location);
?>