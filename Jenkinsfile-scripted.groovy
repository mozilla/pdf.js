node ('linux') { 
          stage('Source') { 
              git poll: true,
              branch: 'denys.lapenkov_jenkins', 
              url: 'https://github.com/Hermesss/pdf.js.git'
          }
          stage('Install tools') { 
              sh '''
               curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
                sudo apt-get install -y nodejs
                sudo apt install -y build-essential 
                sudo npm install -g gulp-cli 
                sudo npm install '''
            }
          stage('Build') {
                sh label: '', script: 'gulp generic'                }  
          stage('Archive Artifacts') {
                archiveArtifacts artifacts: 'build/generic/build/*.js*', followSymlinks: false, onlyIfSuccessful: true
                }
}
