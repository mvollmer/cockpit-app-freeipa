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
            <table className="port-status-table">
                { this.props.ports.map(row) }
            </table>
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
            var status = m[2];

            if (name == "Directory" && config.realm)
                name = "dirsrv@" + config.realm;

            // XXX - ipctl should tell us the unit
            unit = name + ".service";

            services.push({ name: name, unit: unit, status: status });
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
                       console.log(config);
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
               .done(output => {
                   this.setState({ action: { output: output } });
                   this.update_status();
               })
               .fail((error) => {
                   this.setState({ action: {failure_title: "Starting failed",
                                            failure: error.message } });
                   this.update_status();
               });
    }

    stop() {
        this.setState({ action: { running: true,
                                  title: "Stopping" } });
        cockpit.spawn([ "ipactl", "stop" ], { superuser: true, err: "message" })
               .done(output => {
                   this.setState({ action: { output: output } });
                   this.update_status();
               })
               .fail((error) => {
                   this.setState({ action: { failure_title: "Stopping failed",
                                             failure: error.message } });
                   this.update_status();
               });
    }

    render() {
        var self = this;
        var status, status_elt;
        var action, action_progress, action_error;

        console.log(self.state.status);

        function show_setup_dialog() {
            setup_dialog(() => {
                self.update_status();
            });
        }

        // XXX - hard coded
        // XXX - just use freeipa-ldap?
        var ports = [ "http", "https", "ldap", "ldaps", "kerberos", "kpasswd", "ntp" ];

        status = this.state.status;
        if (status) {
            if (status.running) {
                status_elt = (
                    <div className="spinner"/>
                );
            } else if (status.needs_config) {
                status_elt = (
                    <div>
                        <h2>FreeIPA needs to be setup.</h2>
                        <button className="btn btn-primary" onClick={left_click(show_setup_dialog)}>Setup</button>
                    </div>
                );
            } else if (status.failure) {
                status_elt = (
                    <div className="alert alert-danger">
                        <span className="pficon pficon-error-circle-o"/>
                        <strong>There was an error while checking the status</strong>
                        <pre>{status.failure}</pre>
                    </div>
                );
            } else if (status.stopped) {
                status_elt = (
                    <div>
                        <h2>FreeIPA for <b>{status.config.realm}</b> is stopped.</h2>
                        <h3>Network ports</h3>
                        <FirewallPorts ports={ports}/>
                    </div>
                );
            } else {
                status_elt = (
                    <div>
                        <h2>FreeIPA for <b>{status.config.realm}</b> is running.</h2>
                        <p>The FreeIPA web interface can be accessed at <a href={"https://" + status.config.host}>
                            {status.config.host}</a></p>
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
                                      <td className={s.status}>{s.status}</td>
                                  </tr>
                              ))
                            }
                        </table>
                        <h3>Network ports</h3>
                        <FirewallPorts ports={ports}/>
                    </div>
                );
            }
        }

        action = this.state.action;
        if (action) {
            if (action.running) {
                action_progress = (
                    <span className="action-progress">
                        {action.title}
                        <span className="spinner spinner-sm spinner-inline"/>
                    </span>
                );
                action_error = null;
            } else if (action.failure) {
                action_progress = null
                action_error = (
                    <div className="alert alert-danger">
                        <span className="pficon pficon-error-circle-o"/>
                        <strong>{action.failure_title}</strong>
                        <pre>{action.failure}</pre>
                    </div>
                );
            } else {
                action_progress = null;
                action_error = null;
            }
        }

        return (
            <div>
                <div className="pull-right">
                    {action_progress}
                    <button className="btn btn-default"
                            onClick={left_click(() => { this.start(); })}>
                        Start
                    </button>
                    <button className="btn btn-default"
                            onClick={left_click(() => { this.stop(); })}>
                        Stop
                    </button>
                    <button className="btn btn-default fa fa-refresh"
                            onClick={left_click(() => {
                                    self.setState({ action: null });
                                    this.update_status();
                                })}/>
                </div>
                <h1>FreeIPA</h1>
                <center>
                    {action_error}
                    {status_elt}
                </center>
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
