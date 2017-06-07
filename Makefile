all:
	npm run build

clean:
	rm -rf dist/

srpm: clean all
	rm -rf _install
	mkdir -p _install/usr/share/cockpit
	cp -r dist/ _install/usr/share/cockpit/app-freeipa
	mkdir -p _install/usr/share/metainfo/
	cp *.metainfo.xml *.png _install/usr/share/metainfo/
	tar -C _install/ -czf cockpit-app-freeipa.tar.gz .
	rpmbuild -bs \
	  --define "_sourcedir `pwd`" \
          --define "_srcrpmdir `pwd`" \
          cockpit-app-freeipa.spec

.PHONY: dist
