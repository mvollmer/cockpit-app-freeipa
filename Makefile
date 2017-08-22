all:
	npm run build

install: all install-only

install-only:
	mkdir -p $(DESTDIR)/usr/share/cockpit
	cp -r dist/ $(DESTDIR)/usr/share/cockpit/app-freeipa
	mkdir -p $(DESTDIR)/usr/share/metainfo/
	cp org.cockpit-project.app-freeipa.metainfo.xml $(DESTDIR)/usr/share/metainfo/
	cp org.cockpit-project.app-freeipa.64x64.png $(DESTDIR)/usr/share/metainfo/

clean:
	rm -rf dist/

EXTRA_DIST = \
	README.md \
	org.cockpit-project.app-freeipa.metainfo.xml \
	org.cockpit-project.app-freeipa.64x64.png \
	package.json \
        .eslintrc.json \
	webpack.config.js \
	webpack-with-stats \
	Makefile

cockpit-app-freeipa.tar.gz: clean all
	tar czf cockpit-app-freeipa.tar.gz --transform 's,^,cockpit-app-freeipa/,' $$(cat webpack.inputs) package.json $(EXTRA_DIST) dist/

srpm: cockpit-app-freeipa.tar.gz
	rpmbuild -bs \
	  --define "_sourcedir `pwd`" \
          --define "_srcrpmdir `pwd`" \
          cockpit-app-freeipa.spec
