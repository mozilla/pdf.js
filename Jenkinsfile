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
      stage("Git Checkout"){
          steps {
            git([
            url: "https://github.com/Hermesss/pdf.js.git",
            branch: 'denys.lapenkov_jenkins',
        ])
      }
    }
}
}