Name: cockpit-app-freeipa
Version: 1
Release: 0
Summary: FreeIPA installer for Cockpit
License: LGPLv2.1+

Source: cockpit-app-freeipa.tar.gz
BuildArch: noarch

%define debug_package %{nil}

%description
FreeIPA installer for Cockpit

%prep

%build

%install
mkdir -p %{buildroot}/usr/share/cockpit/app-freeipa
tar --strip-components=1 -xzf %{sources} -C %{buildroot}/usr/share/cockpit/app-freeipa
find %{buildroot} -type f >> files.list
sed -i "s|%{buildroot}||" *.list

%files -f files.list
