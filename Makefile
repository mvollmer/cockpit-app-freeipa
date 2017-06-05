all:
	npm run build

clean:
	rm -rf dist/

srpm:
	tar -C dist/ -czf cockpit-app-freeipa.tar.gz .
	rpmbuild -bs \
	  --define "_sourcedir `pwd`" \
          --define "_srcrpmdir `pwd`" \
          cockpit-app-freeipa.spec

.PHONY: dist
