pipeline {
    agent {
        node {
            label "linux"
        }
    }
    triggers {
        pollSCM('* * * * *')
    }
  stages {
      stage("Install tools"){
          steps{
              sh '''
               curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
                sudo apt-get install -y nodejs
                sudo apt install -y build-essential 
                sudo npm install -g gulp-cli
                sudo npm install
               '''
              }
          
      }
      stage("Build"){
          steps {
            sh '''
               gulp generic
               '''
        
      }
    
      post{
          always{
              archiveArtifacts artifacts: 'build/generic/build/*.js*', followSymlinks: false, onlyIfSuccessful: true
          }
          
      }
      }
}
}