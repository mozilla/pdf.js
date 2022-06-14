docker build --no-cache --tag=pdfjs-viewer:latest .
docker login --username=docker13972684 --password=Docker@13972684
docker tag pdfjs-viewer:latest docker13972684/pdfjs-viewer:latest
docker push docker13972684/pdfjs-viewer:latest
docker run -dit --name keycloak -p 8080:8080 docker13972684/pdfjs-viewer:latest


#docker stop $(docker ps -q)
#docker kill $(docker ps -q)
#docker rm $(docker ps -a -q)
#docker rmi $(docker images -q) -f
#docker volume ls -qf dangling=true | xargs -r docker volume rm
