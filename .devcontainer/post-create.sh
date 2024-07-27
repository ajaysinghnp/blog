#!/bin/sh

# Loading common functions
. .devcontainer/utils.sh

# Install the version of Bundler.
banner "Installing the version of Bundler"
if [ -f Gemfile.lock ] && grep "BUNDLED WITH" Gemfile.lock >/dev/null; then
	tail <Gemfile.lock -n 2 | grep -C2 "BUNDLED WITH" | tail -n 1 | xargs gem install bundler -v
fi

# If there's a Gemfile, then run `bundle install`
# It's assumed that the Gemfile will install Jekyll too
if [ -f Gemfile ]; then
	banner "Gem file found! Running bundle install"
	bundle install
else
	banner "No Gem file found! Skipping bundle install"
fi