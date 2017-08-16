import React from "react";
import $ from "jquery";

import cockpit from "cockpit";
import dialog from "cockpit-components-dialog.jsx"
import OnOff from "cockpit-components-onoff.jsx"

import "./freeipa.css";
import "table.css";

/* UTILITIES */

function left_click(fun) {
    return function (event) {
        if (!event || event.button !== 0)
            return;
        event.stopPropagation();
        return fun(event);
    };
}

function show_error(text) {
    dialog.show_modal_dialog(
        {
            title: "Error",
            body: (
                <div className="modal-body">
                    <p>{text}</p>
                </div>
            )
        },
        {
            cancel_caption: "Close",
            actions: [ ]
        });
}

/* FIREWALL */

class FirewallPorts extends React.Component {
    constructor() {
        super();
        this.state = { };
    }

    componentDidMount() {
        var self = this;

        self.firewalld = cockpit.dbus("org.fedoraproject.FirewallD1");
        self.zone = self.firewalld.proxy("org.fedoraproject.FirewallD1.zone",
                                         "/org/fedoraproject/FirewallD1");
        self.props.ports.forEach(p => {
            self.zone.call("queryService", [ "", p ]).
                 done(r => {
                     var s = { }; s[p] = r[0];
                     self.setState(s);
                 });
        });

        $(self.zone).on("ServiceAdded", (event, zone, service) => {
            // XXX - we ignore zone
            if (service in self.state) {
                var s = { }; s[service] = true;
                self.setState(s);
            }
        });

        $(self.zone).on("ServiceRemoved", (event, zone, service) => {
            // XXX - we ignore zone
            if (service in self.state) {
                var s = { }; s[service] = false;
                self.setState(s);
            }
        });
    }

    render() {
        var self = this;

        function row(p) {
            function toggle(val) {
                // XXX - this only affects the runtime config
                if (val) {
                    self.zone.call("addService", [ "", p, 0 ]).
                         fail(err => {
                             console.warn("Failed to open port", p, err.message || err);
                         });
                } else {
                    self.zone.call("removeService", [ "", p ]).
                         fail(err => {
                             console.warn("Failed to close port", p, err.message || err);
                         });
                }
            }

            return (
                <tr>
                    <td>{p}</td>
                    <td>
                        { self.state[p] === undefined? null : <OnOff.OnOffSwitch state={self.state[p]}
                                                                                 onChange={toggle}/>
                        }
                    </td>
                </tr>
            );
        }

        return (
            <div>
                <h3>Network Ports</h3>
                <table className="port-status-table">
                    { this.props.ports.map(row) }
                </table>
            </div>
        );
    }
}

/* STATUS */

function parse_ipactl_status(text, conf) {
    var config_re = /^(.+)=(.+)$/;
    var config = { };

    conf.split("\n").forEach(l => {
        var m = config_re.exec(l);
        if (m)
            config[m[1].trim()] = m[2].trim();
    });

    var service_re = /^(.+) Service: (.+)$/;
    var services = [ ];
    var stopped = true;

    text.split("\n").forEach(l => {
        var m = service_re.exec(l);
        if (m) {
            var name = m[1];
            var unit;
            var status, status_class;

            if (name == "Directory" && config.realm)
                name = "dirsrv@" + config.realm;

            // XXX - ipctl should tell us the unit
            unit = name + ".service";

            status = status_class = m[2];
            if (status_class == "RUNNING")
                status = "Running";
            else if (status_class == "STOPPED")
                status = "Not running";

            services.push({ name: name, unit: unit,
                            status: status, status_class: status_class });
            if (m[2] != "STOPPED")
                stopped = false;
        }
    });

    return {
        stopped: stopped,
        services: services,
        config: config
    };
}

class ServiceStatus extends React.Component {
    render() {
        var status = this.props.status;
        return (
            <div>
                <p>The FreeIPA web interface can be accessed at <a href={"https://" + status.config.host}>
                    {status.config.host}</a>
                </p>
                <h3>Services</h3>
                <table className="service-status-table">
                    { status.services.map(s => (
                          <tr>
                              <td>
                                  <a onClick={left_click(() => {
                                      cockpit.jump("system/services#/" + encodeURIComponent(s.unit));
                                      })}>
                                      {s.name}
                                  </a>
                              </td>
                              <td className={s.status_class}>{s.status}</td>
                          </tr>
                      ))
                    }
                </table>
            </div>
        );
    }
}

class Status extends React.Component {
    constructor() {
        super();
        this.state = { status: null, action: null };
    }

    componentDidMount() {
        this.update_status();
    }

    update_status() {
        this.setState({ status: { running: true } });
        cockpit.spawn([ "ipactl", "status" ], { superuser: true, err: "message" })
               .done(output => {
                   cockpit.file("/etc/ipa/default.conf").read().done(config => {
                       this.setState({ status: parse_ipactl_status(output, config) });
                   });
               })
               .fail((error) => {
                   if (error.exit_status == 4) {
                       this.setState({ status: { needs_config: true } });
                   } else {
                       this.setState({ status: { failure: error.message } });
                   }
               });
    }

    start() {
        this.setState({ action: { running: true,
                                  title: "Starting" } });
        cockpit.spawn([ "ipactl", "start" ], { superuser: true, err: "message" })
               .done(() => {
                   this.setState({ action: { } });
                   this.update_status();
               })
               .fail((error) => {
                   this.setState({ action: { } });
                   show_error(error.message);
                   this.update_status();
               });
    }

    stop() {
        this.setState({ action: { running: true,
                                  title: "Stopping" } });
        cockpit.spawn([ "ipactl", "stop" ], { superuser: true, err: "message" })
               .done(() => {
                   this.setState({ action: { } });
                   this.update_status();
               })
               .fail((error) => {
                   this.setState({ action: { } });
                   show_error(error.message);
                   this.update_status();
               });
    }

    render() {
        var self = this;

        function show_setup_dialog() {
            setup_dialog(() => {
                self.update_status();
            });
        }

        // XXX - hard coded
        // XXX - just use freeipa-ldap?
        var ports = [ "http", "https", "ldap", "ldaps", "kerberos", "kpasswd", "ntp" ];

        var status = this.state.status;

        if (!status || status.running)
            return <div className="spinner spinner-lg status-spinner"/>;

        if (status.needs_config)
            return (
                <center className="setup-message">
                    <p><img src="logo-big.png"/></p>
                    <p>FreeIPA needs to be setup before it can be used</p>
                    <p><button className="btn btn-primary"
                               onClick={left_click(show_setup_dialog)}>
                        Run Initial Setup
                    </button></p>
                </center>
            );

        var status_text;
        var status_button;
        if (status.failure) {
            status_text = (
                <span>There was an error while checking the status. <a onClick={left_click(() => show_error(status.failure))}>More..</a></span>
            );
            status_button = null;
        } else if (this.state.action && this.state.action.running) {
            status_text = null;
            status_button = (
                <div className="spinner"/>
            );
        } else if (status.stopped) {
            status_text = "Stopped";
            status_button = (
                <button className="btn btn-default"
                        onClick={left_click(() => { this.start(); })}>
                    Start
                </button>
            );
        } else {
            status_text = "Running";
            status_button = (
                <button className="btn btn-default"
                        onClick={left_click(() => { this.stop(); })}>
                    Stop
                </button>
            );
        }

        return (
            <div>
                <table className="table header">
                    <tbody>
                        <tr>
                            <td><img src="logo.png"/></td>
                            <td>FreeIPA</td>
                            <td>{status_text}</td>
                            { status_button? <td>{status_button}</td> : null }
                        </tr>
                    </tbody>
                </table>
                <div>
                    <div className="pull-right">
                        <FirewallPorts ports={ports}/>
                    </div>
                    <ServiceStatus status={status}/>
                </div>
            </div>
        );
    }
}

/* SETUP */

function setup(options, progress_cb) {
    var outbuf = "";
    var cur_title, cur_perc, progress;
    var perc_re = /^ {2}\[(\d+)\/(\d+)\]/;

    function parse_progress(data) {
        outbuf += data;
        var lines = outbuf.split("\n");
        for (var i = 0; i < lines.length-1; i++) {
            var m = perc_re.exec(lines[i]);
            if (m) {
                cur_perc = parseInt(m[1])/parseInt(m[2]) * 100;
            } else {
                cur_title = lines[i];
            }
        }
        if (cur_title) {
            progress = cur_title;
            if (cur_perc)
                progress += " / " + cur_perc.toFixed(0) + "%";
            progress_cb(progress);
        }
        outbuf = lines[lines.length-1];
    }

    var promise = cockpit.spawn([ "ipa-server-install",
                                  "-U",
                                  "-r", options.realm,
                                  "-p", options.dirmanpw,
                                  "-a", options.adminpw ],
                                { superuser: true,
                                  err: "message"
                                });

    promise.stream(parse_progress);
    promise.cancel = () => {
        console.log("cancelling");
        promise.close("terminated");
    };

    return promise;
}

class Validated extends React.Component {
    render() {
        var error = this.props.errors && this.props.errors[this.props.error_key];
        // We need to always render the <div> for the has-error
        // class so that the input field keeps the focus when
        // errors are cleared.  Otherwise the DOM changes enough
        // for the Browser to remove focus.
        return (
            <div className={error? "has-error" : ""}>
                {this.props.children}
                {error? <span className="help-block">{error}</span> : null}
            </div>
        );
    }
}

class SetupBody extends React.Component {
    render() {
        var props = this.props;

        function input_box(field, type) {
            return (
                <Validated errors={props.errors} error_key={field}>
                    <input className="form-control" type={type}
                           value={props.values[field]}
                           onChange={
                               (event) => {
                                   props.values[field] = event.target.value;
                                   props.onchanged();
                               }}/>
                </Validated>
            );
        }

        function dialog_row(title, field, type) {
            return (
                <tr>
                    <td className="top">
                        <label className="control-label">{title}</label>
                    </td>
                    <td>
                        { input_box(field, type) }
                    </td>
                </tr>
            );
        }

        return (
            <div className="modal-body">
                <table className="form-table-ct">
                    { dialog_row("Realm", 'realm', 'text') }
                    { dialog_row("Directory Manager password", 'dirmanpw', 'password') }
                    { dialog_row("Confirm Directory Manager password", 'dirmanpw2', 'password') }
                    { dialog_row("Admin password", 'adminpw', 'password') }
                    { dialog_row("Confirm Admin password", 'adminpw2', 'password') }
                </table>
            </div>
        );
    }
}

function setup_dialog(done_callback) {
    var dlg;

    var errors = null;
    var values = {
        realm: "",
        dirmanpw: "",
        dirmanpw2: "",
        adminpw: "",
        adminpw2: ""
    };

    function onchanged() {
        if (errors) {
            errors = null;
            update();
        }
    }

    function body_props() {
        return {
            title: "Setup FreeIPA",
            body: <SetupBody values={values}
                             errors={errors}
                             onchanged={onchanged}/>
        };
    }

    function update() {
        dlg.setProps(body_props());
    }

    function validate() {
        errors = { };

        if (!values.realm)
            errors.realm = "Realm can't be empty";

        function validate_password(field, field2) {
            if (!values[field])
                errors[field] = "Password can't be empty";
            if (values[field].length < 8)
                errors[field] = "Password must be at least 8 characters";
            if (values[field] && values[field2] != values[field])
                errors[field2] = "Passwords don't match";
        }

        validate_password('dirmanpw', 'dirmanpw2');
        validate_password('adminpw', 'adminpw2');

        if (Object.keys(errors).length === 0)
            errors = null;

        update();
        return cockpit.resolve();
    }

    function apply(progress_cb) {
        var dfd = cockpit.defer();
        var promise = dfd.promise();

        var setup_promise;
        var cancelled = false;

        validate().
                   done(function () {
                       if (cancelled) {
                           cockpit.reject();
                       } else {
                           setup_promise = setup(values, progress_cb);
                           setup_promise.
                                         done(function () {
                                             dfd.resolve();
                                         }).
                                         fail(function (error) {
                                             dfd.reject(error);
                                         });
                       }

                   }).
                   fail(function(error) {
                       dfd.reject(error);
                   });

        promise.cancel = function() {
            if (setup_promise)
                setup_promise.close("terminated");
            cancelled = true;
        }

        return promise;
    }

    dlg = dialog.show_modal_dialog(
        body_props(),
        {
            actions: [ { 'clicked': apply,
                         'caption': "Setup",
                         'style': 'primary' } ],
            dialog_done: done_callback
        }
    );
}

/* MAIN */

class App extends React.Component {
    render() {
        return (
            <div className="container-fluid">
                <Status/>
            </div>
        );
    }
}

$(function () {
    React.render(<App/>, $('#app')[0]);
    $('body').show();
});
