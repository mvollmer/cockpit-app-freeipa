## Cockpit FreeIPA installer Minimal Viable Proof Of Concept

This is something that people can point fingers at and say "This
sucks" and start making it suck less.

### Building

```
$ npm install
$ npm run build
$ ln -s .../cockpit-app-freeipa/dist ~/.local/share/cockpit/app-freeipa
```

There is also a Makefile that can make a srpm for you.
