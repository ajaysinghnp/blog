#!/bin/sh

# Load common functions
. .devcontainer/utils.sh

# Set up git
banner "Adding git user"
git config --global user.name "Ajay Singh"

banner "Adding git email"
git config --global user.email "admin@ajaysingh.com.np"

banner "Setting up safe workspace"
git config --global --add safe.directory ${containerWorkspaceFolder}