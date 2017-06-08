import React from "react";
import $ from "jquery";

import cockpit from "cockpit";
import dialog from "cockpit-components-dialog.jsx"

import "./freeipa.css";
import "table.css";

function left_click(fun) {
    return function (event) {
        if (!event || event.button !== 0)
            return;
        event.stopPropagation();
        return fun(event);
    };
}

/* STATUS */

class Status extends React.Component {
    constructor() {
        super();
        this.state = { action: null };
    }

    componentDidMount() {
        this.update();
    }

    update() {
        this.setState({ running: true,
                        action: "Checking status",
                        status: null, failure: null, needs_config: null });
        cockpit.spawn([ "ipactl", "status" ], { superuser: true, err: "message" })
               .done(output => {
                   this.setState({ running: false, status: output });
                   console.log(output);
               })
               .fail((error) => {
                   if (error.exit_status == 4) {
                       this.setState({ running: false, needs_config: true });
                   } else {
                       this.setState({ running: false,
                                       failure_title: "Checking the status failed",
                                       failure: error.message });
                   }
               });
    }

    start() {
        this.setState({ running: true,
                        action: "Starting",
                        failure: null });
        cockpit.spawn([ "ipactl", "start" ], { superuser: true, err: "message" })
               .done(output => {
                   console.log(output);
                   this.update();
               })
               .fail((error) => {
                   this.setState({ running: false,
                                   failure_title: "Starting failed",
                                   failure: error.message });
               });
    }

    stop() {
        this.setState({ running: true,
                        action: "Stopping",
                        failure: null, needs_upgrade: null });
        cockpit.spawn([ "ipactl", "stop" ], { superuser: true, err: "message" })
               .done(output => {
                   console.log(output);
                   this.update();
               })
               .fail((error) => {
                   this.setState({ running: false,
                                   failure_title: "Stopping failed",
                                   failure: error.message });
               });
    }

    render() {
        var self = this;
        var status;

        function show_setup_dialog() {
            setup_dialog(() => {
                self.update();
            });
        }

        if (this.state.running) {
            status = (
                <center>
                    <div>{this.state.action}</div>
                    <div className="spinner"/>
                </center>
            );
        } else if (this.state.needs_config) {
            status = (
                <center>
                    <div>FreeIPA needs to be setup.</div>
                    <button className="btn btn-primary" onClick={left_click(show_setup_dialog)}>Setup</button>
                </center>
            );
        } else if (this.state.failure) {
            status = (
                <div className="alert alert-danger">
                    <span className="pficon pficon-error-circle-o"/>
                    <strong>{ this.state.failure_title }</strong>
                    <pre>{ this.state.failure }</pre>
                </div>
            );
        } else {
            status = (
                <pre>{this.state.status}</pre>
            );
        }

        return (
            <div>
                <div className="pull-right">
                    <button className="btn btn-default"
                            onClick={left_click(() => { this.start(); })}>
                        Start
                    </button>
                    <button className="btn btn-default"
                            onClick={left_click(() => { this.stop(); })}>
                        Stop
                    </button>
                    <button className="btn btn-default fa fa-refresh"
                            onClick={left_click(() => { this.update(); })}/>
                </div>
                <h1>FreeIPA</h1>
                {status}
            </div>
        );
    }
}

/* SETUP */

function setup(options) {
    return cockpit.spawn([ "ipa-server-install",
                           "-U",
                           "-r", options.realm,
                           "-p", options.dirmanpw,
                           "-a", options.adminpw ],
                         { superuser: true,
                           err: "message"
                         }).
                   stream((data) => { console.log(data); });
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

    function apply() {
        return validate().then(function () {
            if (errors) {
                return cockpit.reject();
            } else {
                return setup(values);
            }
        });
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
    React.render(<App/>, $('body')[0]);
    $('body').show();
});
