module.exports = function(grunt){

    grunt.loadNpmTasks('grunt-bump');

    grunt.initConfig({
      bump: {
        options: {
          files: ['bower.json','package.json'],
          updateConfigs: [],
          commit: true,
          commitMessage: 'Version %VERSION%',
          commitFiles: ['bower.json','package.json'],
          createTag: true,
          tagName: 'v%VERSION%',
          tagMessage: 'Version %VERSION%',
          push: true,
          pushTo: 'origin',
          gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d'
        }
      },
    })

};