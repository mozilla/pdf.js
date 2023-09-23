<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Book List</title>
<style>
    ul {
        list-style: none;
        padding: 0;
    }
    li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #ccc;
    }
    button {
        padding: 5px 10px;
        cursor: pointer;
    }
    
    /*make links as regular text*/
    /* Remove default link styling */
    a {
        text-decoration: none;
        color: inherit; /* Use the parent element's text color */
        cursor: pointer; /* Change cursor to indicate interactivity */
    }
    
    /* Define a hover effect */
    a:hover {
        text-decoration: none; /* Add underline on hover */
    }
</style>
</head>
<body>
<h1>Book List</h1>
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
    echo '<ul id="bookList">';
    foreach ($files as $file_name) {
        if(is_file($dir_path . "/" . $file_name)) {
            $book_name = substr($file_name, 0, strpos($file_name, ".pdf"));
            $str = '<li><span><a href="https://bulba.site/lib2/engine/back/open-book.php?book=' . $book_name . '">' . $book_name . '</a></span>   
            <button onclick="location.href=\'https://bulba.site/lib2/engine/back/delete.php?book=' . $book_name . '\'" type="button">Delete</button></li>';
            print($str);
        }
    }
    echo "</ul>";
    
    
print("<br>Upload book");
print('<form action="upload.php?email='. $email .'" method="post" enctype="multipart/form-data">');
?>
<!--style="width: 85px;"-->
<input type="file"    name="fileToUpload" id="fileToUpload" onchange="this.form.submit()">
</form>
<!--<button id="uploadButton">Upload Book</button>
<script>
    // Event listener for upload button
    uploadButton.addEventListener('click', () => {
      fileInput.click();
    });
    
    // Event listener for file input change
    fileInput.addEventListener('change', event => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
                window.open(url="upload.php?email=<? echo $email ?>&file=" + selectedFile.name);
        }
    });
</script>
</form>-->

</body>
</html>