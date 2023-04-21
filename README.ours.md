Run with node 16

### Local development

If there is some issue with pdf preview on webclient and need to be fixed in this project, after the fix is done
run `gulp minified`. 
You should see that ~minified~ folder is created inside ~build~ folder with content of three sub directories: build, image_decoders, web.

To reflect those changes locally on webclient, go into that project and run 
`node get-pdfjs-dist.js --localPath=<path-of-pdf.js-cloned-repo>`

Afer that, your locally run webclient should have changes you made in pdf.js project.


### Release process

Once fix/change is merged to master and that version is ready for use we need to create a new release.

To create new release go to github ~Releases~ section and ~Draft a new release~

Put there release name together with short description of changes and bump tag with next patch version.

In the part where binaries should be added, locally created zip should be uploaded.


#### Steps for creating zip:

- Go to your cloned repo, and in terminal run `gulp minified`.
- You should see that ~minified~ folder is created inside ~build~ folder with content of three sub directories: build, image_decoders, web
- Those three sub dirs need to go to pdfjs-dist folder (you can create it as new folder and move those three to it)
- Compress pdfjs-dist into v{tagNumber}-pdfjs-dist.zip and upload it to release
