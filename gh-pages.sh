# recreate gh-pages branch
git branch -Dr origin/gh-pages
git branch -D gh-pages
git checkout -b gh-pages

# rebuild it without source map
browserify index.js -o build/index.js # assumed: npm install -g browserify

# remove files from tree that we don't want on CDN
git rm .gitignore data.js index.js package.json build.sh gh-pages.sh

# add the build folder (normally git-ignored)
git add build

# commit the deletes + the build folder
git commit -am 'CDN files'

# push to CDN
git push origin gh-pages -f

# back to master and all is as it was
git checkout master
git status
