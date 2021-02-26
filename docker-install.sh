docker build --no-cache --tag=pdfjs-viewer:latest .
docker login --username=docker13972684 --password=Docker@13972684
docker tag pdfjs-viewer:latest docker13972684/pdfjs-viewer:latest
docker push docker13972684/pdfjs-viewer:latest