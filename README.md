## Cockpit FreeIPA Installer

This is a Cockpit add-on that can install and setup FreeIPA.

### Building

```
$ npm install
$ npm run build
$ ln -s .../cockpit-app-freeipa/dist ~/.local/share/cockpit/app-freeipa
```

There is also a Makefile that can make a srpm for you.
