Name: cockpit-app-freeipa
Version: 10
Release: 0
Summary: FreeIPA installer for Cockpit
License: LGPLv2.1+

Source: cockpit-app-freeipa.tar.gz
BuildArch: noarch

Requires: freeipa-server

%define debug_package %{nil}

%description
FreeIPA installer for Cockpit

%prep
%setup -n cockpit-app-freeipa

%build

%install
make install-only DESTDIR=%{buildroot}
find %{buildroot} -type f >> files.list
sed -i "s|%{buildroot}||" *.list

%files -f files.list
