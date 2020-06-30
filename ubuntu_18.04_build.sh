curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo apt install -y build-essential 
sudo npm install -g gulp-cli
sudo npm install

git clone https://github.com/mozilla/pdf.js.git
cd pdf.js

gulp generic

gulp server
