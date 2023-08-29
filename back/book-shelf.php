<!DOCTYPE html>
<html>
<body>
<?php      
    //read email
    session_start();
    if (isset($_SESSION['email'])) {
        $email = $_SESSION['email'];
    } else {
        echo "Variable not set.";
        exit('email not set');
    }
    
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
    
    
print('<br><form action="upload.php?email='. $email .'" method="post" enctype="multipart/form-data">');
?>
  Select pdf file to upload:
  <input type="file" name="fileToUpload" id="fileToUpload">
  <input type="submit" value="Upload" name="submit">
</form>

</body>
</html>