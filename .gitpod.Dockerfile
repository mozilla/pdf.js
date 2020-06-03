FROM gitpod/workspace-full-vnc

USER gitpod

RUN sudo apt-get update && \
    sudo apt-get install -yq firefox && \
    sudo rm -rf /var/lib/apt/lists/*
